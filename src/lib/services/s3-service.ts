import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { scanForCSAM, reportToNCMEC } from './csam-service';
import { scanForNciiBlocklist } from './ncii-service';
import { isSvgFile } from '@/lib/svg-sanitizer';
import { s3Logger } from '@/lib/logger';

// ============================================================
// Upload Context — controls CSAM scanning & bucket routing
// ============================================================
//
// Tiered scanning model:
//
//   SCANNED (public bucket, distributed by us):
//     public-tribe-post  — posted to a tribe feed
//     public-mood-board  — shared/published mood board
//     avatar             — profile/tribe avatar (publicly displayed)
//
//   NOT SCANNED (private bucket, E2E or access-controlled):
//     bond-attachment    — E2E encrypted DM attachment; server cannot
//                          have "actual knowledge" (18 USC § 2258A)
//     private-mood-board — saved but not shared; scanned at publish time
//
// When a private-mood-board is published, call uploadImage() again with
// context='public-mood-board', or add a separate scanOnPublish() call.

export type UploadContext =
  | 'public-tribe-post'
  | 'public-mood-board'
  | 'avatar'
  | 'bond-attachment'
  | 'private-mood-board'
  | 'encrypted-post-image';

/** Contexts that require CSAM scanning before storage */
const SCAN_CONTEXTS = new Set<UploadContext>([
  'public-tribe-post',
  'public-mood-board',
  'avatar',
]);

/** Contexts routed to the public (CDN) bucket */
const PUBLIC_CONTEXTS = new Set<UploadContext>([
  'public-tribe-post',
  'public-mood-board',
  'avatar',
]);

export type BucketType = 'public' | 'private';

// ============================================================
// S3 Configuration — validated at startup
// ============================================================

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[S3 Service] Missing required environment variable: ${name}. ` +
      `Set it in .env or .env.local. See .env.example for reference.`
    );
  }
  return value;
}

const s3Endpoint        = requireEnv('S3_ENDPOINT');
const s3Region          = process.env.S3_REGION || "us-east-1";
const s3AccessKeyId     = requireEnv('S3_ACCESS_KEY_ID');
const s3SecretAccessKey = requireEnv('S3_SECRET_ACCESS_KEY');
const s3PublicEndpoint  = requireEnv('S3_PUBLIC_ENDPOINT');

// Bucket names — defaults for backward compat
const PUBLIC_BUCKET  = process.env.S3_BUCKET_NAME || 'tribes';
const PRIVATE_BUCKET = process.env.S3_PRIVATE_BUCKET_NAME || 'tribes-private';

const s3Client = new S3Client({
  region: s3Region,
  endpoint: s3Endpoint,
  credentials: {
    accessKeyId: s3AccessKeyId,
    secretAccessKey: s3SecretAccessKey,
  },
  forcePathStyle: true, // Required for SeaweedFS/minio
});

// ============================================================
// Bucket Resolution
// ============================================================

/** Determine which bucket a context routes to */
export function getBucketForContext(context: UploadContext): BucketType {
  return PUBLIC_CONTEXTS.has(context) ? 'public' : 'private';
}

function getBucketName(bucket: BucketType): string {
  return bucket === 'public' ? PUBLIC_BUCKET : PRIVATE_BUCKET;
}

// ============================================================
// Upload
// ============================================================

export interface UploadResult {
  /** For public: the CDN URL. For private: null (use getMediaUrl with the fileId). */
  url: string | null;
  /** The S3 object key */
  s3Key: string;
  /** Which bucket was used */
  bucket: BucketType;
  /** File size in bytes */
  sizeBytes: number;
}

/**
 * Upload an image to SeaweedFS (S3-compatible).
 *
 * Routes to public or private bucket based on context.
 * Scans for CSAM via PDQ + NCMEC hash list for public contexts.
 *
 * @param file    The file object (from Next.js FormData)
 * @param folder  Path prefix, e.g. 'posts' or 'avatars'
 * @param context Upload context — determines scanning + bucket
 * @param userId  Owner user ID — used for private bucket namespacing
 * @returns       Upload result with URL (public) or key (private)
 */
export async function uploadImage(
  file: File,
  folder: string,
  context: UploadContext = 'public-tribe-post',
  userId?: string
): Promise<UploadResult> {
  if (!file) throw new Error("No file provided to upload");

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // ── CSAM scan — only for public/distributed raster content ──────
  // SVGs are vector graphics — PDQ perceptual hashing requires raster pixel data.
  const isSvg = isSvgFile(file);

  if (SCAN_CONTEXTS.has(context) && !isSvg) {
    const scanResult = await scanForCSAM(buffer, file.name);
    if (scanResult.isMatch) {
      await reportToNCMEC(scanResult, { filename: file.name });
      throw new Error('Upload rejected: content policy violation');
    }

    // ── NCII blocklist scan ──────────────────────────────────
    const nciiScanResult = await scanForNciiBlocklist(buffer, file.name);
    if (nciiScanResult.isBlocked) {
      s3Logger.warn(
        { filename: file.name, matchedHash: nciiScanResult.matchedHash },
        'Upload rejected: matched NCII perceptual hash blocklist'
      );
      throw new Error('Upload rejected: content policy violation');
    }
  } else {
    s3Logger.debug(
      { context, filename: file.name, isSvg },
      isSvg ? 'CSAM scan skipped (SVG — not rasterizable)' : 'CSAM scan skipped (exempt context)'
    );
  }

  const bucket = getBucketForContext(context);
  const bucketName = getBucketName(bucket);

  // Ensure bucket exists (lazy-init, idempotent)
  await ensureBucketExists(bucketName);

  // Generate short opaque key: 4-byte timestamp + 8 random bytes (no original filename in URL)
  const tsHex = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);
  const uniqueId = tsHex + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const ext = file.name && file.name.includes('.')
    ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase().replace(/[^a-z0-9.]/g, '')
    : '';

  // Private files are namespaced under the user's folder
  const keyPrefix = bucket === 'private' && userId
    ? `users/${userId}/${folder}`
    : folder;
  const s3Key = `${keyPrefix}/${uniqueId}${ext}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
    Body: buffer,
    ContentType: file.type || 'application/octet-stream',
  });

  await s3Client.send(command);

  // Public files get a direct CDN URL; private files don't
  const url = bucket === 'public'
    ? `${s3PublicEndpoint}/${bucketName}/${s3Key}`
    : null;

  return { url, s3Key, bucket, sizeBytes: buffer.length };
}

