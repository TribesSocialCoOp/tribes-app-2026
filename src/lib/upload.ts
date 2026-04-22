/**
 * Client-side helper to upload a file to /api/upload.
 * Returns the public S3 URL on success.
 */
export async function uploadFile(file: File, folder: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || `Upload failed: ${response.status}`);
  }

  const { url } = await response.json();
  return url;
}
