'use server';

/**
 * Server actions for the media/storage system.
 * Provides secure access to private files via presigned URLs,
 * storage usage info, and file deletion.
 */

import { requireAuth, getCurrentUserId } from './shared';

// ======== MEDIA URL RESOLUTION ========

/**
 * Resolve a media file ID to a URL.
 * - Public files: returns the CDN URL
 * - Private files: generates a time-limited presigned URL (15 min)
 */
export async function resolveMediaUrl(fileId: string): Promise<{ url: string; encryptionMeta?: object } | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { getMediaUrl } = await import('@/lib/services/s3-service');
  const url = await getMediaUrl(fileId, userId);
  if (!url) return null;

  const { db } = await import('@/db');
  const { mediaFiles } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [file] = await db.select({ encryptionMeta: mediaFiles.encryptionMeta }).from(mediaFiles).where(eq(mediaFiles.id, fileId)).limit(1);

  return {
    url,
    encryptionMeta: file?.encryptionMeta ? JSON.parse(file.encryptionMeta) : undefined,
  };
}

// ======== STORAGE USAGE ========

/**
 * Get current user's storage usage breakdown.
 */
export async function getMyStorageUsage(): Promise<{
  public: number;
  private: number;
  total: number;
}> {
  const userId = await requireAuth();
  const { getUserStorageUsage } = await import('@/lib/services/s3-service');
  return getUserStorageUsage(userId);
}

// ======== FILE DELETION ========

/**
 * Soft-delete a file owned by the current user.
 */
export async function deleteMediaFile(fileId: string): Promise<boolean> {
  const userId = await requireAuth();
  const { softDeleteMediaFile } = await import('@/lib/services/s3-service');
  return softDeleteMediaFile(fileId, userId);
}

// ======== STORAGE INFO (Usage + Quota) ========

/**
 * Get current user's storage usage AND quota in one call.
 * Suitable for displaying a storage meter in settings.
 */
export async function getMyStorageInfo(): Promise<{
  usage: { public: number; private: number; total: number };
  quota: { publicBytes: number | null; privateBytes: number | null };
}> {
  const userId = await requireAuth();

  const [{ getUserStorageUsage }, { db }, { users }, { eq }, { getQuotaForRole }] = await Promise.all([
    import('@/lib/services/s3-service'),
    import('@/db'),
    import('@/db/schema'),
    import('drizzle-orm'),
    import('@/lib/storage-quotas'),
  ]);

  const [usage, [userRow]] = await Promise.all([
    getUserStorageUsage(userId),
    db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1),
  ]);

  const quota = getQuotaForRole(userRow?.role ?? 'Human_Free');

  return { usage, quota };
}
