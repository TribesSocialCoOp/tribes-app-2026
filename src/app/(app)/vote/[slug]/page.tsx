import { db } from '@/db';
import { proposals, proposalSlugRedirects } from '@/db/schema';
import { eq, and, or, isNull, gte } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import ProposalDetailPage from '../../voting/[proposalId]/page';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProposalSlugPage({ params }: PageProps) {
  const { slug } = await params;

  // 1. Look up proposal by slug
  const [proposalRow] = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(eq(proposals.slug, slug))
    .limit(1);

  if (proposalRow) {
    return <ProposalDetailPage proposalId={proposalRow.id} />;
  }

  // 2. Check slug redirects (only non-expired)
  const [redirectRow] = await db
    .select({ slug: proposals.slug })
    .from(proposalSlugRedirects)
    .innerJoin(proposals, eq(proposals.id, proposalSlugRedirects.proposalId))
    .where(and(
      eq(proposalSlugRedirects.oldSlug, slug),
      or(isNull(proposalSlugRedirects.expiresAt), gte(proposalSlugRedirects.expiresAt, new Date()))
    ))
    .limit(1);

  if (redirectRow && redirectRow.slug) {
    // Permanent 308 redirect to new slug
    redirect(`/vote/${redirectRow.slug}`);
  }

  // 3. Fallback: not found
  notFound();
}
