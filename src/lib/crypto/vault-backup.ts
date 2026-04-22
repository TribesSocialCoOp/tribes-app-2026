/**
 * @fileoverview Encrypted vault backup and restore for bond private keys.
 * Phase 2B: Multi-device key recovery.
 *
 * Flow:
 * 1. User provides a recovery passphrase
 * 2. PBKDF2 stretches the passphrase into an AES-256-GCM encryption key
 * 3. All bond private keys are exported and encrypted as a single vault blob
 * 4. The encrypted vault + salt are stored in the `vault_backups` DB table
 * 5. On a new device, user provides passphrase → vault is decrypted → keys restored
 *
 * Security properties:
 * - Passphrase never leaves the client
 * - PBKDF2 with 600,000 iterations (OWASP 2023 recommendation)
 * - Each backup uses a fresh random salt
 * - The encrypted blob is opaque — server cannot read private keys
 *
 * This module runs ONLY in the browser.
 */

import {
  generateExportableBondKeyPair,
  exportPrivateKey,
  exportPublicKey,
  importPrivateKey,
} from './key-manager';
import {
  getAllBondKeys,
  storeBondKey,
  type StoredBondKey,
} from './key-store';

// ============================================================
// CONSTANTS
// ============================================================

const PBKDF2_ITERATIONS = 600_000; // OWASP 2023 recommended minimum
const PBKDF2_HASH = 'SHA-256';
const AES_KEY_LENGTH = 256;
const SALT_LENGTH = 32; // 256-bit salt

// ============================================================
// VAULT TYPES
// ============================================================

interface VaultEntry {
  bondId: string;
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
  createdAt: number;
}

interface VaultPayload {
  version: 1;
  entries: VaultEntry[];
  exportedAt: number;
}

// ============================================================
// PASSPHRASE → KEY DERIVATION
// ============================================================

/**
 * Derives an AES-256-GCM encryption key from a user passphrase using PBKDF2.
 */
async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  // Import passphrase as raw key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  // PBKDF2 stretch → AES-256-GCM key
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: AES_KEY_LENGTH,
    },
    false, // derived key is non-extractable
    ['encrypt', 'decrypt'],
  );
}

// ============================================================
// VAULT BACKUP
// ============================================================

/**
 * Creates an encrypted vault backup of all bond private keys.
 *
 * This is a two-step process:
 * 1. Collect all keys from IndexedDB and export private keys to JWK
 * 2. Encrypt the entire collection with the passphrase-derived key
 *
 * NOTE: Bond keys must have been generated with `extractable: true` for this
 * to work. For non-extractable keys, a re-generation flow is needed (Phase 2D).
 *
 * @returns The encrypted vault blob and the salt used for derivation
 */
export async function createVaultBackup(
  passphrase: string,
): Promise<{ encryptedVault: ArrayBuffer; salt: string }> {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Recovery passphrase must be at least 8 characters');
  }

  // Collect all stored bond keys
  const storedKeys = await getAllBondKeys();

  if (storedKeys.length === 0) {
    throw new Error('No bond keys to backup');
  }

  // Build vault payload — export private keys to JWK
  const entries: VaultEntry[] = [];
  for (const stored of storedKeys) {
    try {
      const privateKeyJwk = await exportPrivateKey(stored.privateKey);
      entries.push({
        bondId: stored.bondId,
        privateKeyJwk,
        publicKeyJwk: stored.publicKeyJwk,
        createdAt: stored.createdAt,
      });
    } catch {
      // Key might be non-extractable — skip it
      console.warn(`[vault] Skipping non-extractable key for bond ${stored.bondId}`);
    }
  }

  if (entries.length === 0) {
    throw new Error('No exportable bond keys found. Keys may need to be regenerated.');
  }

  const payload: VaultPayload = {
    version: 1,
    entries,
    exportedAt: Date.now(),
  };

  // Serialize and encrypt
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await deriveKeyFromPassphrase(passphrase, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  );

  // Pack: [12 bytes IV][ciphertext]
  const packed = new Uint8Array(iv.length + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), iv.length);

  // Encode salt as hex for storage
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');

  return {
    encryptedVault: packed.buffer,
    salt: saltHex,
  };
}

// ============================================================
// VAULT RESTORE
// ============================================================

/**
 * Restores bond private keys from an encrypted vault backup.
 *
 * @param encryptedVault The encrypted vault blob
 * @param salt The hex-encoded salt used during backup
 * @param passphrase The user's recovery passphrase
 * @returns Map of bondId → restored CryptoKey (non-extractable)
 */
export async function restoreVaultBackup(
  encryptedVault: ArrayBuffer,
  salt: string,
  passphrase: string,
): Promise<Map<string, CryptoKey>> {
  // Decode salt from hex
  const saltBytes = new Uint8Array(
    salt.match(/.{2}/g)!.map(byte => parseInt(byte, 16)),
  );

  // Derive the same key from passphrase + salt
  const key = await deriveKeyFromPassphrase(passphrase, saltBytes);

  // Unpack: [12 bytes IV][ciphertext]
  const packed = new Uint8Array(encryptedVault);
  const iv = packed.slice(0, 12);
  const ciphertext = packed.slice(12);

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );
  } catch {
    throw new Error('Invalid passphrase or corrupted vault');
  }

  // Parse the vault payload
  const payload: VaultPayload = JSON.parse(new TextDecoder().decode(plaintext));

  if (payload.version !== 1) {
    throw new Error(`Unsupported vault version: ${payload.version}`);
  }

  // Import each private key (as non-extractable) and store in IndexedDB
  const restoredKeys = new Map<string, CryptoKey>();

  for (const entry of payload.entries) {
    try {
      const privateKey = await importPrivateKey(entry.privateKeyJwk);
      restoredKeys.set(entry.bondId, privateKey);

      // Persist to IndexedDB
      await storeBondKey(entry.bondId, privateKey, entry.publicKeyJwk);
    } catch (err) {
      console.warn(`[vault] Failed to restore key for bond ${entry.bondId}:`, err);
    }
  }

  return restoredKeys;
}

/**
 * Validates a passphrase meets minimum requirements.
 */
export function validatePassphrase(passphrase: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (passphrase.length < 8) {
    errors.push('Passphrase must be at least 8 characters');
  }
  if (passphrase.length > 128) {
    errors.push('Passphrase must be at most 128 characters');
  }
  if (!/[A-Z]/.test(passphrase)) {
    errors.push('Passphrase should contain at least one uppercase letter');
  }
  if (!/[0-9]/.test(passphrase)) {
    errors.push('Passphrase should contain at least one number');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
