/**
 * @fileoverview IndexedDB-backed secure key store for bond private keys.
 * Phase 2B: Client-Side Key Infrastructure.
 *
 * Stores CryptoKey objects directly in IndexedDB. When keys are created
 * with `extractable: false`, they remain as opaque handles in browser-managed
 * memory — never serialized to plaintext JavaScript strings.
 *
 * Database: 'tribes_keystore'
 * Object Store: 'bond_keys'
 * Key Path: 'bondId'
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

// ============================================================
// DATABASE SETUP
// ============================================================

const DB_NAME = 'tribes_keystore';
const DB_VERSION = 1;
const STORE_NAME = 'bond_keys';

/**
 * Opens (or creates) the IndexedDB database.
 * Handles version upgrades for schema evolution.
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create the bond_keys store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'bondId' });
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
