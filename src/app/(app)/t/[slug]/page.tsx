import React from 'react';
import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { getTribeBySlug } from '@/lib/actions/tribe-actions';
import { getPostForOg } from '@/lib/actions/content-actions';
import TribeSlugClient from './tribe-slug-client';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ postId?: string }>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { postId } = await searchParams;
  
  const tribe = await getTribeBySlug(slug);
  if (!tribe) return { title: 'Tribe Not Found' };

  // If a postId is present, try to get post-specific metadata
  if (postId) {
    const postOg = await getPostForOg(postId);
    if (postOg) {
      return {
        title: postOg.title || `Post in ${tribe.name}`,
        description: postOg.content,
        openGraph: {
          title: postOg.title || `Post in ${tribe.name}`,
          description: postOg.content,
          images: postOg.imageUrl ? [{ url: postOg.imageUrl }] : undefined,
          type: 'article',
        },
        twitter: {
          card: 'summary_large_image',
          title: postOg.title || `Post in ${tribe.name}`,
          description: postOg.content,
          images: postOg.imageUrl ? [postOg.imageUrl] : undefined,
        },
      };
    }
  }

  // Fallback to Tribe metadata
  return {
    title: tribe.name,
    description: tribe.description,
    openGraph: {
      title: tribe.name,
      description: tribe.description,
      images: tribe.cover ? [{ url: tribe.cover }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: tribe.name,
      description: tribe.description,
      images: tribe.cover ? [tribe.cover] : undefined,
    },
  };
}

export default async function TribeSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const tribe = await getTribeBySlug(slug);

  // 301 redirect if the URL slug is stale (old slug via redirect table)
  if (tribe && tribe.slug !== slug) {
    permanentRedirect(`/t/${tribe.slug}`);
  }

  return <TribeSlugClient />;
}
