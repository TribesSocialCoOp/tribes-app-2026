/**
 * Client-side helper to upload a file to /api/upload.
 *
 * Supports two modes:
 *   - Public (default): Returns the CDN URL directly
 *   - Private/Encrypted: Optionally encrypts client-side before upload,
 *     returns a fileId that must be resolved via resolveMediaUrl()
 */

import type { EncryptionMeta } from '@/lib/crypto/file-encryption';

export interface UploadOptions {
  /** Upload context — controls bucket routing + CSAM scanning */
  context?: string;
  /** Bond shared secret — if provided, file is E2E encrypted before upload */
  bondSharedSecret?: ArrayBuffer;
}

export interface UploadResult {
  /** Public CDN URL (only for public uploads) */
  url?: string;
  /** File ID in the media registry (always present) */
  fileId: string;
  /** Encryption metadata (only for encrypted uploads — store this with the message) */
  encryptionMeta?: EncryptionMeta;
}

/**
 * Upload a file to /api/upload.
 *
 * For bond attachments with a shared secret, the file is encrypted
 * client-side before upload. The encryption metadata must be sent
 * to the bond partner (e.g., alongside the chat message) so they
 * can decrypt.
 */
export async function uploadFile(
  file: File,
  folder: string,
  optionsOrContext?: UploadOptions | string
): Promise<string>;
export async function uploadFile(
  file: File,
  folder: string,
  options: UploadOptions
): Promise<UploadResult>;
export async function uploadFile(
  file: File,
  folder: string,
  optionsOrContext?: UploadOptions | string
): Promise<string | UploadResult> {
  // Backward-compat: if a string is passed, treat as context
  const options: UploadOptions = typeof optionsOrContext === 'string'
    ? { context: optionsOrContext }
    : (optionsOrContext ?? {});

  let fileToUpload = file;
  let encryptionMeta: EncryptionMeta | undefined;

  // Client-side encryption for bond attachments
  if (options.bondSharedSecret && options.context === 'bond-attachment') {
    const { encryptFileForUpload } = await import('@/lib/crypto/file-encryption');
    const result = await encryptFileForUpload(file, options.bondSharedSecret);
    fileToUpload = result.encryptedFile;
    encryptionMeta = result.meta;
  }

  const formData = new FormData();
  formData.append('file', fileToUpload);
  formData.append('folder', folder);
  if (options.context) formData.append('context', options.context);
  if (encryptionMeta) formData.append('encryptionMeta', JSON.stringify(encryptionMeta));

  // Read CSRF token from cookie (set by proxy.ts, NOT httpOnly)
  const csrfToken = document.cookie.match(/(?:^|;\s*)__tribes_csrf=([^;]*)/)?.[1] ?? '';

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || `Upload failed: ${response.status}`);
  }

  const data = await response.json();

  // If called with options object, return full result
  if (typeof optionsOrContext === 'object') {
    return {
      url: data.url,
      fileId: data.fileId,
      encryptionMeta,
    };
  }

  // Backward-compat: return URL string (or fileId if no URL)
  return data.url || data.fileId;
}
