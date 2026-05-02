/**
 * @fileoverview IndexedDB-backed secure key store for bond private keys,
 * cached shared secrets, and tribe group keys.
 *
 * Stores CryptoKey objects directly in IndexedDB. When keys are created
 * with `extractable: false`, they remain as opaque handles in browser-managed
 * memory — never serialized to plaintext JavaScript strings.
 *
 * Database: 'tribes_keystore'
 * Object Stores:
 *   - 'bond_keys'       (keyPath: bondId)   — ECDH private keys per bond
 *   - 'shared_secrets'  (keyPath: bondId)   — pre-derived AES-256-GCM shared secrets
 *   - 'tribe_keys'      (keyPath: tribeId)  — AES-256-GCM group symmetric keys
 *
 * This module runs ONLY in the browser.
 */

// ============================================================
// TYPES
// ============================================================

export interface StoredBondKey {
  bondId: string;
  privateKey: CryptoKey;
  publicKeyJwk: JsonWebKey; // Stored for convenience (re-export without round-trip)
  createdAt: number; // timestamp ms
  rotatedAt?: number; // timestamp ms of last rotation
}

export interface CachedSharedSecret {
  bondId: string;
  sharedSecret: CryptoKey; // Non-extractable AES-256-GCM key
  derivedAt: number; // timestamp ms
  peerKeyHash: string; // SHA-256 hex of peer's public JWK — detect rotations
}

export interface StoredTribeKey {
  tribeId: string;
  key: CryptoKey; // AES-256-GCM symmetric key (extractable for wrapping)
  version: number;
  receivedAt: number; // timestamp ms
}

// ============================================================
// DATABASE SETUP
// ============================================================

const DB_NAME = 'tribes_keystore';
const DB_VERSION = 2; // Bumped from 1 → 2 for new stores
const BOND_KEYS_STORE = 'bond_keys';
const SHARED_SECRETS_STORE = 'shared_secrets';
const TRIBE_KEYS_STORE = 'tribe_keys';

/** @deprecated Use BOND_KEYS_STORE instead. Kept for compatibility with existing callers. */
const STORE_NAME = BOND_KEYS_STORE;

/**
 * Opens (or creates) the IndexedDB database.
 * Handles version upgrades for schema evolution.
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // V1: bond_keys store
      if (!db.objectStoreNames.contains(BOND_KEYS_STORE)) {
        db.createObjectStore(BOND_KEYS_STORE, { keyPath: 'bondId' });
      }

      // V2: shared_secrets store (pre-derived ECDH shared secrets)
      if (!db.objectStoreNames.contains(SHARED_SECRETS_STORE)) {
        db.createObjectStore(SHARED_SECRETS_STORE, { keyPath: 'bondId' });
      }

      // V2: tribe_keys store (group symmetric keys)
      if (!db.objectStoreNames.contains(TRIBE_KEYS_STORE)) {
        db.createObjectStore(TRIBE_KEYS_STORE, { keyPath: 'tribeId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(`Failed to open keystore: ${request.error?.message}`));
  });
}

// ============================================================
// CRUD OPERATIONS
// ============================================================

/**
 * Stores a bond's private key and public key JWK in IndexedDB.
 * If a key already exists for this bondId, it is overwritten (used during rotation).
 */
export async function storeBondKey(
  bondId: string,
  privateKey: CryptoKey,
  publicKeyJwk: JsonWebKey,
): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const entry: StoredBondKey = {
      bondId,
      privateKey,
      publicKeyJwk,
      createdAt: Date.now(),
    };

    const request = store.put(entry); // put = upsert
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to store key for bond ${bondId}`));

    tx.oncomplete = () => db.close();
  });
}

/**
 * Retrieves the stored key entry for a bond.
 * Returns null if no key exists for this bond (not yet generated or was deleted).
 */
export async function getBondKey(bondId: string): Promise<StoredBondKey | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(bondId);

    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(new Error(`Failed to get key for bond ${bondId}`));

    tx.oncomplete = () => db.close();
  });
}

/**
 * Retrieves ONLY the private CryptoKey for a bond.
 * Convenience wrapper for the common case.
 */
export async function getBondPrivateKey(bondId: string): Promise<CryptoKey | null> {
  const entry = await getBondKey(bondId);
  return entry?.privateKey ?? null;
}

/**
 * Deletes a bond's key material from IndexedDB.
 * Called when a bond is revoked.
 */
export async function deleteBondKey(bondId: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(bondId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to delete key for bond ${bondId}`));

    tx.oncomplete = () => db.close();
  });
}

/**
 * Returns all bond IDs that have stored keys.
 * Used for vault backup and key auditing.
 */
export async function getAllBondKeyIds(): Promise<string[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAllKeys();

    request.onsuccess = () => resolve(request.result as string[]);
    request.onerror = () => reject(new Error('Failed to list bond key IDs'));

    tx.oncomplete = () => db.close();
  });
}

/**
 * Returns all stored bond key entries.
 * Used for vault backup.
 */
export async function getAllBondKeys(): Promise<StoredBondKey[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Failed to list bond keys'));

    tx.oncomplete = () => db.close();
  });
}

