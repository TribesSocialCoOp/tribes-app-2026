/**
 * @fileoverview Service layer for event actions.
 * Now backed by Drizzle ORM + SQLite.
 */
import * as z from "zod";
import { db } from '@/db';
import { events, eventRsvps, eventStreamPosts, tribes } from '@/db/schema';
import { eq, and, count, sql, desc, inArray } from 'drizzle-orm';
import type { Event } from '@/lib/types';
import { eventCoverSvg } from '@/lib/placeholder-svg';

function rowToEvent(row: typeof events.$inferSelect): Event {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    keywords: row.keywords ?? '',
    eventDate: row.eventDate ?? new Date(),
    associatedTribe: row.associatedTribeName ?? '',
    locationName: row.locationName ?? '',
    locationCityRegion: row.locationCityRegion ?? '',
    isPublic: row.isPublic ?? true,
    creatorId: row.creatorId,
    coverImage: row.coverImage ?? undefined,
    dataAiHintCover: row.dataAiHintCover ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    rsvpPointsReward: row.rsvpPointsReward ?? 0,
    slug: row.slug ?? undefined,
  };
}

const eventCreateFormSchema = z.object({
  name: z.string(),
  keywords: z.string(),
  description: z.string(),
  eventDate: z.date(),
  associatedTribe: z.string(),
  locationName: z.string(),
  locationCityRegion: z.string(),
  coverImage: z.any().optional(),
  isPublic: z.boolean(),
  rsvpPointsReward: z.number().min(0).max(50).default(0),
});
type EventCreatePayload = z.infer<typeof eventCreateFormSchema> & { 
  coverPreview?: string | null;
  creatorId?: string;
};

/**
 * Returns the max RSVP points a user can award based on their reputation.
 * Base: 10 | 50+ rep: 25 | 100+ rep: 50
 */
export async function getMaxRsvpPoints(userId: string): Promise<{ max: number; reputation: number }> {
  try {
    const { getContributionSummary } = await import('./contribution-service');
    const summary = await getContributionSummary(userId);
    const rep = summary.allTimePoints;
    if (rep >= 100) return { max: 50, reputation: rep };
    if (rep >= 50) return { max: 25, reputation: rep };
    return { max: 10, reputation: rep };
  } catch {
    return { max: 10, reputation: 0 };
  }
}

/**
 * Creates a new event.
 * RSVP point rewards are capped by the creator's reputation score.
 */
export async function createEvent(payload: EventCreatePayload): Promise<Event> {
  const id = `event-${Date.now()}`;

  // Find associated tribe by name
  const tribeRows = await db.select().from(tribes)
    .where(eq(tribes.name, payload.associatedTribe)).limit(1);
  const tribe = tribeRows[0] ?? null;

  // Reputation-aware RSVP point cap
  const creatorId = payload.creatorId;
  let rsvpCap = 10;
  if (creatorId) {
    const { max } = await getMaxRsvpPoints(creatorId);
    rsvpCap = max;
  }
  const rsvpPoints = Math.min(payload.rsvpPointsReward ?? 0, rsvpCap);

  // Generate unique slug
  const { slugify, generateUniqueSlug } = await import('@/lib/utils/slugify');
  const baseSlug = slugify(payload.name) || 'event';
  const uniqueSlug = await generateUniqueSlug(baseSlug, async (candidate) => {
    const existing = await db.select({ id: events.id }).from(events).where(eq(events.slug, candidate)).limit(1);
    return existing.length > 0;
  });

  await db.insert(events).values({
    id,
    name: payload.name,
    description: payload.description,
    keywords: payload.keywords,
    eventDate: payload.eventDate,
    ...(tribe?.id ? { associatedTribeId: tribe.id } : {}),
    associatedTribeName: payload.associatedTribe,
    locationName: payload.locationName,
    locationCityRegion: payload.locationCityRegion,
    isPublic: payload.isPublic,
    creatorId: creatorId ?? '',
    coverImage: payload.coverPreview || eventCoverSvg(payload.name),
    dataAiHintCover: 'event banner',
    rsvpPointsReward: rsvpPoints,
    slug: uniqueSlug,
  });

  const eventRows = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return rowToEvent(eventRows[0]!);
}

/**
 * Fetches all events.
 */
export async function getEvents(): Promise<Event[]> {
  const rows = await db.select().from(events);
  return rows.map(rowToEvent);
}

/**
 * Fetches a single event by its ID.
 */
export async function getEventById(eventId: string): Promise<Event | null> {
  const rows = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  const row = rows[0];
  return row ? rowToEvent(row) : null;
}

/**
 * Fetches all events associated with a specific tribe name.
 */
