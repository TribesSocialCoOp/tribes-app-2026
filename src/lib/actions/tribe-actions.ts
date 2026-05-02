'use server';

import { requireAuth, requireVerifiedEmail, getCurrentUserId } from './shared';
import type { Tribe, TribeMember, PendingMember } from '@/lib/types';
import { trackContribution } from './shared';
import { withPublicErrors, PublicError } from './error-utils';
import type { TribeAccessLevel } from '@/lib/services/tribe-auth';

// ======== TRIBE DATA ACCESS ========
export async function getTribes(): Promise<Tribe[]> {
  const userId = await getCurrentUserId();
  const { getTribes: fn } = await import('@/lib/data-access/tribes');
  return fn(userId);
}

export async function getTribeById(tribeId: string): Promise<Tribe | null> {
  const userId = await getCurrentUserId();
  const { getTribeById: fn } = await import('@/lib/data-access/tribes');
  return fn(tribeId, userId);
}

export async function findTribeByName(name: string): Promise<Tribe | null> {
  const userId = await getCurrentUserId();
  const { findTribeByName: fn } = await import('@/lib/data-access/tribes');
  return fn(name, userId);
}

export async function getTribeBySlug(slug: string): Promise<Tribe | null> {
  const userId = await getCurrentUserId();
  const { getTribeBySlug: fn } = await import('@/lib/data-access/tribes');
  return fn(slug, userId);
}

export async function getTribeByInviteToken(token: string): Promise<Tribe | null> {
  const { getTribeByInviteToken: fn } = await import('@/lib/data-access/tribes');
  return fn(token);
}

export async function regenerateInviteToken(tribeId: string): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  // Verify the caller is a founder/speaker of this tribe
  const { db } = await import('@/db');
  const { tribeMembers, tribes } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const [membership] = await db.select({ role: tribeMembers.role })
    .from(tribeMembers)
    .where(and(eq(tribeMembers.tribeId, tribeId), eq(tribeMembers.userId, userId)))
    .limit(1);

  if (!membership || !['founder', 'speaker'].includes(membership.role || '')) {
    throw new Error('Only tribe founders and speakers can regenerate invite links');
  }

  const { generateInviteToken } = await import('@/lib/invite-token');
  const newToken = generateInviteToken();

  await db.update(tribes)
    .set({ inviteToken: newToken })
    .where(eq(tribes.id, tribeId));

  return newToken;
}

export async function getMyTribeIds(): Promise<string[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const { db } = await import('@/db');
  const { tribeMembers } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const rows = await db.select({ tribeId: tribeMembers.tribeId }).from(tribeMembers).where(eq(tribeMembers.userId, userId));
  return rows.map(r => r.tribeId);
}

/** Returns full Tribe objects for the current user's memberships. */
export async function getMyTribes(): Promise<Tribe[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const [allTribes, myIds] = await Promise.all([getTribes(), getMyTribeIds()]);
  return allTribes.filter(t => myIds.includes(t.id));
}

// ======== TRIBE AUTH CHECK (for UI pages) ========

/**
 * Returns the caller's access level for a tribe.
 * Used by UI pages (settings, manage-members, mod-queue) to determine access.
 */
export async function checkTribeAccess(tribeId: string): Promise<TribeAccessLevel> {
  const userId = await getCurrentUserId();
  if (!userId) return 'guest';
  const { getTribeAccessLevel } = await import('@/lib/services/tribe-auth');
  return getTribeAccessLevel(userId, tribeId);
}

// ======== TRIBE SERVICE (MUTATIONS — all hardened with auth) ========

export const createTribe = withPublicErrors(async (payload: Parameters<typeof import('@/lib/services/tribe-service').createTribe>[0]): Promise<Tribe> => {
  const userId = await requireVerifiedEmail();
  // Subscription guard: check if user can create another tribe
  const { canCreateTribe } = await import('@/lib/services/subscription-guard');
  const check = await canCreateTribe(userId);
  if (!check.allowed) {
    throw new PublicError(`You have reached your tribe creation limit (${check.current}/${check.limit}). Upgrade your plan to create more.`);
  }
  const { createTribe: fn } = await import('@/lib/services/tribe-service');
  const result = await fn({ ...payload, createdBy: userId });
  trackContribution(userId, 'tribe_created', result.id, `Created tribe: ${result.name}`);
  return result;
});

