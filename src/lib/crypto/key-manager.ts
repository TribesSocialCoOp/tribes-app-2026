/**
 * @fileoverview Client-side cryptographic key management for bonds.
 * Phase 2B: Web Crypto API (SubtleCrypto) — ECDH P-256.
 *
 * This module runs ONLY in the browser. All crypto operations use the
 * Web Crypto API which provides:
 * - Hardware-backed key generation (when platform supports it)
 * - Non-extractable private keys (held in browser-managed memory)
 * - Constant-time ECDH key agreement
 *
 * Algorithm choices:
 * - Key Exchange: ECDH with P-256 (NIST, widely supported)
 * - Key Derivation: HKDF (SHA-256) from ECDH shared secret → AES-256-GCM key
 * - Symmetric Encryption: AES-256-GCM (for vault backup encryption)
 */

// ============================================================
// CONSTANTS
// ============================================================

const ECDH_ALGORITHM: EcKeyGenParams = {
  name: 'ECDH',
  namedCurve: 'P-256',
};

const HKDF_ALGORITHM = 'HKDF';
const AES_ALGORITHM = 'AES-GCM';
const AES_KEY_LENGTH = 256;
const HKDF_HASH = 'SHA-256';

// Context string for HKDF derivation — domain-separates our keys
const HKDF_INFO = new TextEncoder().encode('tribes.app/bond-key/v1');

// ============================================================
// KEY GENERATION
// ============================================================

/**
 * Generates an ECDH P-256 key pair for a bond.
 *
 * The private key is created with `extractable: false` by default,
 * meaning it cannot be exported from the browser's crypto subsystem.
 * For vault backup, use `generateExportableBondKeyPair()` instead.
 *
 * @returns CryptoKeyPair with non-extractable private key
 */
export async function generateBondKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    ECDH_ALGORITHM,
    false, // extractable: false — private key cannot be exported
    ['deriveKey', 'deriveBits'],
  );
}

/**
 * Generates an ECDH P-256 key pair with an extractable private key.
 * Used ONLY for vault backup — the extractable key is immediately
 * encrypted and the plaintext discarded.
 */
export async function generateExportableBondKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    ECDH_ALGORITHM,
    true, // extractable: true — for vault backup only
    ['deriveKey', 'deriveBits'],
  );
}

// ============================================================
// KEY EXPORT / IMPORT
// ============================================================

/**
 * Exports a public key to JWK format for transmission to the other party.
 * Public keys are always exportable.
 */
export async function exportPublicKey(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

/**
 * Exports a private key to JWK format (for vault backup encryption).
 * Only works if the key was created with `extractable: true`.
 *
 * @throws DOMException if key is non-extractable
 */
export async function exportPrivateKey(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}

/**
 * Imports a received public key from JWK format.
 * Used when receiving the other party's public key during bond formation.
 */
export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    ECDH_ALGORITHM,
    true, // public keys are always extractable
    [], // public keys have no usages in ECDH — they're used as input to deriveKey
  );
}

/**
 * Imports a private key (asymmetric) or symmetric key from JWK format (for vault restore).
 * The imported key is non-extractable — it can only be used, never re-exported.
 */
export async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  // Detect if it's a symmetric key (oct) or asymmetric (EC)
  if (jwk.kty === 'oct') {
    return crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'AES-GCM' },
      false, // imported as non-extractable
      ['encrypt', 'decrypt'],
    );
  }

  // Default to ECDH for bond keys
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    ECDH_ALGORITHM,
    false, // imported as non-extractable for security
    ['deriveKey', 'deriveBits'],
  );
}

// ============================================================
// KEY AGREEMENT (ECDH)
// ============================================================

/**
 * Derives a shared AES-256-GCM key from our private key and the other party's public key.
 *
 * This is the core of the bond's cryptographic relationship:
 * - Alice derives: ECDH(Alice.private, Bob.public) → shared_secret
 * - Bob derives:   ECDH(Bob.private, Alice.public) → same shared_secret
 *
 * The raw ECDH output is passed through HKDF for proper key derivation.
 */
export async function deriveSharedSecret(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
): Promise<CryptoKey> {
  // Step 1: ECDH raw key agreement → raw bits
  const rawBits = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: peerPublicKey,
    },
    privateKey,
    256, // P-256 produces 256-bit shared secret
  );

  // Step 2: Import raw bits as HKDF key material
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    rawBits,
    HKDF_ALGORITHM,
    false,
    ['deriveKey'],
  );

  // Step 3: HKDF derivation → AES-256-GCM key
  return crypto.subtle.deriveKey(
    {
      name: HKDF_ALGORITHM,
      hash: HKDF_HASH,
      salt: new Uint8Array(32), // Zero salt — each key pair is unique already
      info: HKDF_INFO,
    },
    hkdfKey,
    {
      name: AES_ALGORITHM,
      length: AES_KEY_LENGTH,
    },
    false, // derived key is non-extractable
    ['encrypt', 'decrypt'],
  );
}

// ============================================================
// SYMMETRIC ENCRYPTION (AES-256-GCM)
// ============================================================

/**
 * Encrypts data using AES-256-GCM with a derived shared secret.
 * Returns the IV prepended to the ciphertext.
 */
export async function encrypt(
  key: CryptoKey,
  plaintext: ArrayBuffer,
): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv },
    key,
    plaintext,
  );

  // Prepend IV to ciphertext: [12 bytes IV][ciphertext]
  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), iv.length);
  return result.buffer;
}

/**
 * Decrypts data encrypted with `encrypt()`.
 * Expects [12 bytes IV][ciphertext] format.
 */
export async function decrypt(
  key: CryptoKey,
  data: ArrayBuffer,
): Promise<ArrayBuffer> {
  const dataBytes = new Uint8Array(data);
  const iv = dataBytes.slice(0, 12);
  const ciphertext = dataBytes.slice(12);

  return crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv },
    key,
    ciphertext,
  );
}

// ============================================================
// UTILITIES
// ============================================================

/**
 * Generates a cryptographically random token (hex string).
 * Used for bond initiation tokens, nonces, etc.
 */
export function generateToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Checks if the Web Crypto API is available.
 */
export function isCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}