/**
 * Marks a bond key as rotated (updates the rotatedAt timestamp).
 * Called after a successful key rotation.
 */
export async function markKeyRotated(bondId: string): Promise<void> {
  const existing = await getBondKey(bondId);
  if (!existing) return;

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const updated: StoredBondKey = {
      ...existing,
      rotatedAt: Date.now(),
    };

    const request = store.put(updated);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to mark rotation for bond ${bondId}`));

    tx.oncomplete = () => db.close();
  });
}

/**
 * Clears ALL keys from the store.
 * Used for account deletion or full key reset.
 */
export async function clearAllKeys(): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to clear keystore'));

    tx.oncomplete = () => db.close();
  });
}

/**
 * Checks if IndexedDB is available.
 */
export function isKeyStoreAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * Checks if the keystore contains any keys.
 * Used during login to determine if a vault restore is necessary.
 */
export async function hasAnyKeys(): Promise<boolean> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.count();

    request.onsuccess = () => resolve(request.result > 0);
    request.onerror = () => reject(new Error('Failed to check keystore status'));

    tx.oncomplete = () => db.close();
  });
}

// ============================================================
// SHARED SECRET CACHE (Phase 2 — Background Key Sync)
// ============================================================

/**
 * Computes a SHA-256 hex hash of a JWK for change detection.
 * Used to detect when a peer has rotated their public key.
 */
export async function hashPublicKeyJwk(jwk: JsonWebKey): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(jwk));
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Stores a pre-derived shared secret for a bond.
 * Used by the background key sync to avoid re-deriving on every compose/chat.
 */
export async function storeSharedSecret(
  bondId: string,
  sharedSecret: CryptoKey,
  peerKeyHash: string,
): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARED_SECRETS_STORE, 'readwrite');
    const store = tx.objectStore(SHARED_SECRETS_STORE);

    const entry: CachedSharedSecret = {
      bondId,
      sharedSecret,
      derivedAt: Date.now(),
      peerKeyHash,
    };

    const request = store.put(entry);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to cache shared secret for bond ${bondId}`));

    tx.oncomplete = () => db.close();
  });
}

/**
 * Retrieves a cached shared secret for a bond.
 * Returns null if no secret is cached (peer key not yet available or key rotated).
 */
export async function getSharedSecret(bondId: string): Promise<CachedSharedSecret | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARED_SECRETS_STORE, 'readonly');
    const store = tx.objectStore(SHARED_SECRETS_STORE);
    const request = store.get(bondId);

    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(new Error(`Failed to get shared secret for bond ${bondId}`));

    tx.oncomplete = () => db.close();
  });
}

/**
 * Retrieves all cached shared secrets.
 * Used by the compose box to quickly look up encryption keys.
 */
export async function getAllSharedSecrets(): Promise<CachedSharedSecret[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARED_SECRETS_STORE, 'readonly');
    const store = tx.objectStore(SHARED_SECRETS_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Failed to list shared secrets'));

    tx.oncomplete = () => db.close();
  });
}

/**
 * Deletes a cached shared secret for a bond.
 * Called when a bond is revoked or a peer key rotates.
 */
export async function deleteSharedSecret(bondId: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARED_SECRETS_STORE, 'readwrite');
    const store = tx.objectStore(SHARED_SECRETS_STORE);
    const request = store.delete(bondId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to delete shared secret for bond ${bondId}`));

    tx.oncomplete = () => db.close();
  });
}

// ============================================================
// TRIBE KEY STORE (Phase 3 — Group Encryption)
// ============================================================

/**
 * Stores a tribe's group symmetric key.
 */
export async function storeTribeKey(
  tribeId: string,
  key: CryptoKey,
  version: number,
): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRIBE_KEYS_STORE, 'readwrite');
    const store = tx.objectStore(TRIBE_KEYS_STORE);

    const entry: StoredTribeKey = {
      tribeId,
      key,
      version,
      receivedAt: Date.now(),
    };

    const request = store.put(entry);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to store tribe key for ${tribeId}`));

    tx.oncomplete = () => db.close();
  });
}

/**
 * Retrieves a tribe's group symmetric key.
 */
export async function getTribeKey(tribeId: string): Promise<StoredTribeKey | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRIBE_KEYS_STORE, 'readonly');
    const store = tx.objectStore(TRIBE_KEYS_STORE);
    const request = store.get(tribeId);

    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(new Error(`Failed to get tribe key for ${tribeId}`));

    tx.oncomplete = () => db.close();
  });
}

/**
 * Retrieves all stored tribe keys.
 */
export async function getAllTribeKeys(): Promise<StoredTribeKey[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRIBE_KEYS_STORE, 'readonly');
    const store = tx.objectStore(TRIBE_KEYS_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Failed to list tribe keys'));

    tx.oncomplete = () => db.close();
  });
}

/**
 * Deletes a tribe's group key from local storage.
 * Called when the user leaves a tribe or the key is rotated.
 */
export async function deleteTribeKey(tribeId: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRIBE_KEYS_STORE, 'readwrite');
    const store = tx.objectStore(TRIBE_KEYS_STORE);
    const request = store.delete(tribeId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to delete tribe key for ${tribeId}`));

    tx.oncomplete = () => db.close();
  });
}
