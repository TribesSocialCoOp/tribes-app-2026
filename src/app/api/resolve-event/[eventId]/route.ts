import { NextResponse } from 'next/server';
import { db } from '@/db';
import { events } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { buildUrl } from '@/lib/url';

/**
 * Resolves a legacy event eventId to its slug and issues a 301 redirect.
 * Handles: /events/[eventId] -> 301 /e/[slug]
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  // Look up event's slug
  const rows = await db
    .select({ slug: events.slug })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  const row = rows[0];
  if (!row || !row.slug) {
    // Fallback if event doesn't exist or has no slug
    return NextResponse.redirect(buildUrl('/events', request), 302);
  }

  // Permanent 301 redirect to canonical slug URL
  return NextResponse.redirect(
    buildUrl(`/e/${row.slug}`, request),
    301
  );
}