export async function getEventsForTribe(tribeName: string): Promise<Event[]> {
  const rows = await db.select().from(events)
    .where(eq(events.associatedTribeName, tribeName));
  return rows.map(rowToEvent);
}

/**
 * RSVP to an event. Upserts the RSVP status.
 */
export async function rsvpToEvent(eventId: string, userId: string, status: 'going' | 'interested' | 'not_going'): Promise<{ status: string; rsvpCount: number; pointsAwarded: number }> {
  // Check if RSVP already exists
  const existing = await db.select().from(eventRsvps)
    .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, userId)))
    .limit(1);

  const wasGoingBefore = existing[0]?.status === 'going';

  if (existing.length > 0) {
    await db.update(eventRsvps)
      .set({ status })
      .where(eq(eventRsvps.id, existing[0]!.id));
  } else {
    await db.insert(eventRsvps).values({
      id: crypto.randomUUID(),
      eventId,
      userId,
      status,
    });
  }

  const rsvpCount = await getEventRsvpCount(eventId);

  // Award points only on first 'going' RSVP (not re-RSVPs)
  let pointsAwarded = 0;
  if (status === 'going' && !wasGoingBefore) {
    const eventRow = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    pointsAwarded = eventRow[0]?.rsvpPointsReward ?? 0;
  }

  return { status, rsvpCount, pointsAwarded };
}

/**
 * Get count of 'going' RSVPs for an event.
 */
export async function getEventRsvpCount(eventId: string): Promise<number> {
  const result = await db.select({ value: count() }).from(eventRsvps)
    .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.status, 'going')));
  return result[0]?.value ?? 0;
}

/**
 * Get a user's RSVP status for an event.
 */
export async function getUserRsvpStatus(eventId: string, userId: string): Promise<'going' | 'interested' | 'not_going' | null> {
  const rows = await db.select().from(eventRsvps)
    .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, userId)))
    .limit(1);
  return (rows[0]?.status as 'going' | 'interested' | 'not_going') ?? null;
}

/**
 * Get a preview list of attendees (going) for an event.
 */
export async function getEventAttendeesPreview(eventId: string, limit: number = 10): Promise<{ users: { id: string; name: string; avatar?: string }[]; totalCount: number }> {
  const { users } = await import('@/db/schema');

  // Single count query
  const totalResult = await db.select({ value: count() }).from(eventRsvps)
    .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.status, 'going')));
  const totalCount = totalResult[0]?.value ?? 0;

  // Fetch limited RSVPs
  const rsvpRows = await db.select({ userId: eventRsvps.userId }).from(eventRsvps)
    .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.status, 'going')))
    .limit(limit);

  if (rsvpRows.length === 0) return { users: [], totalCount };

  // Batch-resolve user info with inArray instead of N+1 loop
  const userIds = rsvpRows.map(r => r.userId);
  const userRows = await db.select({ id: users.id, name: users.name, avatar: users.avatar })
    .from(users)
    .where(inArray(users.id, userIds));

  const attendees = userRows.map(u => ({
    id: u.id,
    name: u.name ?? 'Unknown',
    avatar: u.avatar ?? undefined,
  }));

  return { users: attendees, totalCount };
}

// ============================================================
// EVENT STREAM POSTS
// ============================================================

export interface EventStreamPost {
  id: string;
  eventId: string;
  authorNickname: string;
  authorAvatarFallback: string;
  content: string;
  imageUrl?: string;
  imageAlt?: string;
  timestamp: Date;
}

/**
 * Fetch all stream posts for an event, newest first.
 */
export async function getEventStreamPosts(eventId: string): Promise<EventStreamPost[]> {
  const rows = await db.select().from(eventStreamPosts)
    .where(eq(eventStreamPosts.eventId, eventId))
    .orderBy(desc(eventStreamPosts.createdAt));

  return rows.map(row => ({
    id: row.id,
    eventId: row.eventId,
    authorNickname: row.authorNickname,
    authorAvatarFallback: row.authorAvatarFallback,
    content: row.content,
    imageUrl: row.imageUrl ?? undefined,
    imageAlt: row.imageAlt ?? undefined,
    timestamp: row.createdAt ?? new Date(),
  }));
}

/**
 * Create a new event stream post.
 */
export async function createEventStreamPost(
  eventId: string,
  authorId: string,
  authorNickname: string,
  content: string,
): Promise<EventStreamPost> {
  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(eventStreamPosts).values({
    id,
    eventId,
    authorId,
    authorNickname,
    authorAvatarFallback: authorNickname.substring(0, 2).toUpperCase() || 'ME',
    content,
    createdAt: now,
  });

  return {
    id,
    eventId,
    authorNickname,
    authorAvatarFallback: authorNickname.substring(0, 2).toUpperCase() || 'ME',
    content,
    timestamp: now,
  };
}
