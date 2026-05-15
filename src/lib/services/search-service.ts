/**
 * @fileoverview Service layer for cross-entity search.
 * Searches Tribes, Events, and Users (public profiles) using LIKE queries.
 */
import { db } from '@/db';
import { tribes, events, users, blockedUsers } from '@/db/schema';
import { like, or, sql, and, notInArray } from 'drizzle-orm';

export interface SearchResults {
  tribes: { id: string; slug: string; name: string; description: string; memberCount: number; isPublic: boolean }[];
  events: { id: string; name: string; description: string; eventDate: Date | null; locationName: string; coverImage?: string }[];
  users: { id: string; name: string; avatarUrl?: string }[];
}

/**
 * Search across tribes, events, and users.
 *
 * @param currentUserId - If provided, filters out users in a bidirectional block relationship:
 *   - Users that I have blocked (I can't see them)
 *   - Users that have blocked me (they can't be found by me)
 */
export async function searchAll(query: string, limit: number = 5, currentUserId?: string): Promise<SearchResults> {
  // SECURITY: Escape LIKE special characters to prevent wildcard abuse.
  // Without this, a query of '%' matches everything and '_' acts as a wildcard.
  // Drizzle parameterizes the value (preventing SQL injection), but LIKE semantics
  // can still be exploited for data enumeration.
  const escaped = query.replace(/[%_\\]/g, '\\$&');
  const pattern = `%${escaped}%`;

  // Build the blocked user ID list (bidirectional)
  let blockedIdsSql: ReturnType<typeof sql> | undefined;
  if (currentUserId) {
    // IDs of users I blocked + IDs of users who blocked me
    blockedIdsSql = sql`(
      SELECT ${blockedUsers.blockedUserId} FROM ${blockedUsers} WHERE ${blockedUsers.userId} = ${currentUserId}
      UNION
      SELECT ${blockedUsers.userId} FROM ${blockedUsers} WHERE ${blockedUsers.blockedUserId} = ${currentUserId}
    )`;
  }

  const [tribeResults, eventResults, userResults] = await Promise.all([
    db.select({
      id: tribes.id,
      slug: tribes.slug,
      name: tribes.name,
      description: tribes.description,
      memberCount: tribes.memberCount,
      isPublic: tribes.isPublic,
    })
      .from(tribes)
      .where(or(
        like(tribes.name, pattern),
        like(tribes.description, pattern),
      ))
      .limit(limit),

    db.select({
      id: events.id,
      name: events.name,
      description: events.description,
      eventDate: events.eventDate,
      locationName: events.locationName,
      coverImage: events.coverImage,
    })
      .from(events)
      .where(or(
        like(events.name, pattern),
        like(events.description, pattern),
        like(events.keywords, pattern),
      ))
      .limit(limit),

    db.select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatar,
    })
      .from(users)
      .where(
        blockedIdsSql
          ? and(like(users.name, pattern), sql`${users.id} NOT IN ${blockedIdsSql}`)
          : like(users.name, pattern)
      )
      .limit(limit),
  ]);

  return {
    tribes: tribeResults.map(t => ({
      id: t.id,
      slug: t.slug || t.id,
      name: t.name,
      description: t.description ?? '',
      memberCount: t.memberCount ?? 0,
      isPublic: t.isPublic ?? true,
    })),
    events: eventResults.map(e => ({
      id: e.id,
      name: e.name,
      description: e.description ?? '',
      eventDate: e.eventDate,
      locationName: e.locationName ?? '',
      coverImage: e.coverImage ?? undefined,
    })),
    users: userResults.map(u => ({
      id: u.id,
      name: u.name ?? 'Unknown',
      avatarUrl: u.avatarUrl ?? undefined,
    })),
  };
}

