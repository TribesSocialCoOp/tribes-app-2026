/**
 * POST /api/upload — File upload endpoint.
 * Accepts FormData with 'file', optional 'folder', and optional 'context' fields.
 * Auth-guarded via session check + CSRF validation.
 * Returns { url: string } — the public S3 URL.
 *
 * Context values (controls CSAM scanning tier):
 *   public-tribe-post  — default, scanned
 *   public-mood-board  — scanned
 *   avatar             — scanned
 *   bond-attachment    — NOT scanned (E2E private)
 *   private-mood-board — NOT scanned at save (scanned at publish)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/session';
import { validateCsrfToken } from '@/lib/auth/csrf';
import { uploadLimiter, getClientIp } from '@/lib/auth/rate-limit';
import { uploadImage, type UploadContext } from '@/lib/services/s3-service';
import { reportToNCMEC } from '@/lib/services/csam-service';
import { s3Logger } from '@/lib/logger';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

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

    try {
      const url = await uploadImage(file, folder, context);
      s3Logger.info(
        {
          userId,
          filename: file.name,
          type: file.type,
          sizeKb: Math.round(file.size / 1024),
          context,
          url,
        },
        'Upload complete'
      );
      return NextResponse.json({ url });
    } catch (uploadErr: unknown) {
      // If CSAM was detected, enrich the report with userId + IP then re-throw
      if (uploadErr instanceof Error && uploadErr.message.includes('content policy violation')) {
        // The scan already ran — re-fire report with full context
        // Note: scanResult is not directly accessible here; the csam-service
        // already logged the FATAL event. This adds the user context.
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
