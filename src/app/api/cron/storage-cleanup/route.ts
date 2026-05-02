/**
 * POST /api/cron/storage-cleanup — Purge soft-deleted files from S3.
 *
 * This endpoint is designed to be called by a cron job (e.g., daily).
 * It hard-deletes S3 objects for files that were soft-deleted more than
 * 30 days ago, then removes the media_files rows.
 *
 * Protected by a shared secret (CRON_SECRET env var) to prevent abuse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { mediaFiles } from '@/db/schema';
import { eq, lte, isNotNull, and } from 'drizzle-orm';
import { deleteObject, type BucketType } from '@/lib/services/s3-service';
import { s3Logger } from '@/lib/logger';

const PURGE_AFTER_DAYS = 30;

export async function POST(request: NextRequest) {
  // Authenticate via shared secret
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('Authorization');

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - PURGE_AFTER_DAYS);

    // Find all soft-deleted files older than the cutoff
    const filesToPurge = await db.select({
      id: mediaFiles.id,
      s3Key: mediaFiles.s3Key,
      bucket: mediaFiles.bucket,
      sizeBytes: mediaFiles.sizeBytes,
    })
      .from(mediaFiles)
      .where(
        and(
          isNotNull(mediaFiles.deletedAt),
          lte(mediaFiles.deletedAt, cutoffDate)
        )
      );

    let purged = 0;
    let failed = 0;
    let bytesReclaimed = 0;

    for (const file of filesToPurge) {
      try {
        // Delete from S3
        await deleteObject(file.s3Key, file.bucket as BucketType);

        // Hard-delete the DB row
        await db.delete(mediaFiles)
          .where(eq(mediaFiles.id, file.id))
          ;

        purged++;
        bytesReclaimed += file.sizeBytes;
      } catch (err) {
        s3Logger.error({ err, fileId: file.id, s3Key: file.s3Key }, 'Failed to purge file');
        failed++;
      }
    }

    const summary = {
      found: filesToPurge.length,
      purged,
      failed,
      bytesReclaimed,
      cutoffDate: cutoffDate.toISOString(),
    };

    s3Logger.info(summary, 'Storage cleanup complete');
    return NextResponse.json(summary);
  } catch (err) {
    s3Logger.error({ err }, 'Storage cleanup failed');
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
