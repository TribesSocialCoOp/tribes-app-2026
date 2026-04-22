/**
 * Client-side helper to upload a file to /api/upload.
 * Returns the public S3 URL on success.
 */
export async function uploadFile(file: File, folder: string, context?: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);
  if (context) formData.append('context', context);

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

  const { url } = await response.json();
  return url;
}
