/**
 * @fileoverview Passkey PRF-based vault recovery.
 * Phase 3: Hardware-backed multi-device key sync.
 *
 * This module leverages the WebAuthn PRF (Pseudo-Random Function) extension
 * to derive a deterministic wrapping key from the user's passkey. This key
 * wraps the local keystore (bond keys + journal key) for backup and restore.
 *
 * Security:
 * - Wrapping key is derived via HKDF from the hardware-backed PRF output.
 * - Wrapping key is non-extractable.
 * - Server only sees the opaque encrypted vault blob.
 *
 * ⚠️ Browser-only module.
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
  hashPublicKeyJwk,
  getAllTribeKeys,
  storeTribeKey,
  getTribeKey,
} from './key-store';
import type { VaultEntry, VaultPayload, TribeKeyVaultEntry } from './vault-types';

// ============================================================
// CONSTANTS
// ============================================================

const VAULT_VERSION = 2;
const PRF_SALT = 'tribes.app/prf-vault/v1';
const HKDF_INFO = 'tribes.app/prf-vault-wrapping-key/v1';

// ============================================================
// DETECTION & CAPABILITIES
// ============================================================

/**
 * Checks if the browser/platform supports the WebAuthn PRF extension.
 *
 * Detection strategy:
 * 1. Standard: PublicKeyCredential.getClientCapabilities() (WebAuthn L3)
 * 2. Native iOS (Capacitor): PRF is supported via the system authenticator
 *    (iCloud Keychain / Face ID). The login flow already uses this successfully.
 * 3. Fallback: If navigator.credentials is available and we're on a platform
 *    known to support passkeys, assume PRF is available — the actual PRF result
 *    is validated at ceremony time anyway.
 */
export async function isPrfSupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    console.log('[prf] No window or PublicKeyCredential');
    return false;
  }
  
  // 1. Check getClientCapabilities (Standard way, WebAuthn L3)
  // This API is new and not yet in all TypeScript lib definitions — use safe dynamic access.
  const pkc = PublicKeyCredential as unknown as Record<string, unknown>;
  if (typeof pkc.getClientCapabilities === 'function') {
    try {
      const caps = await (pkc.getClientCapabilities as () => Promise<Record<string, boolean>>)();
      console.log('[prf] getClientCapabilities:', caps);
      // Chrome reports PRF as 'extension:prf', Safari/standard as 'prf'
      return !!(caps.prf || caps['extension:prf']);
    } catch (err) {
      console.log('[prf] getClientCapabilities threw:', err);
      // Fall through — capability check failed (e.g., browser throws on unknown caps)
    }
  } else {
    console.log('[prf] getClientCapabilities not available');
  }

  // 2. Native iOS (Capacitor): PRF works via the system authenticator.
  // The login flow already successfully evaluates PRF extensions through
  // @simplewebauthn/browser → ASAuthorizationController, so we know it's available.
  const cap = (window as unknown as Record<string, any>).Capacitor;
  console.log('[prf] Capacitor global:', !!cap, 'isNative:', cap?.isNativePlatform?.(), 'platform:', cap?.getPlatform?.());
  if (cap?.isNativePlatform?.() && cap?.getPlatform?.() === 'ios') {
    console.log('[prf] Capacitor iOS detected — returning true');
    return true;
  }

  // 3. Web fallback: check if we're on a modern platform with credentials support.
  // Safari 18+, Chrome 128+, and other modern browsers support PRF — but without
  // getClientCapabilities we can't be 100% sure. We optimistically return true
  // if the platform has PublicKeyCredential + conditional mediation support
  // (a proxy for "modern enough for PRF"). The actual PRF result is validated
  // at ceremony time and we handle failures gracefully.
  if (typeof pkc.isConditionalMediationAvailable === 'function') {
    try {
      const hasCM = await (pkc.isConditionalMediationAvailable as () => Promise<boolean>)();
      console.log('[prf] isConditionalMediationAvailable:', hasCM);
      if (hasCM) return true;
    } catch (err) {
      console.log('[prf] isConditionalMediationAvailable threw:', err);
      // Fall through
    }
  } else {
    console.log('[prf] isConditionalMediationAvailable not available');
  }

  // 4. Unknown capability — not supported.
  console.log('[prf] No detection method succeeded — returning false');
  return false;
}

