/**
 * @fileoverview Client-side identity key management (RSA-OAEP).
 * Used exclusively for distributing tribe group keys to members.
 * This is completely independent of the ECDH bond key system.
 *
 * Algorithm: RSA-OAEP with SHA-256 and 4096-bit keys.
 * This provides an asymmetric envelope for delivering symmetric AES tribe keys.
 *
 * ⚠️ This module is browser-only.
 */

import { toBase64, fromBase64 } from './encoding';

const RSA_ALGORITHM: RsaHashedKeyGenParams = {
  name: 'RSA-OAEP',
  modulusLength: 4096,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};

const RSA_IMPORT_ALGORITHM: RsaHashedImportParams = {
  name: 'RSA-OAEP',
  hash: 'SHA-256',
};

// ============================================================
// KEY GENERATION
// ============================================================

/**
 * Generates an RSA-OAEP key pair for identity-based tribe key exchange.
 * Both keys are extractable so the private key can be vault-backed.
 */
export async function generateIdentityKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    RSA_ALGORITHM,
    true, // extractable (needed for vault backup)
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
}

// ============================================================
// KEY EXPORT
// ============================================================

/**
 * Exports the public identity key to JWK format for server storage.
 */
export async function exportIdentityPublicKey(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

/**
 * Exports a private identity key to JWK format (for vault backup only).
 */
export async function exportIdentityPrivateKey(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

// ============================================================
// KEY IMPORT
// ============================================================

/**
 * Imports an identity public key from JWK format.
 * Used when wrapping tribe keys for a recipient.
 */
export async function importIdentityPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    RSA_IMPORT_ALGORITHM,
    true,
    ['encrypt', 'wrapKey']
  );
}

/**
 * Imports an identity private key from JWK format (for vault restore).
 * The imported key is non-extractable — it can only be used, never re-exported.
 */
export async function importIdentityPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    RSA_IMPORT_ALGORITHM,
    false, // non-extractable after restore for security
    ['decrypt', 'unwrapKey']
  );
}

// ============================================================
// KEY WRAPPING (Tribe key distribution)
// ============================================================

/**
 * Wraps (encrypts) a symmetric AES tribe key using a recipient's RSA public key.
 * Used by founders/speakers to deliver tribe keys to members.
 *
 * RSA-OAEP wrapping does not use a separate IV — the OAEP padding provides
 * the necessary randomization. The `iv` field is set to 'none' for schema compat.
 *
 * @param keyToWrap - The tribe's AES-256-GCM symmetric key
 * @param recipientPublicKey - The recipient's RSA-OAEP public key
 * @returns { wrappedKey: base64, iv: 'none' }
 */
export async function wrapKeyForRecipient(
  keyToWrap: CryptoKey,
  recipientPublicKey: CryptoKey
): Promise<{ wrappedKey: string; iv: string }> {
  const wrapped = await crypto.subtle.wrapKey(
    'raw',
    keyToWrap,
    recipientPublicKey,
    { name: 'RSA-OAEP' }
  );

  return {
    wrappedKey: toBase64(wrapped),
    iv: 'none', // RSA-OAEP does not use a symmetric IV
  };
}

/**
 * Unwraps (decrypts) a symmetric AES tribe key using our RSA private key.
 * Used by members to receive tribe keys from founders.
 *
 * @param wrappedKeyBase64 - Base64-encoded RSA-OAEP wrapped tribe key
 * @param myPrivateKey - This user's RSA-OAEP private key
 * @returns The tribe's AES-256-GCM symmetric key (extractable for re-wrapping)
 */
export async function unwrapKeyFromGrant(
  wrappedKeyBase64: string,
  myPrivateKey: CryptoKey
): Promise<CryptoKey> {
  const wrappedBuffer = fromBase64(wrappedKeyBase64);

  return crypto.subtle.unwrapKey(
    'raw',
    wrappedBuffer,
    myPrivateKey,
    { name: 'RSA-OAEP' },
    { name: 'AES-GCM', length: 256 },
    true, // extractable — key admins may need to re-wrap for new members
    ['encrypt', 'decrypt']
  );
}
