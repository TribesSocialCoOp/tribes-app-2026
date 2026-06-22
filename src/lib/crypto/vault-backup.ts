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
  exportPrivateKey,
  importPrivateKey,
} from './key-manager';
import {
  getAllBondKeys,
  getBondKey,
  storeBondKey,
  deleteSharedSecret,
  getAllTribeKeys,
  storeTribeKey,
  getTribeKey,
} from './key-store';
import type { VaultEntry, VaultPayload, TribeKeyVaultEntry } from './vault-types';

// ============================================================
// CONSTANTS
// ============================================================

const PBKDF2_ITERATIONS = 600_000; // OWASP 2023 recommended minimum
const PBKDF2_HASH = 'SHA-256';
const AES_KEY_LENGTH = 256;
const SALT_LENGTH = 32; // 256-bit salt


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
 * 2. Encrypt the entire collection with the password-derived key
 *
 * NOTE: Bond keys must have been generated with `extractable: true` for this
 * to work. For non-extractable keys, a re-generation flow is needed (Phase 2D).
 *
 * @returns The encrypted vault blob and the salt used for derivation
 */
export async function createVaultBackup(
  passphrase: string,
  userId: string,
  identityKey?: { privateKey: CryptoKey; publicKey: CryptoKey },
): Promise<{ encryptedVault: ArrayBuffer; salt: string }> {
  if (!passphrase || passphrase.length < 12) {
    throw new Error('Recovery passphrase must be at least 12 characters');
  }
  // Tribe keys are user-scoped; a backup without a real user would silently
  // omit (or mis-scope) them. Require an explicit userId instead of guessing.
  if (!userId) {
    throw new Error('Cannot create a vault backup without a signed-in user');
  }

  // Collect all stored bond keys
  const storedKeys = await getAllBondKeys();

  if (storedKeys.length === 0) {
    throw new Error('No bond keys to backup');
  }

  // Build vault payload — export private keys to JWK
  let entries: VaultEntry[] = [];
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

  const lockedCount = storedKeys.length - entries.length;
  if (entries.length === 0) {
    throw new Error('No exportable bond keys found. Keys may need to be regenerated.');
  }
  if (lockedCount > 0) {
    console.warn(`[vault] ${lockedCount} of ${storedKeys.length} bond key(s) are non-extractable and excluded from backup. Restore from a good vault to upgrade them.`);
  }

  // MERGE: Union local keys with any existing server backup so we never
  // lose keys from other devices. The existing backup is decrypted using
  // the same password; if that fails (password changed), we fall back
  // to local-only keys and log a warning.
  entries = await mergeWithExistingBackup(entries, passphrase);

  const payload: VaultPayload = {
    version: 2,
    entries,
    exportedAt: Date.now(),
  };

  // Add identity key if provided
  if (identityKey) {
    const { exportIdentityPrivateKey, exportIdentityPublicKey } = await import('./identity-keys');
    const privateKeyJwk = await exportIdentityPrivateKey(identityKey.privateKey);
    const publicKeyJwk = await exportIdentityPublicKey(identityKey.publicKey);
    payload.identityKey = { privateKeyJwk, publicKeyJwk };
  }

  // Add tribe group keys (AES-256-GCM symmetric keys)
  try {
    const tribeKeys = await getAllTribeKeys(userId);
    if (tribeKeys.length > 0) {
      const tribeKeyEntries: TribeKeyVaultEntry[] = [];
      for (const tk of tribeKeys) {
        try {
          const keyJwk = await crypto.subtle.exportKey('jwk', tk.key);
          tribeKeyEntries.push({
            tribeId: tk.tribeId,
            keyJwk,
            version: tk.version,
          });
        } catch {
          console.warn(`[vault] Skipping non-extractable tribe key for ${tk.tribeId}`);
        }
      }
      if (tribeKeyEntries.length > 0) {
        payload.tribeKeys = tribeKeyEntries;
        console.log(`[vault] Including ${tribeKeyEntries.length} tribe key(s) in backup`);
      }
    }
  } catch (err) {
    console.warn('[vault] Failed to export tribe keys:', err);
  }

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

/**
 * Merges local vault entries with keys from an existing server backup.
 * This ensures that keys from other devices are preserved when backing up.
 * Local keys take precedence (they're the freshest on this device).
 *
 * Falls back to local-only entries if decryption fails (e.g. password changed).
 */
async function mergeWithExistingBackup(
  localEntries: VaultEntry[],
  passphrase: string,
): Promise<VaultEntry[]> {
  try {
    const { getVaultBackup } = await import('@/lib/actions/vault-actions');
    const existing = await getVaultBackup();
    if (!existing) return localEntries;

    // Decode from base64
    const binaryStr = atob(existing.encryptedVaultBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    // Decrypt existing backup
    const saltBytes = new Uint8Array(
      existing.salt.match(/.{2}/g)!.map(byte => parseInt(byte, 16)),
    );
    const key = await deriveKeyFromPassphrase(passphrase, saltBytes);
    const packed = new Uint8Array(bytes.buffer);
    const iv = packed.slice(0, 12);
    const ciphertext = packed.slice(12);

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );
    const payload: VaultPayload = JSON.parse(new TextDecoder().decode(plaintext));

    // Union: local keys win (newer on this device), add server-only keys
    const localBondIds = new Set(localEntries.map(e => e.bondId));
    const serverOnlyEntries = payload.entries.filter(e => !localBondIds.has(e.bondId));

    if (serverOnlyEntries.length > 0) {
      console.log(`[vault] Merging ${serverOnlyEntries.length} key(s) from previous backup into new backup`);
    }

    return [...localEntries, ...serverOnlyEntries];
  } catch (err) {
    // Decryption failure = password changed or corrupted backup.
    // Fall back to local-only — don't block the backup.
    console.warn('[vault] Could not merge with existing backup (passphrase mismatch or no backup):', err);
    return localEntries;
  }
}

// ============================================================
// VAULT RESTORE
// ============================================================

/**
 * Result of a vault restore operation, including merge statistics.
 */
export interface VaultRestoreResult {
  /** Map of bondId → restored CryptoKey (only newly imported keys) */
  restoredKeys: Map<string, CryptoKey>;
  /** Number of keys imported from the backup */
  imported: number;
  /** Number of keys skipped because a local key already existed */
  skipped: number;
  /** Total keys in the backup */
  total: number;
}

/**
 * Restores bond private keys and identity key from an encrypted vault backup.
 *
 * MERGE SEMANTICS:
 * - New bonds (no local key): imported directly
 * - Existing bonds with SAME public key: skipped (already in sync)
 * - Existing bonds with DIFFERENT public key: backup key wins + shared secret
 *   cache is invalidated so key-sync re-derives from the new key pair.
 *   This handles the case where another device generated a newer key pair
 *   that the server and peers are already using.
 *
 * @param encryptedVault The encrypted vault blob
 * @param salt The hex-encoded salt used during backup
 * @param passphrase The user's recovery passphrase
 * @param userId The current user's ID (for storing the identity key)
 * @returns Restore result with merge statistics
 */
export async function restoreVaultBackup(
  encryptedVault: ArrayBuffer,
  salt: string,
  passphrase: string,
  userId?: string,
): Promise<VaultRestoreResult> {
  // Decode salt from hex
  const saltBytes = new Uint8Array(
    salt.match(/.{2}/g)!.map(byte => parseInt(byte, 16)),
  );

  // Derive the same key from password + salt
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

  if (payload.version !== 1 && payload.version !== 2) {
    throw new Error(`Unsupported vault version: ${payload.version}`);
  }

  const { hashPublicKeyJwk } = await import('./key-store');

  // Import each private key and store in IndexedDB.
  // Smart merge: compare public key hashes to detect key pair changes.
  const restoredKeys = new Map<string, CryptoKey>();
  let skipped = 0;

  for (const entry of payload.entries) {
    try {
      const existingKey = await getBondKey(entry.bondId);

      if (existingKey) {
        // Compare public key hashes to determine if the key pair changed
        const localPubHash = await hashPublicKeyJwk(existingKey.publicKeyJwk);
        const backupPubHash = await hashPublicKeyJwk(entry.publicKeyJwk);

        if (localPubHash === backupPubHash && existingKey.privateKey.extractable) {
          // Same key pair AND it's already extractable — no action needed
          skipped++;
          continue;
        }

        // Different key pair OR local key is non-extractable (locked) — BACKUP WINS.
        // If the user is explicitly performing a restore, they want the backup 
        // to be the authority. Overwrite the mismatching or locked local key 
        // with the one from the backup to bring this device into alignment.
        console.warn(
          `[vault] Bond ${entry.bondId.substring(0, 16)}... ${localPubHash === backupPubHash ? 'is locked' : 'mismatch'} — ` +
          `overwriting with backup`
        );
        // Continue to import and store below
      }

      const privateKey = await importPrivateKey(entry.privateKeyJwk);
      restoredKeys.set(entry.bondId, privateKey);

      // Persist to IndexedDB (new key or overwrite with backup's key)
      await storeBondKey(entry.bondId, privateKey, entry.publicKeyJwk);

      // If we overwrote a different key, invalidate the cached shared secret.
      // The next key-sync cycle will re-derive it with the correct key pair.
      if (existingKey) {
        try {
          await deleteSharedSecret(entry.bondId);
          console.debug(`[vault] Cleared stale shared secret for bond ${entry.bondId.substring(0, 16)}...`);
        } catch { /* non-fatal */ }
      }
    } catch (err) {
      console.warn(`[vault] Failed to restore key for bond ${entry.bondId}:`, err);
    }
  }

  // Restore identity key if present (Version 2+).
  // Overwrite if missing OR if local key is non-extractable (locked),
  // same pattern as bond key restore above.
  if (payload.version >= 2 && payload.identityKey) {
    try {
      const { importIdentityPrivateKey } = await import('./identity-keys');
      const { storeIdentityKey, getIdentityKey } = await import('./key-store');

      const storeId = userId || 'unknown';
      const existingIdentity = await getIdentityKey(storeId);
      const isLocked = existingIdentity && !existingIdentity.privateKey.extractable;

      if (!existingIdentity || isLocked) {
        const privateKey = await importIdentityPrivateKey(payload.identityKey.privateKeyJwk);
        await storeIdentityKey(storeId, privateKey, payload.identityKey.publicKeyJwk);
        console.log(`[vault] ${isLocked ? 'Upgraded locked' : 'Restored'} identity key for user ${storeId.substring(0, 8)}...`);
      } else {
        console.debug(`[vault] Skipping identity key — local key exists and is extractable for ${storeId.substring(0, 8)}...`);
      }
    } catch (err) {
      console.warn('[vault] Failed to restore identity key:', err);
    }
  }

  // Restore tribe group keys if present. Tribe keys are user-scoped in the cache,
  // so we need the userId; skip (with a warning) if it wasn't provided.
  if (payload.tribeKeys && payload.tribeKeys.length > 0) {
    if (!userId) {
      console.warn('[vault] Skipping tribe key restore — no userId provided for user-scoped cache');
    } else {
      let tribeRestored = 0;
      for (const tkEntry of payload.tribeKeys) {
        try {
          const existing = await getTribeKey(userId, tkEntry.tribeId);
          // Only import if no local key or backup has a newer version
          if (existing && existing.version >= tkEntry.version) {
            continue;
          }

          const tribeKey = await crypto.subtle.importKey(
            'jwk',
            tkEntry.keyJwk,
            { name: 'AES-GCM', length: 256 },
            true, // extractable — needed for wrapping/re-distribution
            ['encrypt', 'decrypt'],
          );
          await storeTribeKey(userId, tkEntry.tribeId, tribeKey, tkEntry.version);
          tribeRestored++;
        } catch (err) {
          console.warn(`[vault] Failed to restore tribe key for ${tkEntry.tribeId}:`, err);
        }
      }
      if (tribeRestored > 0) {
        console.log(`[vault] Restored ${tribeRestored} tribe key(s) from backup`);
      }
    }
  }

  console.log(`[vault] Restore complete: ${restoredKeys.size} imported/updated, ${skipped} unchanged, ${payload.entries.length} total in backup`);

  return {
    restoredKeys,
    imported: restoredKeys.size,
    skipped,
    total: payload.entries.length,
  };
}

/**
 * Validates a passphrase meets minimum requirements.
 */
export function validatePassphrase(passphrase: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (passphrase.length < 12) {
    errors.push('Passphrase must be at least 12 characters');
  }
  if (passphrase.length > 128) {
    errors.push('Passphrase must be at most 128 characters');
  }
  if (!/[A-Z]/.test(passphrase)) {
    errors.push('Passphrase should contain at least one uppercase letter');
  }
  if (!/[0-9]/.test(passphrase) && !/[^A-Za-z0-9]/.test(passphrase)) {
    errors.push('Passphrase should contain at least one number or symbol');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
