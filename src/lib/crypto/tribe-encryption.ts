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

import { toBase64, fromBase64 } from './encoding';

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
    iv: toBase64(iv.buffer),
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
  const iv = fromBase64(ivBase64);

  const plaintext = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: new Uint8Array(iv) },
    tribeKey,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}


