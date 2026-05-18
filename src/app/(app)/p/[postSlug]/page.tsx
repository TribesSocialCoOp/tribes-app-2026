import { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { getPostBySlug } from '@/lib/actions/content-actions';
import { PostDetailClient } from '../../post/[postId]/[[...slug]]/post-detail-client';
import { buildPostPath } from '@/lib/utils/slugify';

interface PageProps {
  params: Promise<{ postSlug: string }>;
}

/**
 * Generates OG metadata for the standalone post.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { postSlug } = await params;

  if (!postSlug) return { title: 'Post Not Found' };

  const data = await getPostBySlug(postSlug);
  if (!data) return { title: 'Post Not Found' };

  const title = data.post.title || 'Standalone Post';
  const canonicalPath = buildPostPath(data.post.id, data.post.slug, data.tribeSlug);
  const description = data.post.isEncrypted
    ? 'This post is end-to-end encrypted.'
    : (data.post.content || '').substring(0, 160);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      images: !data.post.isEncrypted && data.post.imageUrl ? [{ url: data.post.imageUrl }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: !data.post.isEncrypted && data.post.imageUrl ? [data.post.imageUrl] : undefined,
    },
  };
}

/**
 * Standalone Post Slug Detail Page.
 * Renders a single post at /p/{postSlug}.
 * Enforces canonical redirects if it belongs to a tribe or has a redirect.
 */
export default async function StandalonePostSlugDetailPage({ params }: PageProps) {
  const { postSlug } = await params;

  if (!postSlug) {
    notFound();
  }

  const data = await getPostBySlug(postSlug);

  if (!data) {
    console.warn(`[StandalonePostSlugPage] Post not found or access denied: ${postSlug}`);
    notFound();
  }

  // ENFORCE CANONICAL: If the post belongs to a tribe, redirect to the tribe-scoped slug route
  // Or if the slug has a historical redirect, redirect to the correct canonical URL
  if (data.tribeSlug || data.redirectSlug) {
    const canonicalPath = buildPostPath(data.post.id, data.post.slug, data.tribeSlug);
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