// ============================================================
// Presigned URL Generation (Private Files)
// ============================================================

/** Default presigned URL expiry: 15 minutes */
const PRESIGNED_EXPIRY_SECONDS = 15 * 60;

/**
 * Generate a time-limited presigned GET URL for a private file.
 *
 * @param s3Key   The S3 object key in the private bucket
 * @param expiresIn  Seconds until URL expires (default: 15 min)
 * @returns Presigned URL string
 */
export async function getPresignedUrl(
  s3Key: string,
  expiresIn: number = PRESIGNED_EXPIRY_SECONDS
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: PRIVATE_BUCKET,
    Key: s3Key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

// ============================================================
// File Deletion
// ============================================================

/**
 * Fetches a private file directly from S3 as a readable stream.
 * Used by the server-side media proxy to stream encrypted file content
 * to the browser without exposing internal S3 endpoints.
 *
 * @param s3Key  The S3 object key in the private bucket
 * @returns Object with body stream and content length, or null if not found
 */
export async function getPrivateFileStream(
  s3Key: string,
): Promise<{ body: ReadableStream; contentLength?: number } | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: PRIVATE_BUCKET,
      Key: s3Key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) return null;

    // Convert the S3 SDK stream to a web ReadableStream
    const webStream = response.Body.transformToWebStream();

    return {
      body: webStream,
      contentLength: response.ContentLength,
    };
  } catch (err: unknown) {
    s3Logger.error({ err, s3Key }, 'Failed to fetch private file from S3');
    return null;
  }
}


/**
 * Delete an object from S3 (used by cleanup/purge jobs).
 */
export async function deleteObject(s3Key: string, bucket: BucketType): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: getBucketName(bucket),
    Key: s3Key,
  });
  await s3Client.send(command);
  s3Logger.info({ s3Key, bucket }, 'S3 object deleted');
}

// ============================================================
// File Registry (DB Operations)
// ============================================================

import { db } from '@/db';
import { mediaFiles } from '@/db/schema';
import { eq, and, or, isNull, sql } from 'drizzle-orm';

export interface RecordMediaInput {
  userId: string;
  bucket: BucketType;
  s3Key: string;
  context: UploadContext;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  encrypted?: boolean;
  encryptionMeta?: object;
  publicUrl?: string | null;
}

/**
 * Record a file in the media registry after successful S3 upload.
 * Returns the generated file ID.
 */
export async function recordMediaFile(input: RecordMediaInput): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(mediaFiles).values({
    id,
    userId: input.userId,
    bucket: input.bucket,
    s3Key: input.s3Key,
    context: input.context,
    fileName: input.fileName,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    encrypted: input.encrypted ?? false,
    encryptionMeta: input.encryptionMeta ? JSON.stringify(input.encryptionMeta) : null,
    publicUrl: input.publicUrl ?? null,
  });

  s3Logger.info({ fileId: id, userId: input.userId, bucket: input.bucket, context: input.context }, 'Media file recorded');
  return id;
}

