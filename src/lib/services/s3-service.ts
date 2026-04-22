import { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { scanForCSAM, reportToNCMEC } from './csam-service';
import { s3Logger } from '@/lib/logger';

// ============================================================
// Upload Context — controls CSAM scanning behaviour
// ============================================================
//
// Tiered scanning model:
//
//   SCANNED (public, distributed by us):
//     public-tribe-post  — posted to a tribe feed
//     public-mood-board  — shared/published mood board
//     avatar             — profile/tribe avatar (publicly displayed)
//
//   NOT SCANNED (private or E2E):
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
  | 'private-mood-board';

const SCAN_CONTEXTS = new Set<UploadContext>([
  'public-tribe-post',
  'public-mood-board',
  'avatar',
]);

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
const s3BucketName      = requireEnv('S3_BUCKET_NAME');
const s3PublicEndpoint  = requireEnv('S3_PUBLIC_ENDPOINT');

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
// Upload
// ============================================================

/**
 * Upload an image to SeaweedFS (S3-compatible).
 *
 * Scans for CSAM via PDQ + NCMEC hash list before writing to storage.
 * Scanning is automatically skipped for private/E2E contexts.
 *
 * @param file    The file object (from Next.js FormData)
 * @param folder  Path prefix, e.g. 'posts' or 'avatars'
 * @param context Upload context — determines whether CSAM scan runs
 * @returns       Public URL to the uploaded file
 */
export async function uploadImage(
  file: File,
  folder: string,
  context: UploadContext = 'public-tribe-post'
): Promise<string> {
  if (!file) throw new Error("No file provided to upload");

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // ── CSAM scan — only for public/distributed content ──────
  if (SCAN_CONTEXTS.has(context)) {
    const scanResult = await scanForCSAM(buffer, file.name);
    if (scanResult.isMatch) {
      // reportToNCMEC is called here; caller must also pass userId + IP
      // for a complete report. See upload/route.ts for the full call.
      await reportToNCMEC(scanResult, { filename: file.name });
      throw new Error('Upload rejected: content policy violation');
    }
  } else {
    s3Logger.debug(
      { context, filename: file.name },
      'CSAM scan skipped (exempt context)'
    );
  }

  // Ensure bucket exists (lazy-init, idempotent)
  await ensureBucketExists();

  // Sanitize filename and generate unique key
  const uniqueId = crypto.randomUUID();
  const sanitizedName = file.name
    ? file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
    : 'upload.bin';
  const filename = `${folder}/${uniqueId}-${sanitizedName}`;

  const command = new PutObjectCommand({
    Bucket: s3BucketName,
    Key: filename,
    Body: buffer,
    ContentType: file.type || 'application/octet-stream',
  });

  await s3Client.send(command);

  return `${s3PublicEndpoint}/${s3BucketName}/${filename}`;
}

// ============================================================
// Bucket Initialisation
// ============================================================

let bucketChecked = false;

async function ensureBucketExists() {
  if (bucketChecked) return;
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: s3BucketName }));
    bucketChecked = true;
  } catch (error: unknown) {
    const s3Error = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (s3Error.name === "NotFound" || s3Error.$metadata?.httpStatusCode === 404) {
      s3Logger.info({ bucket: s3BucketName }, "Bucket not found — creating");
      await s3Client.send(new CreateBucketCommand({ Bucket: s3BucketName }));
      bucketChecked = true;
    } else {
      s3Logger.error({ err: error }, "Error checking bucket");
      throw error;
    }
  }
}
