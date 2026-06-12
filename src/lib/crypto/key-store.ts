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
  storeKey: string;    // Composite: `${bondId}_${peerKeyHash}`
  bondId: string;
  sharedSecret: CryptoKey; // Non-extractable AES-256-GCM key
  derivedAt: number; // timestamp ms
  peerKeyHash: string; // SHA-256 hex of peer's public JWK
  localKeyHash: string; // SHA-256 hex of OUR public JWK
  isCurrent: boolean;  // true if this is the active key for new messages
}

export interface StoredTribeKey {
  tribeId: string;
  key: CryptoKey; // AES-256-GCM symmetric key (extractable for wrapping)
  version: number;
  receivedAt: number; // timestamp ms
}

export interface StoredIdentityKey {
  userId: string;
  privateKey: CryptoKey;
  publicKeyJwk: JsonWebKey;
  createdAt: number;
}

export interface StoredVaultWrappingKey {
  credentialId: string;
  /** Non-extractable AES-256-GCM PRF-derived wrapping key */
  wrappingKey: CryptoKey;
  /** Owner — the key must never be used for a different logged-in user */
  userId: string;
  savedAt: number;
}

// ============================================================
// DATABASE SETUP
// ============================================================

const DB_NAME = 'tribes_keystore';
const DB_VERSION = 5; // 1: bond_keys, 2: shared_secrets, 3: identity_keys, 4: multi-version shared_secrets, 5: vault_keys
const BOND_KEYS_STORE = 'bond_keys';
const SHARED_SECRETS_STORE = 'shared_secrets';
const TRIBE_KEYS_STORE = 'tribe_keys';
const IDENTITY_KEYS_STORE = 'identity_keys';
const VAULT_KEYS_STORE = 'vault_keys';


/**
 * Opens (or creates) the IndexedDB database.
 * Handles version upgrades for schema evolution.
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      // V1: bond_keys store
      if (!db.objectStoreNames.contains(BOND_KEYS_STORE)) {
        db.createObjectStore(BOND_KEYS_STORE, { keyPath: 'bondId' });
      }

      // V2: shared_secrets store (pre-derived ECDH shared secrets)
      // V4: Recreation with composite keyPath
      if (oldVersion < 4 && db.objectStoreNames.contains(SHARED_SECRETS_STORE)) {
        db.deleteObjectStore(SHARED_SECRETS_STORE);
      }
      if (!db.objectStoreNames.contains(SHARED_SECRETS_STORE)) {
        const store = db.createObjectStore(SHARED_SECRETS_STORE, { keyPath: 'storeKey' });
        store.createIndex('bondId', 'bondId', { unique: false });
      }

      // V2: tribe_keys store (group symmetric keys)
      if (!db.objectStoreNames.contains(TRIBE_KEYS_STORE)) {
        db.createObjectStore(TRIBE_KEYS_STORE, { keyPath: 'tribeId' });
      }

      // V3: identity_keys store (RSA identity keys)
      if (!db.objectStoreNames.contains(IDENTITY_KEYS_STORE)) {
        db.createObjectStore(IDENTITY_KEYS_STORE, { keyPath: 'userId' });
      }

      // V5: vault_keys store (PRF-derived vault wrapping keys, persisted so
      // background vault sync works across sessions without re-auth)
      if (!db.objectStoreNames.contains(VAULT_KEYS_STORE)) {
        db.createObjectStore(VAULT_KEYS_STORE, { keyPath: 'credentialId' });
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
    const tx = db.transaction(BOND_KEYS_STORE, 'readwrite');
    const store = tx.objectStore(BOND_KEYS_STORE);

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
    const tx = db.transaction(BOND_KEYS_STORE, 'readonly');
    const store = tx.objectStore(BOND_KEYS_STORE);
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
    const tx = db.transaction(BOND_KEYS_STORE, 'readwrite');
    const store = tx.objectStore(BOND_KEYS_STORE);
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
    const tx = db.transaction(BOND_KEYS_STORE, 'readonly');
    const store = tx.objectStore(BOND_KEYS_STORE);
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
    const tx = db.transaction(BOND_KEYS_STORE, 'readonly');
    const store = tx.objectStore(BOND_KEYS_STORE);
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
    const tx = db.transaction(BOND_KEYS_STORE, 'readwrite');
    const store = tx.objectStore(BOND_KEYS_STORE);

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
    const tx = db.transaction(BOND_KEYS_STORE, 'readwrite');
    const store = tx.objectStore(BOND_KEYS_STORE);
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
    const tx = db.transaction(BOND_KEYS_STORE, 'readonly');
    const store = tx.objectStore(BOND_KEYS_STORE);
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
 *
 * NOTE: JWK properties are sorted before serialization to ensure deterministic
 * hashes. Without this, the same key round-tripped through JSON.stringify/parse
 * (e.g., stored on the server) could produce different property orderings and
 * cause false-positive mismatch detections.
 */
