import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/unfurl — Server-side URL metadata fetching.
 *
 * Accepts: { url: string }
 * Returns: LinkPreviewData | { error: string }
 *
 * Auth-gated, rate-limited (30/min per user).
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const { getCurrentUserId } = await import('@/lib/actions/shared');
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse body
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid URL' }, { status: 400 });
    }

    // Basic URL validation
    if (url.length > 2048) {
      return NextResponse.json({ error: 'URL too long' }, { status: 400 });
    }

    // Unfurl with S3 image proxying
    const { unfurlAndProxyUrl } = await import('@/lib/services/unfurl-service');
    const preview = await unfurlAndProxyUrl(url, userId);

    if (!preview) {
      return NextResponse.json({ error: 'Could not fetch preview' }, { status: 422 });
    }

    return NextResponse.json(preview);
  } catch (err) {
    console.error('[/api/unfurl] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
