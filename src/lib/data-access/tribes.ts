/**
 * @fileoverview Data access layer for Tribes.
 * Now backed by Drizzle ORM + SQLite.
 *
 * SECURITY: Private tribes are only visible to their members and platform admins.
 * Every public function accepts an optional `viewerUserId` for access control.
 */

import { db } from '@/db';
import { tribes, tribeMoodTags, tribeMembers, users } from '@/db/schema';
import { eq, like, inArray, or, and } from 'drizzle-orm';
import type { Tribe } from '@/lib/types';

function rowToTribe(
  row: typeof tribes.$inferSelect,
  moods: string[],
  opts?: { includeInviteToken?: boolean },
): Tribe {
  return {
    id: row.id,
    slug: row.slug || row.id,
    name: row.name,
    description: row.description,
    members: row.memberCount ?? 0,
    isPublic: row.isPublic ?? true,
    isNsfw: row.isNsfw ?? false,
    isListed: row.isListed ?? false,
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
    // SECURITY: inviteToken is a member-held join capability, not metadata. Listed
    // private tribes are returned to any viewer, so it's stripped unless the caller
    // established the viewer is a member/founder (or explicitly holds the token).
    inviteToken: opts?.includeInviteToken ? row.inviteToken ?? undefined : undefined,
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
  // Discoverable = public OR explicitly listed (e.g. NSFW tribes that opt to be listed).
  // Listed private tribes expose only metadata here; their post content stays members-only.
  // NSFW (issue #32): hidden from discovery unless this request+viewer may see it
  // (not geo-blocked, opted-in/verified). Members still reach their own NSFW tribes
  // via membership below; the content gate protects the actual posts regardless.
  const { canDiscoverNsfw } = await import('@/lib/age-verification/nsfw-gate');
  // Listed NSFW tribes expose only metadata in discovery (posts gated at join/view),
  // so show them to any signed-in viewer who could still gain access (needs_optin /
  // needs_verify / allow) — joining then triggers the opt-in/verify remediation. Only
  // geo-blocked regions hide them. Guests (no userId) stay conservative: NSFW hidden
  // until they sign in and can be led through opt-in/verification.
  const showNsfw = viewerUserId ? await canDiscoverNsfw(viewerUserId) : false;
  const discoverable = and(
    or(eq(tribes.isPublic, true), eq(tribes.isListed, true)),
    showNsfw ? undefined : eq(tribes.isNsfw, false),
  );

  if (!viewerUserId) {
    // Guest — public + listed tribes (metadata only)
    const publicRows = await db.select({ id: tribes.id }).from(tribes).where(discoverable);
    return new Set(publicRows.map(r => r.id));
  }

  // Check platform admin status
  const [userRow] = await db.select({ role: users.role }).from(users).where(eq(users.id, viewerUserId)).limit(1);
  if (userRow?.role === 'Admin') return 'all'; // Admins see everything

  // Collect discoverable tribe IDs + private tribes the viewer is a member of
  const [publicRows, memberRows] = await Promise.all([
    db.select({ id: tribes.id }).from(tribes).where(discoverable),
    db.select({ tribeId: tribeMembers.tribeId }).from(tribeMembers).where(eq(tribeMembers.userId, viewerUserId)),
  ]);

  const visible = new Set<string>();
  for (const r of publicRows) visible.add(r.id);
  for (const r of memberRows) visible.add(r.tribeId);
  return visible;
}

/**
 * Whether the viewer holds member-level access to this tribe (member row, founder/
 * creator, or platform admin). Gates capability fields like inviteToken and NSFW
 * metadata visibility on direct lookups.
 */
async function viewerHasMemberAccess(
  row: { id: string; createdBy: string | null },
  viewerUserId?: string | null,
): Promise<boolean> {
  if (!viewerUserId) return false;
  if (row.createdBy === viewerUserId) return true;
  const [m] = await db.select({ id: tribeMembers.id }).from(tribeMembers)
    .where(and(eq(tribeMembers.tribeId, row.id), eq(tribeMembers.userId, viewerUserId)))
    .limit(1);
  if (m) return true;
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, viewerUserId)).limit(1);
  return u?.role === 'Admin';
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

  // inviteToken is a member capability — resolve the viewer's memberships once
  // ('all' from getViewerTribeIds means platform admin).
  const isAdmin = visibleIds === 'all';
  const memberIds = viewerUserId
    ? new Set(
        (await db.select({ tribeId: tribeMembers.tribeId }).from(tribeMembers)
          .where(eq(tribeMembers.userId, viewerUserId))).map(r => r.tribeId),
      )
    : new Set<string>();

  return rows.map(row => rowToTribe(row, moodMap.get(row.id) ?? [], {
    includeInviteToken: isAdmin || memberIds.has(row.id) || (!!viewerUserId && row.createdBy === viewerUserId),
  }));
}

/**
 * Shared access-control tail for direct single-tribe lookups (by id / name / slug):
 * - Unlisted private tribes are invisible to non-members (member/founder/admin only).
 * - Listed private tribes (e.g. NSFW) expose metadata for discovery; post content is
 *   gated separately — but NSFW metadata follows the same rule as discovery/search
 *   ({@link canDiscoverNsfw}): hidden from guests and geo-blocked viewers, so a direct
 *   URL doesn't reveal what the discovery filter hides.
 * - inviteToken (a member-held join capability) is only included for member-level viewers.
 */
async function resolveTribeLookup(
  row: typeof tribes.$inferSelect,
  viewerUserId?: string | null,
): Promise<Tribe | null> {
  const hasMemberAccess = await viewerHasMemberAccess(row, viewerUserId);

  if (!hasMemberAccess) {
    if (!row.isPublic && !row.isListed) return null;

    if (row.isNsfw) {
      const { canDiscoverNsfw } = await import('@/lib/age-verification/nsfw-gate');
      const showNsfw = viewerUserId ? await canDiscoverNsfw(viewerUserId) : false;
      if (!showNsfw) return null;
    }
  }

  const moods = await getMoodsForTribe(row.id);
  return rowToTribe(row, moods, { includeInviteToken: hasMemberAccess });
}

/**
 * Fetches a single tribe by its ID.
 * Returns null if the tribe is private and the viewer is not a member.
 */
export async function getTribeById(tribeId: string, viewerUserId?: string | null): Promise<Tribe | null> {
  const rows = await db.select().from(tribes).where(eq(tribes.id, tribeId)).limit(1);
  const row = rows[0];
  if (!row) return null;

  return resolveTribeLookup(row, viewerUserId);
}

/**
 * Finds a single tribe by its name (case-insensitive).
 * Returns null if the tribe is private and the viewer is not a member.
 */
export async function findTribeByName(name: string, viewerUserId?: string | null): Promise<Tribe | null> {
  const rows = await db.select().from(tribes).where(like(tribes.name, name)).limit(1);
  const row = rows[0];
  if (!row) return null;

  return resolveTribeLookup(row, viewerUserId);
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

  return resolveTribeLookup(row, viewerUserId);
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
  // The caller proved possession of the token — returning it back is not a leak.
  return rowToTribe(row, moods, { includeInviteToken: true });
}