/**
 * Derives a stable 32-byte binary salt for PRF evaluation.
 * Hashes the human-readable label with SHA-256 to produce a fixed-length value
 * that satisfies the WebAuthn PRF extension requirement.
 *
 * This value is used identically on both the server (registration options)
 * and the client (getPrfSaltBytes()) so the same authenticator input is always evaluated.
 */
export async function getPrfSaltBytes(): Promise<Uint8Array> {
  const label = new TextEncoder().encode(PRF_SALT);
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    console.warn('[prf] crypto.subtle is not available (insecure context or unsupported environment)');
    const fallback = new Uint8Array(32);
    for (let i = 0; i < label.length; i++) {
      fallback[i % 32] ^= label[i];
    }
    return fallback;
  }
  const hash = await crypto.subtle.digest('SHA-256', label);
  return new Uint8Array(hash);
}

// ============================================================
// KEY DERIVATION
// ============================================================

/**
 * Derives a non-extractable AES-256-GCM wrapping key from a PRF output.
 * 
 * @param prfOutput The 32-byte secret returned by the authenticator's PRF extension.
 */
export async function derivePrfWrappingKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  // Validate input is a non-empty ArrayBuffer
  if (!(prfOutput instanceof ArrayBuffer) || prfOutput.byteLength < 32) {
    throw new Error('[prf-vault] Invalid PRF output: expected at least 32-byte ArrayBuffer');
  }

  // 1. Import raw PRF output as key material for HKDF
  const baseKey = await crypto.subtle.importKey(
    'raw',
    prfOutput,
    'HKDF',
    false,
    ['deriveKey']
  );

  // 2. Derive the final AES-GCM key.
  // We include a fixed app-scoped salt for HKDF defense-in-depth, even though
  // the PRF output is already high-entropy. RFC 5869 recommends a non-empty salt.
  const hkdfSalt = new TextEncoder().encode('tribes.app/prf-hkdf-salt/v1');

  return await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: hkdfSalt,
      info: new TextEncoder().encode(HKDF_INFO),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, // derived key is non-extractable
    ['encrypt', 'decrypt']
  );
}

// ============================================================
// VAULT OPERATIONS
// ============================================================


/**
 * Encrypts the local keystore into a vault blob using a PRF wrapping key.
 * Exports all bond keys and the personal journal key.
 */
export async function encryptVaultWithPrf(
  wrappingKey: CryptoKey,
  userId?: string,
): Promise<ArrayBuffer> {
  const storedKeys = await getAllBondKeys();
  if (storedKeys.length === 0) throw new Error('No keys to backup');

  const entries: VaultEntry[] = [];
  for (const stored of storedKeys) {
    try {
      // Export private key (AES for journal, ECDSA/ECDH for bonds)
      const privateKeyJwk = await exportPrivateKey(stored.privateKey);
      entries.push({
        bondId: stored.bondId,
        privateKeyJwk,
        publicKeyJwk: stored.publicKeyJwk,
        createdAt: stored.createdAt,
      });
    } catch (err) {
      console.warn(`[prf-vault] Skipping non-extractable key for ${stored.bondId}`, err);
    }
  }

  if (entries.length === 0) throw new Error('No exportable keys found');

  const payload: VaultPayload = {
    version: VAULT_VERSION,
    entries,
    exportedAt: Date.now(),
  };

  // Include identity key if available (matches vault-backup.ts v2 format)
  if (userId) {
    try {
      const { getIdentityKey } = await import('./key-store');
      const { exportIdentityPrivateKey, exportIdentityPublicKey } = await import('./identity-keys');
      const identityEntry = await getIdentityKey(userId);
      if (identityEntry) {
        const pubKey = await (await import('./identity-keys')).importIdentityPublicKey(identityEntry.publicKeyJwk);
        payload.identityKey = {
          privateKeyJwk: await exportIdentityPrivateKey(identityEntry.privateKey),
          publicKeyJwk: await exportIdentityPublicKey(pubKey),
        };
      }
    } catch (err) {
      console.warn('[prf-vault] Could not include identity key in backup:', err);
    }
  }

  // Include tribe group keys (AES-256-GCM symmetric keys)
  try {
    const tribeKeys = await getAllTribeKeys();
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
          console.warn(`[prf-vault] Skipping non-extractable tribe key for ${tk.tribeId}`);
        }
      }
      if (tribeKeyEntries.length > 0) {
        payload.tribeKeys = tribeKeyEntries;
        console.log(`[prf-vault] Including ${tribeKeyEntries.length} tribe key(s) in backup`);
      }
    }
  } catch (err) {
    console.warn('[prf-vault] Failed to export tribe keys:', err);
  }

  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    plaintext
  );

  // Pack: [IV 12B][Ciphertext]
  const packed = new Uint8Array(iv.length + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), iv.length);

  return packed.buffer;
}

