import { notFound, permanentRedirect } from 'next/navigation';
import { getPostById } from '@/lib/actions/content-actions';
import { buildPostPath } from '@/lib/utils/slugify';

interface PageProps {
  params: Promise<{ slug: string; postId: string; postSlug?: string[] }>;
}

/**
 * Legacy Tribe-scoped Post Detail Page.
 * Performs a 308 Permanent Redirect to the new canonical slug-scoped route.
 */
export default async function LegacyTribePostDetailPage({ params }: PageProps) {
  const { postId } = await params;

  if (!postId) {
    notFound();
  }

  const data = await getPostById(postId);

  if (!data) {
    console.warn(`[LegacyTribePostPage] Post not found or access denied: ${postId}`);
    notFound();
  }

  const canonicalPath = buildPostPath(postId, data.post.slug, data.tribeSlug);
  permanentRedirect(canonicalPath);
}
