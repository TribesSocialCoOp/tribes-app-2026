import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tribes.app';
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/t/', '/post/', '/discover', '/moods/', '/our-story', '/login', '/signup', '/privacy', '/terms', '/community-guidelines', '/cookies'],
        disallow: ['/your-comms', '/settings', '/bonds', '/my-wall', '/api/', '/admin/', '/billing/', '/profile/', '/account-recovery/', '/bond/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
