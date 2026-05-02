'use server';

import { requireAuth, getCurrentUserId } from './shared';
import type { UserProfile } from '@/lib/types';
import { contributionLimiter } from '@/lib/auth/rate-limit';

// ======== USER SERVICE ========
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { getUserProfile: fn } = await import('@/lib/services/user-service');
  return fn(userId);
}

export async function updateUserProfile(userId: string, updates: Partial<Omit<UserProfile, 'id' | 'role' | 'email'>>): Promise<
  { success: true; profile: UserProfile } | { success: false; error: string }
> {
  const sessionUserId = await requireAuth();
  if (sessionUserId !== userId) return { success: false, error: 'Forbidden' };
  try {
    const { updateUserProfile: fn } = await import('@/lib/services/user-service');
    const profile = await fn(userId, updates);
    if (!profile) return { success: false, error: 'Profile not found.' };
    return { success: true, profile };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'An unexpected error occurred.' };
  }
}

export async function graduateUserFromOnboarding(): Promise<UserProfile | null> {
  const userId = await requireAuth();
  const { graduateUserFromOnboarding: fn } = await import('@/lib/services/user-service');
  return fn(userId);
}

// ======== VAULT BACKUP ========
export async function saveVaultBackup(encryptedVaultBase64: string, salt: string): Promise<void> {
  const userId = await requireAuth();
  // Subscription guard: vault backup is a paid feature
  const { hasFeature } = await import('@/lib/services/subscription-guard');
  if (!(await hasFeature(userId, 'vault_backup'))) {
    throw new Error('Vault backup requires a paid membership. Upgrade to unlock this feature.');
  }
  const binaryStr = atob(encryptedVaultBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const { saveVaultBackup: fn } = await import('@/lib/services/vault-service');
  return fn(userId, bytes.buffer as ArrayBuffer, salt);
}

export async function getVaultBackup(): Promise<{ encryptedVaultBase64: string; salt: string; createdAt: string } | null> {
  const userId = await requireAuth();
  const { getVaultBackup: fn } = await import('@/lib/services/vault-service');
  const result = await fn(userId);
  if (!result) return null;
  const bytes = new Uint8Array(result.encryptedVault);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return {
    encryptedVaultBase64: btoa(binary),
    salt: result.salt,
    createdAt: result.createdAt.toISOString(),
  };
}

export async function hasVaultBackup(): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;
  const { hasVaultBackup: fn } = await import('@/lib/services/vault-service');
  return fn(userId);
}

// ======== BILLING & SUBSCRIPTIONS ========
export async function getAvailablePlans() {
  const { getAvailablePlans: fn } = await import('@/lib/services/payment-service');
  return fn();
}

export async function getFeatureSummary() {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const { getFeatureSummary: fn } = await import('@/lib/services/subscription-guard');
  return fn(userId);
}

export async function checkCanCreateBond() {
  const userId = await getCurrentUserId();
  if (!userId) return { allowed: false, current: 0, limit: 0, planName: 'N/A' };
  const { canCreateBond: fn } = await import('@/lib/services/subscription-guard');
  return fn(userId);
}

export async function checkCanCreateTribe() {
  const userId = await getCurrentUserId();
  if (!userId) return { allowed: false, current: 0, limit: 0, planName: 'N/A' };
  const { canCreateTribe: fn } = await import('@/lib/services/subscription-guard');
  return fn(userId);
}

// ======== INVITE CODES ========
export async function validateInviteCode(code: string) {
  const { validateInviteCode: fn } = await import('@/lib/services/invite-service');
  return fn(code);
}

export async function redeemInviteCode(code: string) {
  const userId = await requireAuth();
  const { redeemInviteCode: fn } = await import('@/lib/services/invite-service');
  return fn(userId, code);
}

export async function generateInviteCode(maxUses: number = 5) {
  const userId = await requireAuth();
  const { generateInviteCode: fn } = await import('@/lib/services/invite-service');
  return fn(userId, maxUses);
}

export async function getMyInviteCodes() {
  const userId = await requireAuth();
  const { getUserInviteCodes } = await import('@/lib/services/invite-service');
  return getUserInviteCodes(userId);
}

/**
 * Gets or creates a personal referral invite code for embedding in share links.
 * Reuses an existing code with remaining uses, or generates a new one.
 */
export async function getOrCreatePersonalInviteCode(): Promise<string> {
  const userId = await requireAuth();
  const { getUserInviteCodes, generateInviteCode: genCode } = await import('@/lib/services/invite-service');

  // Check for an existing code with remaining uses
  const codes = await getUserInviteCodes(userId);
  const active = codes.find(c => (c.usedCount ?? 0) < (c.maxUses ?? 1));
  if (active) return active.id;

  // Generate a new one
  const { code } = await genCode(userId, 5);
  return code;
}