export async function updateTribeSettings(tribeId: string, payload: Parameters<typeof import('@/lib/services/tribe-service').updateTribeSettings>[1]): Promise<Tribe | null> {
  const userId = await requireAuth();
  const { requireTribeFounder } = await import('@/lib/services/tribe-auth');
  await requireTribeFounder(userId, tribeId);
  const { updateTribeSettings: fn } = await import('@/lib/services/tribe-service');
  return fn(tribeId, payload);
}

export async function getTribeMembers(tribeId: string): Promise<TribeMember[]> {
  // Gate private tribe member lists: non-members can't see who's in a private tribe
  const { getTribeById: fetchTribe } = await import('@/lib/data-access/tribes');
  const tribe = await fetchTribe(tribeId);
  if (tribe && !tribe.isPublic) {
    const userId = await getCurrentUserId();
    if (!userId) return []; // Guests can't see private tribe members
    const { getTribeAccessLevel } = await import('@/lib/services/tribe-auth');
    const access = await getTribeAccessLevel(userId, tribeId);
    if (access === 'guest') return []; // Non-members can't see private tribe members
  }
  const { getTribeMembers: fn } = await import('@/lib/services/tribe-service');
  return fn(tribeId);
}

export async function getPendingMembers(tribeId: string): Promise<PendingMember[]> {
  const userId = await requireAuth();
  const { requireTribeSpeaker } = await import('@/lib/services/tribe-auth');
  await requireTribeSpeaker(userId, tribeId);
  const { getPendingMembers: fn } = await import('@/lib/services/tribe-service');
  return fn(tribeId);
}

export async function updateMemberNickname(tribeId: string, memberId: string, nickname: string | undefined): Promise<void> {
  const userId = await requireAuth();
  const { requireTribeSpeaker } = await import('@/lib/services/tribe-auth');
  await requireTribeSpeaker(userId, tribeId);
  const { updateMemberNickname: fn } = await import('@/lib/services/tribe-service');
  return fn(tribeId, memberId, nickname);
}

export async function updateMemberRole(tribeId: string, memberId: string, role: 'member' | 'speaker'): Promise<void> {
  const userId = await requireAuth();
  // Only founders can appoint/remove speakers
  const { requireTribeFounder } = await import('@/lib/services/tribe-auth');
  await requireTribeFounder(userId, tribeId);
  const { updateMemberRole: fn } = await import('@/lib/services/tribe-service');
  return fn(tribeId, memberId, role);
}

export async function approveJoinRequest(tribeId: string, pendingMemberId: string): Promise<void> {
  const userId = await requireAuth();
  const { requireTribeSpeaker } = await import('@/lib/services/tribe-auth');
  await requireTribeSpeaker(userId, tribeId);
  const { approveJoinRequest: fn } = await import('@/lib/services/tribe-service');
  return fn(tribeId, pendingMemberId);
}

export async function denyJoinRequest(tribeId: string, pendingMemberId: string): Promise<void> {
  const userId = await requireAuth();
  const { requireTribeSpeaker } = await import('@/lib/services/tribe-auth');
  await requireTribeSpeaker(userId, tribeId);
  const { denyJoinRequest: fn } = await import('@/lib/services/tribe-service');
  return fn(tribeId, pendingMemberId);
}

export async function leaveTribe(tribeId: string): Promise<void> {
  const userId = await requireAuth();
  const { leaveTribe: fn } = await import('@/lib/services/tribe-service');
  return fn(userId, tribeId);
}

export async function deleteTribe(tribeId: string): Promise<void> {
  const userId = await requireAuth();
  const { requireTribeFounder } = await import('@/lib/services/tribe-auth');
  await requireTribeFounder(userId, tribeId);
  const { deleteTribe: fn } = await import('@/lib/services/tribe-service');
  return fn(userId, tribeId);
}

export async function requestToJoinTribe(tribeId: string, aliasName?: string, aliasAvatar?: string): Promise<'joined' | 'pending' | 'rejected'> {
  const userId = await requireAuth();
  const { requestToJoinTribe: fn } = await import('@/lib/services/tribe-service');
  return fn(userId, tribeId, aliasName, aliasAvatar);
}

export async function updateTribeMemberIdentity(tribeId: string, aliasName?: string, aliasAvatar?: string): Promise<void> {
  const userId = await requireAuth();
  const { updateTribeMemberIdentity: fn } = await import('@/lib/services/tribe-service');
  return fn(userId, tribeId, aliasName, aliasAvatar);
}

// ======== TRIBE ANALYTICS ========
export async function getTribeAnalytics(tribeId: string) {
  const userId = await requireAuth();
  const { requireTribeSpeaker } = await import('@/lib/services/tribe-auth');
  await requireTribeSpeaker(userId, tribeId);
  const { getTribeAnalytics: fn } = await import('@/lib/services/tribe-service');
  return fn(tribeId);
}

