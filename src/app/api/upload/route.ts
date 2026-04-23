/**
 * POST /api/upload — File upload endpoint.
 * Accepts FormData with 'file', optional 'folder', and optional 'context' fields.
 * Auth-guarded via session check + CSRF validation.
 *
 * Returns:
 *   - Public uploads: { url: string, fileId: string }
 *   - Private uploads: { fileId: string } (resolve via getMediaUrl action)
 *
 * Context values (controls CSAM scanning tier + bucket routing):
 *   public-tribe-post  — public bucket, scanned
 *   public-mood-board  — public bucket, scanned
 *   avatar             — public bucket, scanned
 *   bond-attachment    — private bucket, NOT scanned (E2E)
 *   private-mood-board — private bucket, NOT scanned at save
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/session';
import { validateCsrfToken } from '@/lib/auth/csrf';
import { uploadLimiter, getClientIp } from '@/lib/auth/rate-limit';
import { uploadImage, recordMediaFile, getBucketForContext, getUserStorageUsage, type UploadContext } from '@/lib/services/s3-service';
import { getQuotaForRole, formatBytes } from '@/lib/storage-quotas';
import { s3Logger } from '@/lib/logger';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  // 'image/svg+xml' — REMOVED: SVGs can embed <script> tags and event handlers.
  // If served from the same origin this is a stored XSS vector. Use raster formats only.
  // If SVG uploads are needed in future, implement server-side sanitization first.
  'application/octet-stream', // Encrypted files (E2E bond attachments)
];

const VALID_CONTEXTS = new Set<UploadContext>([
  'public-tribe-post',
  'public-mood-board',
  'avatar',
  'bond-attachment',
  'private-mood-board',
]);

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // CSRF validation — token passed via header
    const csrfToken = request.headers.get('X-CSRF-Token') ?? undefined;
    await validateCsrfToken(csrfToken);

    // Rate limiting by user
    await uploadLimiter.check(userId);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'uploads';
    const rawContext = (formData.get('context') as string) || 'public-tribe-post';
    const rawEncryptionMeta = formData.get('encryptionMeta') as string | null;

    // Parse encryption metadata (sent by client for E2E uploads)
    let encryptionMeta: object | undefined;
    if (rawEncryptionMeta) {
      try {
        encryptionMeta = JSON.parse(rawEncryptionMeta);
      } catch {
        return NextResponse.json({ error: 'Invalid encryption metadata' }, { status: 400 });
      }
    }

    // Validate and coerce context — default to most-restrictive (scanned) if unknown
    const context: UploadContext = VALID_CONTEXTS.has(rawContext as UploadContext)
      ? (rawContext as UploadContext)
      : 'public-tribe-post';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 5MB` },
        { status: 400 }
      );
    }

    const clientIp = getClientIp(request.headers);

    // ── Storage quota enforcement ──────────────────────────────
    const bucket = getBucketForContext(context);
    const [userRow] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    const userRole = userRow?.role ?? 'Human_Free';
    const quota = getQuotaForRole(userRole);
    const limit = bucket === 'public' ? quota.publicBytes : quota.privateBytes;

    if (limit !== null) {
      const usage = await getUserStorageUsage(userId);
      const currentUsage = bucket === 'public' ? usage.public : usage.private;
      if (currentUsage + file.size > limit) {
        return NextResponse.json(
          {
            error: `Storage quota exceeded. Using ${formatBytes(currentUsage)} of ${formatBytes(limit)} ${bucket} storage. ` +
              `This file (${formatBytes(file.size)}) would exceed your limit. Upgrade your plan for more storage.`,
          },
          { status: 413 }
        );
      }
    }

    try {
      // Upload to S3 (routes to public or private bucket based on context)
      const result = await uploadImage(file, folder, context, userId);

      // Record in the media file registry
      const fileId = await recordMediaFile({
        userId,
        bucket: result.bucket,
        s3Key: result.s3Key,
        context,
        fileName: file.name || 'upload.bin',
        contentType: file.type || 'application/octet-stream',
        sizeBytes: result.sizeBytes,
        encrypted: !!encryptionMeta,
        encryptionMeta,
        publicUrl: result.url,
      });

      s3Logger.info(
        {
          userId,
          fileId,
          filename: file.name,
          type: file.type,
          sizeKb: Math.round(file.size / 1024),
          context,
          bucket: result.bucket,
          url: result.url,
        },
        'Upload complete'
      );

      // Public: return URL + fileId. Private: return fileId only.
      if (result.url) {
        return NextResponse.json({ url: result.url, fileId });
      } else {
        return NextResponse.json({ fileId });
      }
    } catch (uploadErr: unknown) {
      // If CSAM was detected, log the full context
      if (uploadErr instanceof Error && uploadErr.message.includes('content policy violation')) {
        s3Logger.fatal(
          { userId, clientIp, filename: file.name, context },
          'CSAM upload blocked — report filed by csam-service'
        );
        return NextResponse.json(
          { error: 'Upload rejected: content policy violation' },
          { status: 422 }
        );
      }
      throw uploadErr;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    s3Logger.error({ err }, 'Upload route error');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
