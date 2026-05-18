import { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { getPostBySlug } from '@/lib/actions/content-actions';
import { PostDetailClient } from '../../../post/[postId]/[[...slug]]/post-detail-client';
import { buildPostPath } from '@/lib/utils/slugify';

interface PageProps {
  params: Promise<{ slug: string; postSlug: string }>;
}

/**
 * Generates OG metadata for the post for link unfurling.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: tribeSlug, postSlug } = await params;

  if (!postSlug) return { title: 'Post Not Found' };

  const data = await getPostBySlug(postSlug, tribeSlug);
  if (!data) return { title: 'Post Not Found' };

  const title = data.post.title || `Post in ${data.tribeName}`;
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
 * Slug-scoped Tribe Post Detail Page.
 * Renders a single post at /t/{tribeSlug}/{postSlug}.
 * Resolves redirects if the post slug was updated.
 */
export default async function TribePostSlugDetailPage({ params }: PageProps) {
  const { slug: tribeSlug, postSlug } = await params;

  if (!postSlug) {
    notFound();
  }

  const data = await getPostBySlug(postSlug, tribeSlug);

  if (!data) {
    console.warn(`[TribePostSlugPage] Post not found or access denied: ${postSlug} in ${tribeSlug}`);
    notFound();
  }

  // Handle redirect if the slug was updated
  if (data.redirectSlug) {
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