export async function hashPublicKeyJwk(jwk: JsonWebKey): Promise<string> {
  const sorted = Object.keys(jwk).sort().reduce((acc, key) => {
    acc[key] = (jwk as Record<string, unknown>)[key];
    return acc;
  }, {} as Record<string, unknown>);
  const encoded = new TextEncoder().encode(JSON.stringify(sorted));
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
  localKeyHash: string = '',
  isCurrent: boolean = true,
): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARED_SECRETS_STORE, 'readwrite');
    const store = tx.objectStore(SHARED_SECRETS_STORE);

    // If inserting as current, first demote any existing current entries for this bond
    if (isCurrent) {
      const index = store.index('bondId');
      const cursorReq = index.openCursor(IDBKeyRange.only(bondId));
      cursorReq.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const existing = cursor.value as CachedSharedSecret;
          if (existing.isCurrent && existing.storeKey !== `${bondId}_${peerKeyHash}`) {
            existing.isCurrent = false;
            cursor.update(existing);
          }
          cursor.continue();
        } else {
          // Cursor exhausted — now insert the new entry
          putEntry();
        }
      };
      cursorReq.onerror = () => reject(new Error(`Failed to demote old secrets for bond ${bondId}`));
    } else {
      putEntry();
    }

    function putEntry() {
      const entry: CachedSharedSecret = {
        storeKey: `${bondId}_${peerKeyHash}`,
        bondId,
        sharedSecret,
        derivedAt: Date.now(),
        peerKeyHash,
        localKeyHash,
        isCurrent,
      };

      const request = store.put(entry);
      request.onerror = () => reject(new Error(`Failed to cache shared secret for bond ${bondId}`));
      // resolve via tx.oncomplete
    }

    tx.oncomplete = () => { db.close(); resolve(); };
  });
}

/**
 * Marks an existing shared secret as no longer current.
 * Used when a peer rotates their key.
 */
export async function markSharedSecretHistorical(bondId: string, peerKeyHash: string): Promise<void> {
  const db = await openDatabase();
  const storeKey = `${bondId}_${peerKeyHash}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARED_SECRETS_STORE, 'readwrite');
    const store = tx.objectStore(SHARED_SECRETS_STORE);

    const getReq = store.get(storeKey);
    getReq.onsuccess = () => {
      const entry = getReq.result as CachedSharedSecret;
      if (entry) {
        entry.isCurrent = false;
        store.put(entry);
      }
      resolve();
    };
    getReq.onerror = () => reject(new Error(`Failed to mark historical: ${storeKey}`));
    tx.oncomplete = () => db.close();
  });
}

/**
 * Retrieves the CURRENT cached shared secret for a bond.
 * Returns null if no current secret is cached.
 */
export async function getSharedSecret(bondId: string): Promise<CachedSharedSecret | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARED_SECRETS_STORE, 'readonly');
    const store = tx.objectStore(SHARED_SECRETS_STORE);
    const index = store.index('bondId');
    const request = index.openCursor(IDBKeyRange.only(bondId));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const entry = cursor.value as CachedSharedSecret;
        if (entry.isCurrent) {
          resolve(entry);
          return;
        }
        cursor.continue();
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(new Error(`Failed to get shared secret for bond ${bondId}`));

    tx.oncomplete = () => db.close();
  });
}

/**
 * Retrieves all HISTORICAL (non-current) shared secrets for a bond.
 */
export async function getHistoricalSharedSecrets(bondId: string): Promise<CachedSharedSecret[]> {
  const db = await openDatabase();
  const results: CachedSharedSecret[] = [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARED_SECRETS_STORE, 'readonly');
    const store = tx.objectStore(SHARED_SECRETS_STORE);
    const index = store.index('bondId');
    const request = index.openCursor(IDBKeyRange.only(bondId));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const entry = cursor.value as CachedSharedSecret;
        if (!entry.isCurrent) {
          results.push(entry);
        }
        cursor.continue();
      } else {
        resolve(results.sort((a, b) => b.derivedAt - a.derivedAt));
      }
    };
    request.onerror = () => reject(new Error(`Failed to get historical secrets for bond ${bondId}`));

    tx.oncomplete = () => db.close();
  });
}

/**
 * Retrieves all shared secrets for a bond (current and historical).
 */
export async function getAllSharedSecretsForBond(bondId: string): Promise<CachedSharedSecret[]> {
  const db = await openDatabase();
  const results: CachedSharedSecret[] = [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARED_SECRETS_STORE, 'readonly');
    const store = tx.objectStore(SHARED_SECRETS_STORE);
    const index = store.index('bondId');
    const request = index.getAll(IDBKeyRange.only(bondId));

    request.onsuccess = () => {
      resolve((request.result as CachedSharedSecret[]).sort((a, b) => b.derivedAt - a.derivedAt));
    };
    request.onerror = () => reject(new Error(`Failed to list secrets for bond ${bondId}`));

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
 * Deletes ALL cached shared secrets for a bond (current and historical).
 * Called when a bond is revoked or keys are being regenerated from scratch.
 *
 * Uses the bondId index since the store's keyPath is the composite 'storeKey'.
 */
export async function deleteSharedSecret(bondId: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARED_SECRETS_STORE, 'readwrite');
    const store = tx.objectStore(SHARED_SECRETS_STORE);
    const index = store.index('bondId');
    const request = index.openCursor(IDBKeyRange.only(bondId));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
      // resolve is handled by tx.oncomplete
    };
    request.onerror = () => reject(new Error(`Failed to delete shared secrets for bond ${bondId}`));

    tx.oncomplete = () => { db.close(); resolve(); };
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

// ============================================================
// IDENTITY KEY STORE (Phase 0 — Identification)
// ============================================================

/**
 * Stores the user's RSA identity private key and public JWK.
 */
export async function storeIdentityKey(
  userId: string,
  privateKey: CryptoKey,
  publicKeyJwk: JsonWebKey,
): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDENTITY_KEYS_STORE, 'readwrite');
    const store = tx.objectStore(IDENTITY_KEYS_STORE);

    const entry: StoredIdentityKey = {
      userId,
      privateKey,
      publicKeyJwk,
      createdAt: Date.now(),
    };

    const request = store.put(entry);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to store identity key for ${userId}`));

    tx.oncomplete = () => db.close();
  });
}

