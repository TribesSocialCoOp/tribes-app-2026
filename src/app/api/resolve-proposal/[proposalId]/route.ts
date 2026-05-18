import { NextResponse } from 'next/server';
import { db } from '@/db';
import { proposals } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { buildUrl } from '@/lib/url';

/**
 * Resolves a legacy voting proposalId to its slug and issues a 301 redirect.
 * Handles: /voting/[proposalId] -> 301 /vote/[slug]
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ proposalId: string }> }
) {
  const { proposalId } = await params;

  // Look up proposal's slug
  const rows = await db
    .select({ slug: proposals.slug })
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  const row = rows[0];
  if (!row || !row.slug) {
    // Fallback if proposal doesn't exist or has no slug
    return NextResponse.redirect(buildUrl('/voting', request), 302);
  }

  // Permanent 301 redirect to canonical slug URL
  return NextResponse.redirect(
    buildUrl(`/vote/${row.slug}`, request),
    301
  );
}
