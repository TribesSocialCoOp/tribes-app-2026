/**
 * Client-side file encryption/decryption using Web Crypto API.
 *
 * Uses AES-256-GCM for authenticated encryption. Each file gets a
 * unique random key + IV. The file key is then wrapped (encrypted)
 * with the bond's shared secret so only bond participants can decrypt.
 *
 * Flow:
 *   Encrypt:  plaintext → AES-GCM(randomKey, file) → ciphertext
 *                          randomKey → AES-KW(bondKey) → wrappedKey
 *                          return { ciphertext, wrappedKey, iv, salt }
 *
 *   Decrypt:  wrappedKey → AES-KW⁻¹(bondKey) → randomKey
 *             ciphertext → AES-GCM⁻¹(randomKey, iv) → plaintext
 */
import { toBase64, fromBase64 } from './encoding';

export interface EncryptionMeta {
  /** Algorithm identifier */
  algo: 'AES-256-GCM';
  /** Base64-encoded initialization vector (12 bytes) */
  iv: string;
  /** Base64-encoded wrapped (encrypted) file key */
  wrappedKey: string;
  /** Key wrapping algorithm ('AES-KW' for standard wrap, 'AES-GCM' for GCM-wrapped) */
  kwAlgo: 'AES-KW' | 'AES-GCM';
}

export interface EncryptedFile {
  /** The encrypted file content */
  ciphertext: ArrayBuffer;
  /** Metadata needed for decryption */
  meta: EncryptionMeta;
}


// ── Key Derivation ───────────────────────────────────────────

/**
 * Derive an AES-256 wrapping key from a bond shared secret.
 * Uses HKDF with SHA-256 to produce a 256-bit key suitable for AES-KW.
 *
 * @param sharedSecret  The bond's shared secret (from key agreement)
 * @param salt          Optional salt (defaults to 'tribes-bond-file-key')
 */
export async function deriveWrappingKey(
  sharedSecret: ArrayBuffer,
  salt?: string
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const saltBytes = encoder.encode(salt || 'tribes-bond-file-key');
  const info = encoder.encode('tribes-file-encryption-v1');

  // Import the shared secret as HKDF key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    'HKDF',
    false,
    ['deriveKey']
  );

  // Derive a 256-bit AES-KW key
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info },
    keyMaterial,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

// ── Encryption ───────────────────────────────────────────────

/**
 * Encrypt a file for secure storage.
 *
 * @param fileData      Raw file content as ArrayBuffer
 * @param wrappingKey   AES-KW key derived from bond shared secret
 * @returns             Encrypted file data + metadata for decryption
 */
export async function encryptFile(
  fileData: ArrayBuffer,
  wrappingKey: CryptoKey
): Promise<EncryptedFile> {
  // Generate a random per-file AES-256-GCM key
  const fileKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable so we can wrap it
    ['encrypt', 'decrypt']
  );

  // Generate a random 12-byte IV (recommended for GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the file content
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    fileKey,
    fileData
  );

  // Wrap (encrypt) the file key with the bond's wrapping key
  const wrappedKey = await crypto.subtle.wrapKey(
    'raw',
    fileKey,
    wrappingKey,
    'AES-KW'
  );

  return {
    ciphertext,
    meta: {
      algo: 'AES-256-GCM',
      iv: toBase64(iv.buffer),
      wrappedKey: toBase64(wrappedKey),
      kwAlgo: 'AES-KW',
    },
  };
}

// ── Decryption ───────────────────────────────────────────────

/**
 * Decrypt a file that was encrypted with encryptFile().
 *
 * @param ciphertext    The encrypted file content
 * @param meta          Encryption metadata (iv, wrappedKey, etc.)
 * @param wrappingKey   AES-KW key derived from bond shared secret
 * @returns             Decrypted file content as ArrayBuffer
 */
export async function decryptFile(
  ciphertext: ArrayBuffer,
  meta: EncryptionMeta,
  wrappingKey: CryptoKey
): Promise<ArrayBuffer> {
  const iv = new Uint8Array(fromBase64(meta.iv));
  const wrappedKeyData = fromBase64(meta.wrappedKey);

  // Unwrap the per-file key using the bond's wrapping key
  const fileKey = await crypto.subtle.unwrapKey(
    'raw',
    wrappedKeyData,
    wrappingKey,
    'AES-KW',
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  // Decrypt the file content
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    fileKey,
    ciphertext
  );
}

// ── Convenience: Encrypt File Object ─────────────────────────

