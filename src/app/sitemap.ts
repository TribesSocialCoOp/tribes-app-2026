import type { MetadataRoute } from 'next';

// Must be rendered at request time — the DB isn't available during `next build` in Docker.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tribes.app';
  
  // Fetch all public tribes for dynamic entries
  const { getTribes } = await import('@/lib/data-access/tribes');
  const tribes = await getTribes(null);

  const tribeUrls: MetadataRoute.Sitemap = tribes.map(tribe => ({
    url: `${baseUrl}/t/${tribe.slug}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, priority: 1.0 },
    { url: `${baseUrl}/discover`, priority: 0.9 },
    { url: `${baseUrl}/moods`, priority: 0.7 },
    { url: `${baseUrl}/our-story`, priority: 0.6 },
    { url: `${baseUrl}/signup`, priority: 0.5 },
    { url: `${baseUrl}/login`, priority: 0.3 },
    { url: `${baseUrl}/privacy`, priority: 0.2 },
    { url: `${baseUrl}/terms`, priority: 0.2 },
  ].map(r => ({ ...r, lastModified: new Date(), changeFrequency: 'weekly' as const }));

  return [...staticRoutes, ...tribeUrls];
}
