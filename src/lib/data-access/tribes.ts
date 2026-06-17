/**
 * @fileoverview Data access layer for Tribes.
 * Now backed by Drizzle ORM + SQLite.
 *
 * SECURITY: Private tribes are only visible to their members and platform admins.
 * Every public function accepts an optional `viewerUserId` for access control.
 */

import { db } from '@/db';
import { tribes, tribeMoodTags, tribeMembers, users } from '@/db/schema';
import { eq, like, inArray } from 'drizzle-orm';
import type { Tribe } from '@/lib/types';

function rowToTribe(row: typeof tribes.$inferSelect, moods: string[]): Tribe {
  return {
    id: row.id,
    slug: row.slug || row.id,
    name: row.name,
    description: row.description,
    members: row.memberCount ?? 0,
    isPublic: row.isPublic ?? true,
    isNsfw: row.isNsfw ?? false,
    cover: row.cover ?? '',
    coverPosition: row.coverPosition ?? undefined,
    dataAiHint: row.dataAiHint ?? '',
    moods,
    homepageUrl: row.homepageUrl ?? undefined,
    joinMechanism: (row.joinMechanism ?? undefined) as Tribe['joinMechanism'],
    minimumReputation: (row.minimumReputation ?? undefined) as Tribe['minimumReputation'],
    minimumAccountAgeDays: row.minimumAccountAgeDays ?? undefined,
    brandColor: row.brandColor ?? undefined,
    brandLogo: row.brandLogo ?? undefined,
    createdBy: row.createdBy ?? undefined,
    inviteToken: row.inviteToken ?? undefined,
    bondDurationDays: row.bondDurationDays ?? undefined,
  };
}

async function getMoodsForTribe(tribeId: string): Promise<string[]> {
  const rows = await db.select().from(tribeMoodTags).where(eq(tribeMoodTags.tribeId, tribeId));
  return rows.map(r => r.moodSlug);
}

/**
 * Resolves the set of tribe IDs a viewer has access to.
 * - Platform admins see everything.
 * - All other users see public tribes + their own private memberships.
 * - Guests (no userId) see public tribes only.
 */
async function getViewerTribeIds(viewerUserId?: string | null): Promise<'all' | Set<string>> {
  if (!viewerUserId) {
    // Guest — only public tribes
    const publicRows = await db.select({ id: tribes.id }).from(tribes).where(eq(tribes.isPublic, true));
    return new Set(publicRows.map(r => r.id));
  }

  // Check platform admin status
  const [userRow] = await db.select({ role: users.role }).from(users).where(eq(users.id, viewerUserId)).limit(1);
  if (userRow?.role === 'Admin') return 'all'; // Admins see everything

  // Collect public tribe IDs + private tribes the viewer is a member of
  const [publicRows, memberRows] = await Promise.all([
    db.select({ id: tribes.id }).from(tribes).where(eq(tribes.isPublic, true)),
    db.select({ tribeId: tribeMembers.tribeId }).from(tribeMembers).where(eq(tribeMembers.userId, viewerUserId)),
  ]);

  const visible = new Set<string>();
  for (const r of publicRows) visible.add(r.id);
  for (const r of memberRows) visible.add(r.tribeId);
  return visible;
}

/**
 * Fetches all tribes visible to the viewer.
 * Private tribes are omitted unless the viewer is a member or platform admin.
 */
export async function getTribes(viewerUserId?: string | null): Promise<Tribe[]> {
  const visibleIds = await getViewerTribeIds(viewerUserId);

  const rows = visibleIds === 'all'
    ? await db.select().from(tribes)
    : visibleIds.size > 0
      ? await db.select().from(tribes).where(inArray(tribes.id, [...visibleIds]))
      : [];

  if (rows.length === 0) return [];

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
 * Returns null if the tribe is private and the viewer is not a member.
 */
export async function getTribeById(tribeId: string, viewerUserId?: string | null): Promise<Tribe | null> {
  const rows = await db.select().from(tribes).where(eq(tribes.id, tribeId)).limit(1);
  const row = rows[0];
  if (!row) return null;

  // Access control: private tribes are invisible to non-members
  if (!row.isPublic) {
    const visibleIds = await getViewerTribeIds(viewerUserId);
    const canSee = visibleIds === 'all' || visibleIds.has(tribeId);
    if (!canSee) return null;
  }

  const moods = await getMoodsForTribe(row.id);
  return rowToTribe(row, moods);
}

/**
 * Finds a single tribe by its name (case-insensitive).
 * Returns null if the tribe is private and the viewer is not a member.
 */
export async function findTribeByName(name: string, viewerUserId?: string | null): Promise<Tribe | null> {
  const rows = await db.select().from(tribes).where(like(tribes.name, name)).limit(1);
  const row = rows[0];
  if (!row) return null;

  // Access control: private tribes are invisible to non-members
  if (!row.isPublic) {
    const visibleIds = await getViewerTribeIds(viewerUserId);
    const canSee = visibleIds === 'all' || visibleIds.has(row.id);
    if (!canSee) return null;
  }

  const moods = await getMoodsForTribe(row.id);
  return rowToTribe(row, moods);
}

/**
 * Fetches a single tribe by its URL slug.
 * Returns null if the tribe is private and the viewer is not a member.
 */
export async function getTribeBySlug(slug: string, viewerUserId?: string | null): Promise<Tribe | null> {
  const rows = await db.select().from(tribes).where(eq(tribes.slug, slug)).limit(1);
  const row = rows[0];
  if (!row) {
    // Check for a redirect from an old slug (e.g. after a solo-founder rename)
    const { resolveSlugRedirect } = await import('@/lib/slugify');
    const currentSlug = await resolveSlugRedirect(slug);
    if (!currentSlug) return null;
    // Recursive call with the resolved current slug
    return getTribeBySlug(currentSlug, viewerUserId);
  }

  // Access control: private tribes are invisible to non-members
  if (!row.isPublic) {
    const visibleIds = await getViewerTribeIds(viewerUserId);
    const canSee = visibleIds === 'all' || visibleIds.has(row.id);
    if (!canSee) return null;
  }

  const moods = await getMoodsForTribe(row.id);
  return rowToTribe(row, moods);
}

/**
 * Fetches a single tribe by its invite token.
 * No access control — if you have the token, you can see the tribe to join it.
 */
export async function getTribeByInviteToken(token: string): Promise<Tribe | null> {
  if (!token || token.length < 8) return null;
  const rows = await db.select().from(tribes).where(eq(tribes.inviteToken, token)).limit(1);
  const row = rows[0];
  if (!row) return null;

  const moods = await getMoodsForTribe(row.id);
  return rowToTribe(row, moods);
}
