import { notFound, permanentRedirect } from 'next/navigation';
import { getPostById } from '@/lib/actions/content-actions';
import { buildPostPath } from '@/lib/utils/slugify';
import { PostDetailClient } from './post-detail-client';

interface PageProps {
  params: Promise<{ postId: string; slug?: string[] }>;
}

/**
 * Legacy Standalone Post Detail Page.
 * Issues a 308 Permanent Redirect to the canonical slug route when the post
 * has a slug.  Falls back to direct rendering when no slug exists yet
 * (avoids infinite redirect loop where buildPostPath returns /post/{postId}).
 */
export default async function LegacyPostDetailPage({ params }: PageProps) {
  const { postId } = await params;

  if (!postId) {
    notFound();
  }

  const data = await getPostById(postId);

  if (!data) {
    console.warn(`[LegacyPostPage] Post not found or access denied: ${postId}`);
    notFound();
  }

  const canonicalPath = buildPostPath(postId, data.post.slug, data.tribeSlug);

  // Only redirect when the canonical path is actually different from the
  // current legacy route.  When the post has no slug, buildPostPath falls
  // back to `/post/${postId}` — redirecting there would loop forever.
  const currentPath = `/post/${postId}`;
  if (canonicalPath !== currentPath) {
    permanentRedirect(canonicalPath);
  }

  // No slug available yet — render the page directly at the legacy URL.
  return (
    <PostDetailClient
      post={data.post}
      tribeName={data.tribeName}
      tribeSlug={data.tribeSlug}
      tribeId={data.tribeId}
      isPublic={data.isPublic}
      authorRole={data.authorRole}
      viewerRole={data.viewerRole}
      viewerIsMember={data.viewerIsMember}
    />
  );
}