/**
 * Resolve a media file to a URL.
 * - Public files: returns the CDN URL directly
 * - Private files: generates a presigned URL (if the requesting user has access)
 *
 * @param fileId  The media_files row ID
 * @param requestingUserId  The user requesting access (for authorization)
 * @returns URL string, or null if not found / unauthorized
 */
export async function getMediaUrl(
  fileId: string,
  requestingUserId: string
): Promise<string | null> {
  const [file] = await db.select()
    .from(mediaFiles)
    .where(and(eq(mediaFiles.id, fileId), isNull(mediaFiles.deletedAt)))
    .limit(1);

  if (!file) return null;

  // Public files — return CDN URL directly
  if (file.bucket === 'public' && file.publicUrl) {
    return file.publicUrl;
  }

  // Private files — verify ownership or shared access
  if (file.userId !== requestingUserId) {
    // Check 1: Direct bond with the file owner (DM attachments)
    const { bonds, tribeMembers: tribeMembersTable } = await import('@/db/schema');
    const { inArray } = await import('drizzle-orm');
    const [bond] = await db.select({ id: bonds.id })
      .from(bonds)
      .where(or(
        and(eq(bonds.userId, requestingUserId), eq(bonds.targetId, file.userId)),
        and(eq(bonds.userId, file.userId), eq(bonds.targetId, requestingUserId)),
      ))
      .limit(1);

    if (bond) {
      // Bond partner — grant access via presigned URL
      return getPresignedUrl(file.s3Key);
    }

    // Check 2: Shared tribe membership (encrypted tribe post images)
    // If both the file owner and the requester are members of the same tribe, grant access.
    const ownerTribes = await db.select({ tribeId: tribeMembersTable.tribeId })
      .from(tribeMembersTable)
      .where(eq(tribeMembersTable.userId, file.userId));
    const ownerTribeIds = ownerTribes.map(t => t.tribeId);

    if (ownerTribeIds.length > 0) {
      const [sharedMembership] = await db.select({ id: tribeMembersTable.id })
        .from(tribeMembersTable)
        .where(and(
          eq(tribeMembersTable.userId, requestingUserId),
          inArray(tribeMembersTable.tribeId, ownerTribeIds),
        ))
        .limit(1);

      if (sharedMembership) {
        return getPresignedUrl(file.s3Key);
      }
    }

    // No ownership, no bond, no shared tribe — deny
    s3Logger.warn({ fileId, ownerId: file.userId, requesterId: requestingUserId }, 'Unauthorized media access attempt');
    return null;
  }

  // Generate presigned URL for private file (owner access)
  return getPresignedUrl(file.s3Key);
}

/**
 * Get total storage used by a user (in bytes), split by bucket.
 */
export async function getUserStorageUsage(userId: string): Promise<{ public: number; private: number; total: number }> {
  const rows = await db.select({
    bucket: mediaFiles.bucket,
    total: sql<number>`SUM(${mediaFiles.sizeBytes})`,
  })
    .from(mediaFiles)
    .where(and(eq(mediaFiles.userId, userId), isNull(mediaFiles.deletedAt)))
    .groupBy(mediaFiles.bucket);

  let publicUsage = 0;
  let privateUsage = 0;
  for (const row of rows) {
    // PostgreSQL SUM() returns bigint, which the pg driver sends as a string.
    // Must explicitly cast to number to avoid string concatenation in comparisons.
    const total = Number(row.total) || 0;
    if (row.bucket === 'public') publicUsage = total;
    if (row.bucket === 'private') privateUsage = total;
  }

  return { public: publicUsage, private: privateUsage, total: publicUsage + privateUsage };
}

/**
 * Soft-delete a media file. The actual S3 object is purged by a cleanup job later.
 */
export async function softDeleteMediaFile(fileId: string, userId: string): Promise<boolean> {
  const result = await db.update(mediaFiles)
    .set({ deletedAt: new Date() })
    .where(and(eq(mediaFiles.id, fileId), eq(mediaFiles.userId, userId), isNull(mediaFiles.deletedAt)))
    ;

  return (result.rowCount ?? 0) > 0;
}

// ============================================================
// Bucket Initialisation
// ============================================================

const checkedBuckets = new Set<string>();

async function ensureBucketExists(bucketName: string) {
  if (checkedBuckets.has(bucketName)) return;
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    checkedBuckets.add(bucketName);
  } catch (error: unknown) {
    const s3Error = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (s3Error.name === "NotFound" || s3Error.$metadata?.httpStatusCode === 404) {
      s3Logger.info({ bucket: bucketName }, "Bucket not found — creating");
      await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
      checkedBuckets.add(bucketName);
    } else {
      s3Logger.error({ err: error }, "Error checking bucket");
      throw error;
    }
  }
}