export async function revokeInviteCode(codeId: string) {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { inviteCodes } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  // Verify ownership OR admin
  const isAdmin = await _isAdmin(userId);
  const [code] = await db.select().from(inviteCodes)
    .where(isAdmin ? eq(inviteCodes.id, codeId) : and(eq(inviteCodes.id, codeId), eq(inviteCodes.createdBy, userId)))
    .limit(1);
  if (!code) throw new Error('Code not found or you do not own it');

  // Set maxUses to usedCount to exhaust it
  await db.update(inviteCodes)
    .set({ maxUses: code.usedCount ?? 0 })
    .where(eq(inviteCodes.id, codeId));
}

// ======== ADMIN INVITE CODES ========
async function _isAdmin(userId: string): Promise<boolean> {
  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return user?.role === 'Admin' || user?.role === 'System';
}

export async function getAllInviteCodes() {
  const userId = await requireAuth();
  if (!(await _isAdmin(userId))) throw new Error('Admin only');
  const { getAllInviteCodes: fn } = await import('@/lib/services/invite-service');
  return fn();
}

export async function createFoundingCode(planId: string = 'individual_coop', maxUses: number = 10) {
  const userId = await requireAuth();
  if (!(await _isAdmin(userId))) throw new Error('Admin only');
  const { createFoundingCodes } = await import('@/lib/services/invite-service');
  const codes = await createFoundingCodes('admin-ui', 1, planId, maxUses);
  return { code: codes[0]! };
}

// ======== CHECKOUT ========
export async function createCheckoutSession(planId: string, interval: 'monthly' | 'yearly' = 'monthly') {
  if (process.env.BILLING_ENABLED !== 'true') {
    throw new Error('Billing is coming soon! Founding members will get early pricing when we launch.');
  }
  const userId = await requireAuth();
  const { createCheckoutSession: fn } = await import('@/lib/services/payment-service');
  return fn(userId, planId, interval);
}

export async function createBillingPortalAction(): Promise<{ url: string }> {
  const userId = await requireAuth();
  const { createBillingPortalSession } = await import('@/lib/services/payment-service');
  return createBillingPortalSession(userId);
}

// ======== CONTRIBUTIONS ========
export async function recordContribution(type: string, referenceId?: string, description?: string) {
  const userId = await requireAuth();
  await contributionLimiter.check(userId);
  const { recordContribution: fn } = await import('@/lib/services/contribution-service');
  return fn(userId, type, referenceId, description);
}

export async function getContributionSummary() {
  const userId = await requireAuth();
  const { getContributionSummary: fn } = await import('@/lib/services/contribution-service');
  return fn(userId);
}

/**
 * Aggregated creator analytics — personal dashboard data.
 * Gated behind 'creator_analytics' feature flag in the UI.
 */
export async function getCreatorAnalytics() {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { posts, tribes, bonds, tribeMembers, events, contributions } = await import('@/db/schema');
  const { eq, and, gte, count, sql } = await import('drizzle-orm');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Parallel queries for speed
  const [
    [postCount], [recentPostCount], [tribeCount], [bondCount],
    [eventCount], [vibeTotal], topPosts, contributionRows,
  ] = await Promise.all([
    db.select({ count: count() }).from(posts).where(eq(posts.authorId, userId)),
    db.select({ count: count() }).from(posts).where(and(eq(posts.authorId, userId), gte(posts.createdAt, thirtyDaysAgo))),
    db.select({ count: count() }).from(tribes).where(eq(tribes.createdBy, userId)),
    db.select({ count: count() }).from(bonds).where(eq(bonds.userId, userId)),
    db.select({ count: count() }).from(events).where(eq(events.creatorId, userId)),
    db.select({ total: sql<number>`COALESCE(SUM(${posts.vibeCount}), 0)` }).from(posts).where(eq(posts.authorId, userId)),
    db.select({
      title: posts.title,
      vibeCount: posts.vibeCount,
      commentCount: posts.commentCount,
      tribeId: posts.tribeId,
      createdAt: posts.createdAt,
    }).from(posts).where(eq(posts.authorId, userId))
      .orderBy(sql`${posts.vibeCount} + ${posts.commentCount} DESC`)
      .limit(5),
    db.select({
      type: contributions.type,
      points: contributions.points,
      createdAt: contributions.createdAt,
    }).from(contributions).where(eq(contributions.userId, userId))
      .orderBy(sql`${contributions.createdAt} DESC`)
      .limit(20),
  ]);

  // Tribe memberships for "reach" metric
  const [membershipCount] = await db.select({ count: count() }).from(tribeMembers).where(eq(tribeMembers.userId, userId));

  return {
    totalPosts: postCount?.count ?? 0,
    recentPosts: recentPostCount?.count ?? 0,
    tribesOwned: tribeCount?.count ?? 0,
    tribesMember: membershipCount?.count ?? 0,
    totalBonds: bondCount?.count ?? 0,
    totalEvents: eventCount?.count ?? 0,
    totalVibes: Number(vibeTotal?.total ?? 0),
    topPosts: topPosts.map(p => ({
      title: p.title || 'Untitled',
      vibes: p.vibeCount ?? 0,
      comments: p.commentCount ?? 0,
      tribeId: p.tribeId,
    })),
    recentContributions: contributionRows.map(c => ({
      type: c.type,
      points: c.points,
      createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
    })),
  };
}

