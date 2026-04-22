/**
 * @fileoverview Data access layer for Tribes.
 * Now backed by Drizzle ORM + SQLite.
 */

import { db } from '@/db';
import { tribes, tribeMoodTags } from '@/db/schema';
import { eq, like } from 'drizzle-orm';
import type { Tribe } from '@/lib/types';

function rowToTribe(row: typeof tribes.$inferSelect, moods: string[]): Tribe {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    members: row.memberCount ?? 0,
    isPublic: row.isPublic ?? true,
    cover: row.cover ?? '',
    dataAiHint: row.dataAiHint ?? '',
    moods,
    homepageUrl: row.homepageUrl ?? undefined,
    joinMechanism: (row.joinMechanism ?? undefined) as Tribe['joinMechanism'],
    minimumReputation: (row.minimumReputation ?? undefined) as Tribe['minimumReputation'],
    minimumAccountAgeDays: row.minimumAccountAgeDays ?? undefined,
  };
}

async function getMoodsForTribe(tribeId: string): Promise<string[]> {
  const rows = await db.select().from(tribeMoodTags).where(eq(tribeMoodTags.tribeId, tribeId));
  return rows.map(r => r.moodSlug);
}

/**
 * Fetches all tribes.
 */
export async function getTribes(): Promise<Tribe[]> {
  const rows = await db.select().from(tribes);
  const allMoods = await db.select().from(tribeMoodTags);

  // Group moods by tribeId in a single pass
  const moodMap = new Map<string, string[]>();
  for (const m of allMoods) {
    const arr = moodMap.get(m.tribeId) ?? [];
    arr.push(m.moodSlug);
    moodMap.set(m.tribeId, arr);
  }

  return rows.map(row => rowToTribe(row, moodMap.get(row.id) ?? []));
}

/**
 * Fetches a single tribe by its ID.
 */
export async function getTribeById(tribeId: string): Promise<Tribe | null> {
  const rows = await db.select().from(tribes).where(eq(tribes.id, tribeId)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const moods = await getMoodsForTribe(row.id);
  return rowToTribe(row, moods);
}

/**
 * Finds a single tribe by its name (case-insensitive).
 */
export async function findTribeByName(name: string): Promise<Tribe | null> {
  const rows = await db.select().from(tribes).where(like(tribes.name, name)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const moods = await getMoodsForTribe(row.id);
  return rowToTribe(row, moods);
}
