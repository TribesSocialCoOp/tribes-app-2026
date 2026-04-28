/**
 * @fileoverview Personal journal encryption — single-reader symmetric key.
 * 
 * Journal entries are the most private content on the platform.
 * They're encrypted with a personal AES-256-GCM key that only
 * the author has access to, stored in IndexedDB alongside bond keys.
 *
 * The personal key is:
 * - Generated on first journal post
 * - Stored in the same IndexedDB keystore as bond keys
 * - Backed up in the vault (via the existing vault backup flow)
 * - Never sent to the server
 *
 * ⚠️ Browser-only module. Do NOT import from server-side code.
 */

const PERSONAL_KEY_ID = '__personal_journal_key__';

// ── Key Management ───────────────────────────────────────────

/**
 * Gets or creates the user's personal journal encryption key.
 * Uses the existing bond key store with a well-known ID.
 */
export async function getOrCreateJournalKey(): Promise<CryptoKey> {
  const { getBondKey, storeBondKey } = await import('@/lib/crypto/key-store');

  const existing = await getBondKey(PERSONAL_KEY_ID);
  if (existing) {
    return existing.privateKey; // Stored as "privateKey" in the bond key store
  }

  // Generate a new personal AES-256-GCM key
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable for vault backup
    ['encrypt', 'decrypt'],
  );

  // Store in IndexedDB using the bond key store infrastructure
  // We store the AES key as "privateKey" and a dummy JWK as "publicKeyJwk"
  const jwk = await crypto.subtle.exportKey('jwk', key);
  await storeBondKey(PERSONAL_KEY_ID, key, jwk);

  return key;
}

/**
 * The well-known ID for the personal journal key.
 * Used by vault backup to include it in the backup set.
 */
export const JOURNAL_KEY_ID = PERSONAL_KEY_ID;

// ── Encryption ───────────────────────────────────────────────

import { toBase64, fromBase64 } from './encoding';

/**
 * Encrypts journal content with the personal key.
 * Returns base64-encoded ciphertext and IV.
 */
export async function encryptJournalEntry(
  plaintext: string,
  key: CryptoKey,
): Promise<{ ciphertextBase64: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const contentBytes = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    contentBytes,
  );

  return {
    ciphertextBase64: toBase64(ciphertext),
    iv: toBase64(iv.buffer),
  };
}

/**
 * Decrypts a journal entry with the personal key.
 */
export async function decryptJournalEntry(
  ciphertextBase64: string,
  iv: string,
  key: CryptoKey,
): Promise<string> {
  const ciphertext = fromBase64(ciphertextBase64);
  const ivBytes = new Uint8Array(fromBase64(iv));

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes, tagLength: 128 },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}