/**
 * Server action to check if the current user has access to creator analytics.
 */
export async function checkCreatorAnalyticsAccess(): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;
  const { hasFeature } = await import('@/lib/services/subscription-guard');
  return hasFeature(userId, 'creator_analytics');
}

// ======== SUBSCRIPTION STATUS ========
export async function getMySubscription() {
  const userId = await getCurrentUserId();
  if (!userId) return { subscription: null, plan: { id: 'free', name: 'Always Free' } };
  const { getSubscriptionForUser } = await import('@/lib/services/payment-service');
  return getSubscriptionForUser(userId);
}

// ======== WALL BLOCKS ========
export async function getWallBlocks() {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const { getWallBlocks: fn } = await import('@/lib/services/wall-service');
  return fn(userId);
}

// Public wall access (any authenticated user can view another user's wall)
export async function getPublicProfile(targetUserId: string) {
  await requireAuth(); // Must be logged in
  const { getUserProfile: fn } = await import('@/lib/services/user-service');
  const profile = await fn(targetUserId);
  if (!profile) return null;
  return {
    id: profile.id,
    name: profile.name,
    bio: profile.bio,
    avatar: profile.avatar,
    reputationStatus: profile.reputationStatus,
  };
}

export async function getPublicWallBlocks(targetUserId: string) {
  await requireAuth();
  const { getWallBlocks: fn } = await import('@/lib/services/wall-service');
  return fn(targetUserId);
}

export async function getPublicWallStyle(targetUserId: string) {
  await requireAuth();
  const { getWallStyle: fn } = await import('@/lib/services/wall-service');
  return fn(targetUserId);
}

export async function saveWallBlock(block: { id: string; type: string; content: string; sortOrder: number }) {
  const userId = await requireAuth();
  const { saveWallBlock: fn } = await import('@/lib/services/wall-service');
  return fn(userId, block);
}

export async function deleteWallBlock(blockId: string) {
  const userId = await requireAuth();
  const { deleteWallBlock: fn } = await import('@/lib/services/wall-service');
  return fn(userId, blockId);
}

export async function reorderWallBlocks(blockIds: string[]) {
  const userId = await requireAuth();
  const { reorderWallBlocks: fn } = await import('@/lib/services/wall-service');
  return fn(userId, blockIds);
}

export async function getWallStyle() {
  const userId = await getCurrentUserId();
  if (!userId) return { backgroundColor: 'bg-background', layout: 'single-column' };
  const { getWallStyle: fn } = await import('@/lib/services/wall-service');
  return fn(userId);
}

export async function saveWallStyle(style: { backgroundColor: string; layout: string }) {
  const userId = await requireAuth();
  const { saveWallStyle: fn } = await import('@/lib/services/wall-service');
  return fn(userId, style);
}

// ======== ACCOUNT DELETION (30-day grace period) ========

export async function deleteMyAccount(): Promise<{ success: boolean; scheduledDate: string }> {
  const userId = await requireAuth();
  const { requestAccountDeletion } = await import('@/lib/services/account-deletion-service');
  const { scheduledDate } = await requestAccountDeletion(userId);
  // Clear the session after scheduling deletion
  const { deleteSession } = await import('@/lib/auth/session');
  await deleteSession();
  return { success: true, scheduledDate: scheduledDate.toISOString() };
}

export async function cancelMyAccountDeletion(): Promise<{ success: boolean }> {
  const userId = await requireAuth();
  const { cancelAccountDeletion } = await import('@/lib/services/account-deletion-service');
  await cancelAccountDeletion(userId);
  return { success: true };
}

export async function getMyDeletionStatus() {
  const userId = await requireAuth();
  const { getDeletionStatus } = await import('@/lib/services/account-deletion-service');
  return getDeletionStatus(userId);
}
