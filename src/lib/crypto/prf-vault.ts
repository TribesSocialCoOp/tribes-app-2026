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
  storeBondKey,
} from './key-store';

// ============================================================
// CONSTANTS
// ============================================================

const VAULT_VERSION = 1;
const PRF_SALT = 'tribes.app/prf-vault/v1';
const HKDF_INFO = 'tribes.app/prf-vault-wrapping-key/v1';

// ============================================================
// DETECTION & CAPABILITIES
// ============================================================

/**
 * Checks if the browser supports the WebAuthn PRF extension.
 */
export async function isPrfSupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  
  // 1. Check getClientCapabilities (Standard way, WebAuthn L3)
  // This API is new and not yet in all TypeScript lib definitions — use safe dynamic access.
  const pkc = PublicKeyCredential as unknown as Record<string, unknown>;
  if (typeof pkc.getClientCapabilities === 'function') {
    try {
      const caps = await (pkc.getClientCapabilities as () => Promise<Record<string, boolean>>)();
      return !!caps.prf;
    } catch {
      // Fall through — capability check failed (e.g., browser throws on unknown caps)
    }
  }

  // 2. Conservative fallback: unknown capability = not supported.
  // The actual PRF result is confirmed by the authenticator at runtime, not here.
  return false;
}

/**
 * Derives a stable 32-byte binary salt for PRF evaluation.
 * Hashes the human-readable label with SHA-256 to produce a fixed-length value
 * that satisfies the WebAuthn PRF extension requirement.
 *
 * This value is used identically on both the server (registration options)
 * and the client (getPrfSalt()) so the same authenticator input is always evaluated.
 */
export async function getPrfSaltBytes(): Promise<Uint8Array> {
  const label = new TextEncoder().encode(PRF_SALT);
  const hash = await crypto.subtle.digest('SHA-256', label);
  return new Uint8Array(hash);
}

/**
 * Returns the application-scoped PRF salt as raw bytes.
 * @deprecated Use getPrfSaltBytes() for the hashed 32-byte version.
 */
export function getPrfSalt(): Uint8Array {
  return new TextEncoder().encode(PRF_SALT);
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

interface VaultEntry {
  bondId: string;
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
  createdAt: number;
}

interface VaultPayload {
  version: number;
  entries: VaultEntry[];
  exportedAt: number;
}

/**
 * Encrypts the local keystore into a vault blob using a PRF wrapping key.
 * Exports all bond keys and the personal journal key.
 */
export async function encryptVaultWithPrf(wrappingKey: CryptoKey): Promise<ArrayBuffer> {
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
  encryptedVault: ArrayBuffer
): Promise<void> {
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
  if (payload.version !== VAULT_VERSION) {
    throw new Error(`Unsupported vault version: ${payload.version}`);
  }

  for (const entry of payload.entries) {
    try {
      const key = await importPrivateKey(entry.privateKeyJwk);
      await storeBondKey(entry.bondId, key, entry.publicKeyJwk);
    } catch (err) {
      console.error(`[prf-vault] Failed to restore key for ${entry.bondId}`, err);
    }
  }
}
