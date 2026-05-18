import { db } from '@/db';
import { events, eventSlugRedirects } from '@/db/schema';
import { eq, and, or, isNull, gte } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import EventDetailPage from '../../events/[eventId]/page';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function EventSlugPage({ params }: PageProps) {
  const { slug } = await params;

  // 1. Look up event by slug
  const [eventRow] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.slug, slug))
    .limit(1);

  if (eventRow) {
    return <EventDetailPage eventId={eventRow.id} />;
  }

  // 2. Check slug redirects (only non-expired)
  const [redirectRow] = await db
    .select({ slug: events.slug })
    .from(eventSlugRedirects)
    .innerJoin(events, eq(events.id, eventSlugRedirects.eventId))
    .where(and(
      eq(eventSlugRedirects.oldSlug, slug),
      or(isNull(eventSlugRedirects.expiresAt), gte(eventSlugRedirects.expiresAt, new Date()))
    ))
    .limit(1);

  if (redirectRow && redirectRow.slug) {
    // Permanent 308 redirect to new slug
    redirect(`/e/${redirectRow.slug}`);
  }

  // 3. Fallback: not found
  notFound();
}
