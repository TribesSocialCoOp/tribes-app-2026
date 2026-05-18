import { db } from '@/db';
import { users, userSlugRedirects } from '@/db/schema';
import { eq, and, or, isNull, gte } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import PublicProfilePage from '../../profile/[userId]/page';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProfileSlugPage({ params }: PageProps) {
  const { slug } = await params;

  // 1. Look up user by slug
  const [userRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.slug, slug))
    .limit(1);

  if (userRow) {
    return <PublicProfilePage userId={userRow.id} />;
  }

  // 2. Check slug redirects (only non-expired)
  const [redirectRow] = await db
    .select({ slug: users.slug })
    .from(userSlugRedirects)
    .innerJoin(users, eq(users.id, userSlugRedirects.userId))
    .where(and(
      eq(userSlugRedirects.oldSlug, slug),
      or(isNull(userSlugRedirects.expiresAt), gte(userSlugRedirects.expiresAt, new Date()))
    ))
    .limit(1);

  if (redirectRow && redirectRow.slug) {
    // Permanent 308 redirect to new slug
    redirect(`/u/${redirectRow.slug}`);
  }

  // 3. Fallback: not found
  notFound();
}
