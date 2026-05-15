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
