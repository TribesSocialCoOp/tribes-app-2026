/**
 * Server-side proxy for encrypted media files.
 *
 * This endpoint streams encrypted file content from private S3 storage
 * to the browser, avoiding the need to expose internal S3 endpoints
 * or modify CSP headers. The browser then decrypts client-side.
 *
 * Flow:
 *   1. Client calls GET /api/media/[fileId]
 *   2. Server verifies authentication + authorization
 *   3. Server fetches ciphertext from S3 (internal network)
 *   4. Server streams ciphertext + encryption meta to browser
 *   5. Browser decrypts with the appropriate key (tribe/bond/journal)
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;

  try {
    // 1. Authenticate
    const { getCurrentUserId } = await import('@/lib/actions/shared');
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Look up the file record
    const { db } = await import('@/db');
    const { mediaFiles } = await import('@/db/schema');
    const { eq, and, isNull } = await import('drizzle-orm');

    const [file] = await db.select()
      .from(mediaFiles)
      .where(and(eq(mediaFiles.id, fileId), isNull(mediaFiles.deletedAt)))
      .limit(1);

    if (!file) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // 3. Authorize — owner, bond partner, or shared tribe member
    if (file.userId !== userId) {
      const { bonds, tribeMembers } = await import('@/db/schema');
      const { or, inArray } = await import('drizzle-orm');

      // Check direct bond
      const [bond] = await db.select({ id: bonds.id })
        .from(bonds)
        .where(or(
          and(eq(bonds.userId, userId), eq(bonds.targetId, file.userId)),
          and(eq(bonds.userId, file.userId), eq(bonds.targetId, userId)),
        ))
        .limit(1);

      if (!bond) {
        // Check shared tribe membership
        const ownerTribes = await db.select({ tribeId: tribeMembers.tribeId })
          .from(tribeMembers)
          .where(eq(tribeMembers.userId, file.userId));
        const ownerTribeIds = ownerTribes.map(t => t.tribeId);

        let authorized = false;
        if (ownerTribeIds.length > 0) {
          const [shared] = await db.select({ id: tribeMembers.id })
            .from(tribeMembers)
            .where(and(
              eq(tribeMembers.userId, userId),
              inArray(tribeMembers.tribeId, ownerTribeIds),
            ))
            .limit(1);
          authorized = !!shared;
        }

        if (!authorized) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      }
    }

    // 4. Fetch the file directly from S3 (server-to-server, internal network)
    const { getPrivateFileStream } = await import('@/lib/services/s3-service');
    const s3Result = await getPrivateFileStream(file.s3Key);

    if (!s3Result || !s3Result.body) {
      return NextResponse.json({ error: 'Storage error' }, { status: 502 });
    }

    // 5. Stream the ciphertext to the browser with encryption meta
    const headers = new Headers();
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('Cache-Control', 'private, max-age=300'); // 5 min cache
    if (file.encryptionMeta) {
      // Send encryption meta as a response header so the client
      // doesn't need a separate server action call
      headers.set('X-Encryption-Meta', file.encryptionMeta);
    }
    if (s3Result.contentLength) {
      headers.set('Content-Length', String(s3Result.contentLength));
    }

    return new NextResponse(s3Result.body as ReadableStream, {
      status: 200,
      headers,
    });
  } catch (err: unknown) {
    console.error('[media-proxy] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