/**
 * Decrypts a vault blob and restores keys into the local IndexedDB keystore.
 */
export async function decryptAndRestoreVault(
  wrappingKey: CryptoKey,
  encryptedVault: ArrayBuffer,
  userId?: string,
): Promise<{ imported: number; skipped: number; total: number }> {
  const packed = new Uint8Array(encryptedVault);
  if (packed.length < 12) throw new Error('Invalid vault blob');

  const iv = packed.slice(0, 12);
  const ciphertext = packed.slice(12);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    ciphertext
  );

  const payload: VaultPayload = JSON.parse(new TextDecoder().decode(plaintext));
  if (payload.version !== 1 && payload.version !== VAULT_VERSION) {
    throw new Error(`Unsupported vault version: ${payload.version}`);
  }

  // Smart merge: same semantics as password vault restore.
  // - New bonds: import directly
  // - Same public key: skip (already in sync)
  // - Different public key: backup wins + invalidate shared secret cache
  let imported = 0;
  let skipped = 0;

  for (const entry of payload.entries) {
    try {
      const existingKey = await getBondKey(entry.bondId);

      if (existingKey) {
        // Compare public key hashes to detect key pair changes
        const localPubHash = await hashPublicKeyJwk(existingKey.publicKeyJwk);
        const backupPubHash = await hashPublicKeyJwk(entry.publicKeyJwk);

        if (localPubHash === backupPubHash) {
          skipped++;
          continue;
        }

        // Different key pair — LOCAL WINS. This device generated its own key
        // and published it to the server. The backup's key is from a different
        // device. Overwriting would create a mismatch with the server record.
        console.warn(
          `[prf-vault] Bond ${entry.bondId.substring(0, 16)}... has different local key — ` +
          `keeping local (local: ${localPubHash.substring(0, 8)}... backup: ${backupPubHash.substring(0, 8)}...)`
        );
        skipped++;
        continue;
      }

      const key = await importPrivateKey(entry.privateKeyJwk);
      await storeBondKey(entry.bondId, key, entry.publicKeyJwk);
      imported++;
    } catch (err) {
      console.error(`[prf-vault] Failed to restore key for ${entry.bondId}`, err);
    }
  }

  // Restore identity key if present (skip-if-exists, same as password vault)
  if (payload.identityKey && userId) {
    try {
      const { importIdentityPrivateKey } = await import('./identity-keys');
      const { storeIdentityKey, getIdentityKey } = await import('./key-store');

      const existingIdentity = await getIdentityKey(userId);
      if (!existingIdentity) {
        const privateKey = await importIdentityPrivateKey(payload.identityKey.privateKeyJwk);
        await storeIdentityKey(userId, privateKey, payload.identityKey.publicKeyJwk);
        console.log(`[prf-vault] Restored identity key for user ${userId.substring(0, 8)}...`);
      } else {
        console.debug(`[prf-vault] Skipping identity key — local key exists for ${userId.substring(0, 8)}...`);
      }
    } catch (err) {
      console.warn('[prf-vault] Failed to restore identity key:', err);
    }
  }

  // Restore tribe group keys if present (v2+)
  if (payload.tribeKeys && payload.tribeKeys.length > 0) {
    let tribeRestored = 0;
    for (const tkEntry of payload.tribeKeys) {
      try {
        const existing = await getTribeKey(tkEntry.tribeId);
        if (existing && existing.version >= tkEntry.version) {
          continue;
        }

        const tribeKey = await crypto.subtle.importKey(
          'jwk',
          tkEntry.keyJwk,
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt'],
        );
        await storeTribeKey(tkEntry.tribeId, tribeKey, tkEntry.version);
        tribeRestored++;
      } catch (err) {
        console.warn(`[prf-vault] Failed to restore tribe key for ${tkEntry.tribeId}:`, err);
      }
    }
    if (tribeRestored > 0) {
      console.log(`[prf-vault] Restored ${tribeRestored} tribe key(s) from backup`);
    }
  }

  console.log(`[prf-vault] Restore complete: ${imported} imported, ${skipped} unchanged, ${payload.entries.length} total`);

  return { imported, skipped, total: payload.entries.length };
}
