/**
 * @fileoverview Client-side tribe group key encryption primitives.
 * Phase 3: Group Encryption for private tribes.
 *
 * This module handles:
 * 1. Generating tribe symmetric keys (AES-256-GCM)
 * 2. Wrapping/unwrapping tribe keys for distribution to members
 * 3. Encrypting/decrypting post content with tribe keys
 *
 * ⚠️ This module is browser-only. Do NOT import from server-side code.
 */

// ============================================================
// CONSTANTS
// ============================================================

const AES_ALGORITHM = 'AES-GCM';
const AES_KEY_LENGTH = 256;

// ============================================================
// KEY GENERATION
// ============================================================

/**
 * Generates a new AES-256-GCM symmetric key for a tribe.
 * The key is extractable so it can be wrapped for distribution to members.
 */
export async function generateTribeGroupKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true, // extractable — must be true for wrapping/distribution
    ['encrypt', 'decrypt'],
  );
}

// ============================================================
// KEY WRAPPING (Distribution to members)
// ============================================================

/**
 * Wraps (encrypts) a tribe's group key using a symmetric wrapping key.
 *
 * NOTE: For tribe key distribution to members, use `wrapKeyForRecipient`
 * from identity-keys.ts instead (RSA-OAEP envelope). This function remains
 * for legacy grants and direct symmetric wrapping use cases.
 *
 * @param tribeKey - The tribe's AES-256-GCM symmetric key to wrap
 * @param wrappingSecret - A symmetric AES key to wrap with
 * @returns { wrappedKey: base64, iv: base64 }
 */
export async function wrapTribeKey(
  tribeKey: CryptoKey,
  wrappingSecret: CryptoKey,
): Promise<{ wrappedKey: string; iv: string }> {
  // Export the tribe key as raw bytes
  const rawKey = await crypto.subtle.exportKey('raw', tribeKey);

  // Encrypt the raw key with the wrapping secret
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const wrapped = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv },
    wrappingSecret,
    rawKey,
  );

  return {
    wrappedKey: arrayBufferToBase64(wrapped),
    iv: arrayBufferToBase64(iv.buffer),
  };
}

/**
 * Unwraps (decrypts) a tribe's group key using a symmetric unwrapping key.
 * Reverses the wrapping done by `wrapTribeKey`.
 *
 * NOTE: For tribe key reception from grants, use `unwrapKeyFromGrant`
 * from identity-keys.ts instead (RSA-OAEP envelope). This function remains
 * for legacy grants.
 *
 * @param wrappedKeyBase64 - Base64-encoded wrapped tribe key
 * @param ivBase64 - Base64-encoded IV used during wrapping
 * @param unwrappingSecret - A symmetric AES key to unwrap with
 * @returns The tribe's AES-256-GCM symmetric key
 */
export async function unwrapTribeKey(
  wrappedKeyBase64: string,
  ivBase64: string,
  unwrappingSecret: CryptoKey,
): Promise<CryptoKey> {
  const wrappedKey = base64ToArrayBuffer(wrappedKeyBase64);
  const iv = base64ToArrayBuffer(ivBase64);

  // Decrypt the wrapped key
  const rawKeyBytes = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: new Uint8Array(iv) },
    unwrappingSecret,
    wrappedKey,
  );

  // Import as a usable AES-256-GCM key
  // Made extractable so it can be re-wrapped for new members if this user is a key admin
  return crypto.subtle.importKey(
    'raw',
    rawKeyBytes,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true, // extractable — key admins need to re-wrap for new members
    ['encrypt', 'decrypt'],
  );
}

// ============================================================
// CONTENT ENCRYPTION / DECRYPTION
// ============================================================

/**
 * Encrypts post content with a tribe's group key.
 * This is O(1) — one encrypt operation regardless of tribe size.
 *
 * @param plaintext - The post content to encrypt
 * @param tribeKey - The tribe's AES-256-GCM symmetric key
 * @returns { ciphertext: ArrayBuffer, iv: string }
 */
export async function encryptWithTribeKey(
  plaintext: string,
  tribeKey: CryptoKey,
): Promise<{ ciphertext: ArrayBuffer; iv: string }> {
  const encoded = new TextEncoder().encode(plaintext);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv },
    tribeKey,
    encoded,
  );

  return {
    ciphertext,
    iv: arrayBufferToBase64(iv.buffer),
  };
}

/**
 * Decrypts post content with a tribe's group key.
 *
 * @param ciphertext - The encrypted post content
 * @param ivBase64 - Base64-encoded IV used during encryption
 * @param tribeKey - The tribe's AES-256-GCM symmetric key
 * @returns The decrypted plaintext string
 */
export async function decryptWithTribeKey(
  ciphertext: ArrayBuffer,
  ivBase64: string,
  tribeKey: CryptoKey,
): Promise<string> {
  const iv = base64ToArrayBuffer(ivBase64);

  const plaintext = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: new Uint8Array(iv) },
    tribeKey,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}

// ============================================================
// ENCODING HELPERS
// ============================================================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