/**
 * Advanced analytics (Org Pro+) — activity heatmaps, top contributors, retention.
 * Returns null if the user doesn't have the 'analytics' feature.
 */
export async function getAdvancedTribeAnalytics(tribeId: string) {
  const userId = await requireAuth();
  const { requireTribeSpeaker } = await import('@/lib/services/tribe-auth');
  await requireTribeSpeaker(userId, tribeId);

  // Feature gate
  const { hasFeature } = await import('@/lib/services/subscription-guard');
  const hasAccess = await hasFeature(userId, 'analytics');
  if (!hasAccess) return null;

  const { getAdvancedTribeAnalytics: fn } = await import('@/lib/services/tribe-service');
  return fn(tribeId);
}

// ======== VERIFIED STATUS ========
/**
 * Returns whether the tribe owner has a verified profile badge.
 */
export async function getTribeOwnerVerified(tribeId: string): Promise<boolean> {
  const { db } = await import('@/db');
  const { tribes, users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [tribe] = await db.select({ createdBy: tribes.createdBy }).from(tribes).where(eq(tribes.id, tribeId)).limit(1);
  if (!tribe?.createdBy) return false;
  const [user] = await db.select({ isVerified: users.isVerified }).from(users).where(eq(users.id, tribe.createdBy)).limit(1);
  return user?.isVerified ?? false;
}

// ======== TRIBE GROUP KEY MANAGEMENT ========

/**
 * Fetches the current user's tribe key grants for all active tribe keys.
 * Called by the KeySyncProvider to populate the local tribe key store.
 */
export async function getMyTribeKeyGrants() {
  const userId = await requireAuth();
  const { getUserTribeKeyGrants } = await import('@/lib/services/tribe-key-service');
  return getUserTribeKeyGrants(userId);
}

/**
 * Creates a new tribe key record on the server.
 * Called by the tribe founder's client after generating the AES key locally.
 */
export async function initializeTribeKey(tribeId: string): Promise<string> {
  const userId = await requireAuth();
  const { requireTribeFounder } = await import('@/lib/services/tribe-auth');
  await requireTribeFounder(userId, tribeId);
  const { createTribeKey } = await import('@/lib/services/tribe-key-service');
  return createTribeKey(tribeId, userId);
}

/**
 * Stores a wrapped tribe key grant for a specific recipient.
 * Called by key admins (founders/speakers) to distribute the tribe key.
 */
export async function issueTribeKeyGrant(
  tribeKeyId: string,
  recipientId: string,
  wrappedKey: string,
  wrapIv: string,
  bondId?: string,
): Promise<void> {
  const userId = await requireAuth();
  const { createTribeKeyGrant } = await import('@/lib/services/tribe-key-service');
  return createTribeKeyGrant(tribeKeyId, recipientId, wrappedKey, wrapIv, userId, bondId);
}

/**
 * Gets the active tribe key metadata for a tribe.
 */
export async function getActiveTribeKeyForTribe(tribeId: string) {
  const userId = await requireAuth();
  // Verify membership
  const { getTribeAccessLevel } = await import('@/lib/services/tribe-auth');
  const access = await getTribeAccessLevel(userId, tribeId);
  if (access === 'guest') throw new Error('Not a member of this tribe');
  const { getActiveTribeKey } = await import('@/lib/services/tribe-key-service');
  return getActiveTribeKey(tribeId);
}

/**
 * Gets tribe members who don't yet have a key grant.
 * Used by key admins to know who needs a wrapped key.
 */
export async function getUngrantedTribeMembers(tribeId: string): Promise<string[]> {
  const userId = await requireAuth();
  const { requireTribeSpeaker } = await import('@/lib/services/tribe-auth');
  await requireTribeSpeaker(userId, tribeId);
  const { getMembersWithoutGrants } = await import('@/lib/services/tribe-key-service');
  return getMembersWithoutGrants(tribeId);
}

/**
 * Rotates the tribe key — deactivates current key and creates new version.
 * Called when a member is removed from a private tribe.
 */
export async function rotateTribeGroupKey(tribeId: string): Promise<string> {
  const userId = await requireAuth();
  const { requireTribeFounder } = await import('@/lib/services/tribe-auth');
  await requireTribeFounder(userId, tribeId);
  const { rotateTribeKey } = await import('@/lib/services/tribe-key-service');
  return rotateTribeKey(tribeId, userId);
}
