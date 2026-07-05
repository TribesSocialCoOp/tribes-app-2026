/**
 * @fileoverview Tribe-level authorization guard.
 *
 * Implements the three-layer authority model:
 *   1. Platform Admin (users.role === 'Admin') → full access to everything
 *   2. Tribe Founder (tribes.createdBy === userId) → full tribe governance
 *   3. Speaker (tribeMembers.role === 'speaker') → moderation + representation
 *   4. Member (tribeMembers exists) → participation only
 *
 * This is the ONLY place tribe-level authorization logic should live.
 * Server actions call these functions before executing mutations.
 */

import { db } from '@/db';
import { tribes, tribeMembers, users } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export type TribeAccessLevel = 'platform_admin' | 'founder' | 'speaker' | 'member' | 'guest';

/**
 * Resolves the highest authority level a user has for a given tribe.
 * Uses a waterfall: Platform Admin > Founder > Speaker > Member > Guest
 */
export async function getTribeAccessLevel(userId: string, tribeId: string): Promise<TribeAccessLevel> {
  // 1. Check if platform admin
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (user?.role === 'Admin') return 'platform_admin';

  // 2. Check if tribe founder (via tribes.createdBy)
  const [tribe] = await db.select({ createdBy: tribes.createdBy }).from(tribes).where(eq(tribes.id, tribeId)).limit(1);
  if (tribe?.createdBy === userId) return 'founder';

  // 3. Check tribe membership role
  const [membership] = await db.select({ role: tribeMembers.role })
    .from(tribeMembers)
    .where(and(eq(tribeMembers.userId, userId), eq(tribeMembers.tribeId, tribeId)))
    .limit(1);

  if (!membership) return 'guest';
  // 'admin' is not written by any current code path (roles are founder|speaker|member)
  // but is kept as a defensive read-mapping in case legacy rows carry it. Distinct from
  // users.role === 'Admin' (platform admin), which is handled above.
  if (membership.role === 'founder' || membership.role === 'admin') return 'founder';
  if (membership.role === 'speaker') return 'speaker';
  return 'member';
}

/**
 * Returns true if the user has at least speaker-level access to the tribe.
 * Use this for moderation actions (dismiss reports, remove posts, approve joins).
 */
export async function isTribeSpeakerOrAbove(userId: string, tribeId: string): Promise<boolean> {
  const level = await getTribeAccessLevel(userId, tribeId);
  return level === 'platform_admin' || level === 'founder' || level === 'speaker';
}

/**
 * Returns true if the user has founder-level access to the tribe.
 * Use this for governance actions (settings, banning, appointing speakers).
 */
export async function isTribeFounderOrAbove(userId: string, tribeId: string): Promise<boolean> {
  const level = await getTribeAccessLevel(userId, tribeId);
  return level === 'platform_admin' || level === 'founder';
}

/**
 * Returns true if the user is a member of the tribe (any role).
 */
export async function isTribeMember(userId: string, tribeId: string): Promise<boolean> {
  const level = await getTribeAccessLevel(userId, tribeId);
  return level !== 'guest';
}

/**
 * Throws an error if the user doesn't have at least speaker access.
 * Use in server actions before moderation mutations.
 */
export async function requireTribeSpeaker(userId: string, tribeId: string): Promise<void> {
  if (!(await isTribeSpeakerOrAbove(userId, tribeId))) {
    throw new Error('You do not have moderation permissions for this tribe.');
  }
}

/**
 * Throws an error if the user doesn't have founder access.
 * Use in server actions before governance mutations (settings, ban, appoint).
 */
export async function requireTribeFounder(userId: string, tribeId: string): Promise<void> {
  if (!(await isTribeFounderOrAbove(userId, tribeId))) {
    throw new Error('You do not have governance permissions for this tribe.');
  }
}

/**
 * The single content-boundary gate for tribe posts/comments (issue #32).
 *
 * Two independent checks, in order:
 *   1. NSFW: geo-blocked region → blocked; otherwise the viewer needs the 18+
 *      opt-in (or wallet verification). Throws age-gate sentinels via
 *      assertNsfwAccess so the client can show the right remediation.
 *   2. Membership: a private tribe may be publicly LISTED (e.g. NSFW tribes opt
 *      in to discovery), so metadata is visible to non-members — but content must
 *      stay members-only (policy §2: zero content leaks to non-members).
 *
 * Every endpoint that returns tribe post/comment content must call this; do not
 * inline these checks (an inlined copy is how the unified feed missed the gate).
 */
export async function assertTribeContentAccess(
  userId: string | null,
  tribeId: string,
  tribe: { isNsfw?: boolean; isPublic?: boolean },
): Promise<void> {
  if (tribe.isNsfw) {
    const { assertNsfwAccess } = await import('@/lib/age-verification/nsfw-gate');
    await assertNsfwAccess(userId);
  }

  if (!tribe.isPublic) {
    if (!userId) throw new Error('Tribe not found or access denied.');
    const level = await getTribeAccessLevel(userId, tribeId);
    if (level === 'guest') {
      throw new Error('Tribe not found or access denied.');
    }
  }
}
