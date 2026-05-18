import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { buildUrl } from '@/lib/url';

/**
 * Resolves a legacy profile userId to its user slug and issues a 301 redirect.
 * Handles: /profile/[userId] -> 301 /u/[slug]
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  // Look up user's slug
  const rows = await db
    .select({ slug: users.slug })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  if (!row || !row.slug) {
    // Fallback if user doesn't exist or has no slug
    return NextResponse.redirect(buildUrl('/your-comms', request), 302);
  }

  // Permanent 301 redirect to canonical slug URL
  return NextResponse.redirect(
    buildUrl(`/u/${row.slug}`, request),
    301
  );
}