/**
 * High-level helper: encrypt a File object and return a new File
 * containing the ciphertext, plus the encryption metadata.
 *
 * Use this in the upload flow before sending to /api/upload.
 */
export async function encryptFileForUpload(
  file: File,
  bondSharedSecret: ArrayBuffer
): Promise<{ encryptedFile: File; meta: EncryptionMeta }> {
  const wrappingKey = await deriveWrappingKey(bondSharedSecret);
  const fileData = await file.arrayBuffer();
  const { ciphertext, meta } = await encryptFile(fileData, wrappingKey);

  // Create a new File with the ciphertext
  const encryptedFile = new File(
    [ciphertext],
    `${file.name}.enc`,
    { type: 'application/octet-stream' }
  );

  return { encryptedFile, meta };
}

/**
 * High-level helper: decrypt a downloaded encrypted file.
 *
 * @param encryptedData   The raw ciphertext bytes
 * @param meta            Encryption metadata from the media_files record
 * @param bondSharedSecret The bond's shared secret
 * @param originalType    The original MIME type to restore
 * @returns               Decrypted File-like Blob
 */
export async function decryptDownloadedFile(
  encryptedData: ArrayBuffer,
  meta: EncryptionMeta,
  bondSharedSecret: ArrayBuffer,
  originalType: string = 'application/octet-stream'
): Promise<Blob> {
  const wrappingKey = await deriveWrappingKey(bondSharedSecret);
  const plaintext = await decryptFile(encryptedData, meta, wrappingKey);
  return new Blob([plaintext], { type: originalType });
}

// ── CryptoKey-based helpers (for non-extractable shared secrets) ──

/**
 * Encrypt a File using a CryptoKey (AES-256-GCM shared secret) directly.
 *
 * Instead of AES-KW wrapping, we use the shared secret to AES-GCM encrypt
 * the raw per-file key bytes. This works with non-extractable CryptoKeys
 * since we only need encrypt/decrypt permissions (not wrapKey/unwrapKey).
 */
export async function encryptFileWithKey(
  file: File,
  sharedSecretKey: CryptoKey,
): Promise<{ encryptedFile: File; meta: EncryptionMeta }> {
  const fileData = await file.arrayBuffer();

  // Generate a random per-file AES-256-GCM key
  const fileKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable so we can wrap it
    ['encrypt', 'decrypt'],
  );

  // Generate a random 12-byte IV for file content
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the file content
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    fileKey,
    fileData,
  );

  // Export the per-file key as raw bytes
  const rawFileKey = await crypto.subtle.exportKey('raw', fileKey);

  // Encrypt the raw file key with the shared secret (AES-GCM)
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const wrappedKeyData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: wrapIv },
    sharedSecretKey,
    rawFileKey,
  );

  // Pack wrap IV + wrapped key together
  const wrappedKeyWithIv = new Uint8Array(wrapIv.length + wrappedKeyData.byteLength);
  wrappedKeyWithIv.set(wrapIv, 0);
  wrappedKeyWithIv.set(new Uint8Array(wrappedKeyData), wrapIv.length);

  const encryptedFile = new File(
    [ciphertext],
    `${file.name}.enc`,
    { type: 'application/octet-stream' },
  );

  return {
    encryptedFile,
    meta: {
      algo: 'AES-256-GCM',
      iv: toBase64(iv.buffer),
      wrappedKey: toBase64(wrappedKeyWithIv.buffer),
      kwAlgo: 'AES-GCM', // AES-GCM key wrapping (not AES-KW despite compatible metadata shape)
    },
  };
}

/**
 * Decrypt a file using a CryptoKey (AES-256-GCM shared secret) directly.
 */
export async function decryptFileWithKey(
  encryptedData: ArrayBuffer,
  meta: EncryptionMeta,
  sharedSecretKey: CryptoKey,
  originalType: string = 'application/octet-stream',
): Promise<Blob> {
  const iv = new Uint8Array(fromBase64(meta.iv));
  const wrappedKeyWithIv = new Uint8Array(fromBase64(meta.wrappedKey));

  // Unpack wrap IV + wrapped key
  const wrapIv = wrappedKeyWithIv.slice(0, 12);
  const wrappedKeyData = wrappedKeyWithIv.slice(12);

  // Decrypt the per-file key with the shared secret
  const rawFileKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: wrapIv },
    sharedSecretKey,
    wrappedKeyData,
  );

  // Import the per-file key
  const fileKey = await crypto.subtle.importKey(
    'raw',
    rawFileKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );

  // Decrypt the file content
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    fileKey,
    encryptedData,
  );

  return new Blob([plaintext], { type: originalType });
}
