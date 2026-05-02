/**
 * @fileoverview Client-side post encryption for ring-level E2E encryption.
 * Phase 3: Sender Key Model.
 *
 * How it works:
 * 1. Author generates a random AES-256-GCM key for the post ("post key")
 * 2. Post content is encrypted with the post key → stored as posts.ciphertext
 * 3. The post key is wrapped (encrypted) separately for each recipient
 *    using their bond shared secret
 * 4. Each wrapped key is stored in post_key_grants
 * 5. Recipients unwrap the post key with their shared secret, then decrypt
 *
 * ⚠️ Browser-only module. Do NOT import from server-side code.
 */

// ── Types ────────────────────────────────────────────────────

export interface PostEncryptionResult {
  /** Encrypted post body (AES-256-GCM ciphertext) */
  ciphertext: ArrayBuffer;
  /** Base64-encoded IV used for content encryption */
  iv: string;
  /** Per-recipient key grants */
  keyGrants: PostKeyGrant[];
  /** The symmetric post key — used for encrypting images with the same key */
  postKey: CryptoKey;
}

export interface PostKeyGrant {
  /** Recipient user ID */
  recipientId: string;
  /** Bond ID used for wrapping (if applicable) */
  bondId?: string;
  /** Base64: post key encrypted with recipient's shared secret */
  wrappedKey: string;
  /** Base64: IV used for the key wrapping operation */
  wrapIv: string;
}

export interface RecipientKeyInfo {
  /** Recipient user ID */
  userId: string;
  /** Bond ID (optional) */
  bondId?: string;
  /** The AES-256-GCM shared secret (CryptoKey) from bond key exchange */
  sharedSecret: CryptoKey;
}

// ── Helpers ──────────────────────────────────────────────────

import { toBase64, fromBase64 } from './encoding';

// ── Encryption (Author side) ─────────────────────────────────

/**
 * Encrypts post content for multiple recipients using the sender key model.
 *
 * @param plaintext       The post content string
 * @param recipients      Array of recipient key info (userId + shared secret)
 * @returns               Encrypted content + per-recipient key grants
 */
export async function encryptPostForRecipients(
  plaintext: string,
  recipients: RecipientKeyInfo[],
): Promise<PostEncryptionResult> {
  // Step 1: Generate a random per-post AES-256-GCM key
  const postKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable so we can wrap it for recipients
    ['encrypt', 'decrypt'],
  );

  // Step 2: Encrypt the post content with the post key
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const contentBytes = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    postKey,
    contentBytes,
  );

  // Step 3: Export the post key as raw bytes for wrapping
  const rawPostKey = await crypto.subtle.exportKey('raw', postKey);

  // Step 4: Wrap the post key for each recipient
  const keyGrants: PostKeyGrant[] = [];
  for (const recipient of recipients) {
    const wrapIv = crypto.getRandomValues(new Uint8Array(12));
    const wrappedKeyData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: wrapIv },
      recipient.sharedSecret,
      rawPostKey,
    );

    keyGrants.push({
      recipientId: recipient.userId,
      bondId: recipient.bondId,
      wrappedKey: toBase64(wrappedKeyData),
      wrapIv: toBase64(wrapIv.buffer),
    });
  }

  return {
    ciphertext,
    iv: toBase64(iv.buffer),
    keyGrants,
    postKey,
  };
}

// ── Decryption & Editing ────────────────────────────────────

/**
 * Unwraps a post key from a key grant using the provided shared secret.
 * Returns the post key as a CryptoKey usable for encrypt + decrypt.
 */
export async function unwrapPostKey(
  wrappedKey: string,
  wrapIv: string,
  sharedSecret: CryptoKey,
): Promise<CryptoKey> {
  const wrapIvBytes = new Uint8Array(fromBase64(wrapIv));
  const wrappedKeyData = fromBase64(wrappedKey);

  const rawPostKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: wrapIvBytes },
    sharedSecret,
    wrappedKeyData,
  );

  return crypto.subtle.importKey(
    'raw',
    rawPostKey,
    { name: 'AES-GCM', length: 256 },
    true, // extractable — needed for re-encryption
    ['encrypt', 'decrypt'],
  );
}

/**
 * Re-encrypts edited content using an existing post key.
 * Used when the author edits an encrypted post.
 */
export async function reEncryptPost(
  newPlaintext: string,
  postKey: CryptoKey,
): Promise<{ ciphertextBase64: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const contentBytes = new TextEncoder().encode(newPlaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    postKey,
    contentBytes,
  );

  return {
    ciphertextBase64: toBase64(ciphertext),
    iv: toBase64(iv.buffer),
  };
}

/**
 * Decrypts a post using a wrapped key grant and the recipient's shared secret.
 *
 * @param ciphertext      The encrypted post body
 * @param iv              Base64-encoded IV
 * @param wrappedKey      Base64-encoded wrapped post key
 * @param wrapIv          Base64-encoded IV used for key wrapping
 * @param sharedSecret    The recipient's shared secret (CryptoKey)
 * @returns               Decrypted plaintext string
 */
export async function decryptPost(
  ciphertext: ArrayBuffer,
  iv: string,
  wrappedKey: string,
  wrapIv: string,
  sharedSecret: CryptoKey,
): Promise<string> {
  // Step 1 & 2: Unwrap and import the post key
  const postKey = await unwrapPostKey(wrappedKey, wrapIv, sharedSecret);

  // Step 3: Decrypt the post content
  const ivBytes = new Uint8Array(fromBase64(iv));
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes, tagLength: 128 },
    postKey,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}
