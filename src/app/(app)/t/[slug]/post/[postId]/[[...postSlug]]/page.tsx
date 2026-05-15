import { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { getPostForOg, getPostById } from '@/lib/actions/content-actions';
import { PostDetailClient } from '../../../../../post/[postId]/[[...slug]]/post-detail-client';
import { buildPostPath } from '@/lib/utils/slugify';

interface PageProps {
  params: Promise<{ slug: string; postId: string; postSlug?: string[] }>;
}

/**
 * Generates OG metadata for the post for link unfurling.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { postId } = await params;

  if (!postId) return { title: 'Post Not Found' };

  const postOg = await getPostForOg(postId);
  if (!postOg) return { title: 'Post Not Found' };

  const title = postOg.title || `Post in ${postOg.tribeName}`;
  const canonicalPath = buildPostPath(postId, postOg.postSlug, postOg.tribeSlug);

  return {
    title,
    description: postOg.content,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title,
      description: postOg.content,
      url: canonicalPath,
      images: postOg.imageUrl ? [{ url: postOg.imageUrl }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: postOg.content,
      images: postOg.imageUrl ? [postOg.imageUrl] : undefined,
    },
  };
}

/**
 * Tribe-scoped Post Detail Page.
 *
 * Renders a single post at /t/{tribeSlug}/post/{postId}/{postSlug}.
 * Enforces 301 normalization for both tribe and post slugs.
 */
export default async function TribePostDetailPage({ params }: PageProps) {
  const { slug: tribeSlugParam, postId, postSlug } = await params;

  if (!postId) {
    notFound();
  }

  const data = await getPostById(postId);

  if (!data) {
    console.warn(`[TribePostPage] Post not found or access denied: ${postId}`);
    notFound();
  }

  // ── SEO Normalization ──
  const currentPostSlug = postSlug && postSlug.length > 0 ? postSlug[0] : null;
  const canonicalPath = buildPostPath(postId, data.post.slug, data.tribeSlug);

  // If tribe slug mismatch OR post slug mismatch OR post has no tribe (but we are in /t/ route)
  if (tribeSlugParam !== data.tribeSlug || currentPostSlug !== (data.post.slug || null)) {
    permanentRedirect(canonicalPath);
  }

  return (
    <PostDetailClient
      post={data.post}
      tribeName={data.tribeName}
      tribeSlug={data.tribeSlug}
      tribeId={data.tribeId}
      isPublic={data.isPublic}
      authorRole={data.authorRole}
      viewerIsMember={data.viewerIsMember}
    />
  );
}