/**
 * Retrieves the user's RSA identity key entry.
 */
export async function getIdentityKey(userId: string): Promise<StoredIdentityKey | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDENTITY_KEYS_STORE, 'readonly');
    const store = tx.objectStore(IDENTITY_KEYS_STORE);
    const request = store.get(userId);

    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(new Error(`Failed to get identity key for ${userId}`));

    tx.oncomplete = () => db.close();
  });
}

// ============================================================
// VAULT WRAPPING KEY STORE (PRF auto-sync)
// ============================================================

/**
 * Persists the PRF-derived vault wrapping key so background vault sync
 * keeps working after page reloads / app restarts without a new passkey
 * ceremony. The key is non-extractable — IndexedDB stores an opaque handle,
 * the same protection level as the bond private keys stored alongside it.
 */
export async function storeVaultWrappingKey(
  credentialId: string,
  wrappingKey: CryptoKey,
  userId: string,
): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(VAULT_KEYS_STORE, 'readwrite');
    const store = tx.objectStore(VAULT_KEYS_STORE);

    const entry: StoredVaultWrappingKey = {
      credentialId,
      wrappingKey,
      userId,
      savedAt: Date.now(),
    };

    const request = store.put(entry);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to store vault wrapping key'));

    tx.oncomplete = () => db.close();
  });
}

/**
 * Returns the most recently saved vault wrapping key for the given user, or null.
 * Entries belonging to other users (e.g., a previous login on a shared browser)
 * are never returned — using them would leak keys across accounts.
 */
export async function getVaultWrappingKey(userId: string): Promise<StoredVaultWrappingKey | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(VAULT_KEYS_STORE, 'readonly');
    const store = tx.objectStore(VAULT_KEYS_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const all = ((request.result ?? []) as StoredVaultWrappingKey[])
        .filter(k => k.userId === userId);
      if (all.length === 0) {
        resolve(null);
        return;
      }
      all.sort((a, b) => b.savedAt - a.savedAt);
      resolve(all[0]);
    };
    request.onerror = () => reject(new Error('Failed to get vault wrapping key'));

    tx.oncomplete = () => db.close();
  });
}

/**
 * Removes all persisted vault wrapping keys (e.g., on logout).
 */
export async function clearVaultWrappingKeys(): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(VAULT_KEYS_STORE, 'readwrite');
    const store = tx.objectStore(VAULT_KEYS_STORE);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to clear vault wrapping keys'));

    tx.oncomplete = () => db.close();
  });
}

