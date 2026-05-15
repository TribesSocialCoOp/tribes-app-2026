import { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { getPostForOg, getPostById } from '@/lib/actions/content-actions';
import { PostDetailClient } from './post-detail-client';
import { buildPostPath } from '@/lib/utils/slugify';

interface PageProps {
  params: Promise<{ postId: string; slug?: string[] }>;
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
 * Standalone Post Detail Page.
 *
 * Renders a single post at /post/{postId}.
 * Supports 301 normalization to the canonical slug /t/{tribeSlug}/post/{postId}/{postSlug}.
 */
export default async function PostDetailPage({ params }: PageProps) {
  const { postId, slug } = await params;

  if (!postId) {
    notFound();
  }

  const data = await getPostById(postId);

  if (!data) {
    console.warn(`[PostPage] Post not found or access denied: ${postId}`);
    notFound();
  }

  // ── SEO Normalization ──
  // Check if we are on the canonical URL. 
  // We allow either /post/{id}/{slug} or /t/{tribeSlug}/post/{id}/{slug}.
  // But we always want to redirect to the tribe-scoped version if it exists.
  
  const currentSlug = slug && slug.length > 0 ? slug[0] : null;
  const canonicalPath = buildPostPath(postId, data.post.slug, data.tribeSlug);
  
  // Simple path check (ignoring host)
  // If we're on /post/... but the post has a tribe slug, redirect to /t/...
  // If the post slug is wrong, redirect.
  if (data.tribeSlug || currentSlug !== (data.post.slug || null)) {
    // Only redirect if the current path is NOT the canonical path.
    // This handles the transition from /post/{id} -> /t/{tribe}/post/{id}/{slug}
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
