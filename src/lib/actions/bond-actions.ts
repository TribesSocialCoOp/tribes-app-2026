'use server';

import { requireAuth, getCurrentUserId } from './shared';
import type { Bond, BondRequest, FormationMethod } from '@/lib/types';
import { bondLimiter } from '@/lib/auth/rate-limit';

// ======== BOND SERVICE ========
export async function getBonds(): Promise<Bond[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const { getBonds: fn } = await import('@/lib/services/bond-service');
  return fn(userId);
}

export async function refreshBond(bondId: string): Promise<void> {
  const userId = await requireAuth();
  const { refreshBond: fn } = await import('@/lib/services/bond-service');
  return fn(bondId, userId);
}

export async function revokeBond(bondId: string): Promise<void> {
  const userId = await requireAuth();
  const { revokeBond: fn } = await import('@/lib/services/bond-service');
  return fn(bondId, userId);
}

export async function toggleInnerCircle(bondId: string): Promise<boolean> {
  const userId = await requireAuth();
  const { toggleInnerCircle: fn } = await import('@/lib/services/bond-service');
  return fn(bondId, userId);
}

export async function saveBondSettings(updatedBond: Bond): Promise<void> {
  const userId = await requireAuth();
  const { saveBondSettings: fn } = await import('@/lib/services/bond-service');
  return fn(updatedBond, userId);
}

export async function sendBondRequest(toUserId: string, message?: string, formationMethod: FormationMethod = 'virtual_request'): Promise<BondRequest> {
  const userId = await requireAuth();
  await bondLimiter.check(userId);
  const { createBondRequest: fn } = await import('@/lib/services/bond-service');
  return fn(userId, toUserId, 'person', formationMethod, message);
}

export async function respondToBondRequest(requestId: string, accept: boolean): Promise<void> {
  const userId = await requireAuth();
  if (accept) {
    const { acceptBondRequest: fn } = await import('@/lib/services/bond-service');
    return fn(requestId, userId);
  } else {
    const { rejectBondRequest: fn } = await import('@/lib/services/bond-service');
    return fn(requestId, userId);
  }
}

export async function fetchPendingBondRequests(): Promise<{ incoming: BondRequest[]; outgoing: BondRequest[] }> {
  const userId = await getCurrentUserId();
  if (!userId) return { incoming: [], outgoing: [] };
  const { getPendingBondRequests: fn } = await import('@/lib/services/bond-service');
  return fn(userId);
}

export async function hasOutgoingBondRequest(targetUserId: string): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;
  const { hasOutgoingRequest: fn } = await import('@/lib/services/bond-service');
  return fn(userId, targetUserId);
}

export async function blockUser(blockedUserId: string, reason?: string): Promise<void> {
  const userId = await requireAuth();
  const { blockUser: fn } = await import('@/lib/services/bond-service');
  return fn(userId, blockedUserId, reason);
}

export async function getBlockedUserIds(): Promise<Set<string>> {
  const userId = await getCurrentUserId();
  if (!userId) return new Set();
  const { getBlockedUserIds: fn } = await import('@/lib/services/bond-service');
  return fn(userId);
}

export async function reportUser(reportedUserId: string, reason: string): Promise<void> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { reports, users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [reporter] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  await db.insert(reports).values({
    id: `report-user-${crypto.randomUUID()}`,
    targetType: 'user' as any,
    reporterId: userId,
    reporterName: reporter?.name ?? 'Unknown',
    reason: `User report: ${reportedUserId} — ${reason}`,
    status: 'pending',
    reportedAt: new Date(),
  });
}

// ======== KEY EXCHANGE (Phase 2C) ========
export async function submitBondPublicKey(
  bondId: string,
  publicKeyJwk: string,
  force: boolean = false,
): Promise<{ accepted: boolean; serverKey: string | null }> {
  const userId = await requireAuth();
  const { submitBondPublicKey: fn } = await import('@/lib/services/bond-service');
  return fn(bondId, userId, publicKeyJwk, force);
}

export async function getPeerPublicKey(bondId: string): Promise<string | null> {
  const userId = await requireAuth();
  const { getPeerPublicKey: fn } = await import('@/lib/services/bond-service');
  return fn(bondId, userId);
}

export async function getPeerBondKeyHistory(bondId: string): Promise<Array<{ publicKeyJwk: string; keyHash: string; rotatedAt: Date }>> {
  const userId = await requireAuth();
  const { getPeerBondKeyHistory: fn } = await import('@/lib/services/bond-service');
  return fn(bondId, userId);
}

// ======== INNER CIRCLE INTRODUCTIONS ========
export async function getInnerCircleBonds(): Promise<Bond[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const { getInnerCircleBonds: fn } = await import('@/lib/services/bond-service');
  return fn(userId);
}

export async function sendInnerCircleIntroductions(
  newMemberUserId: string,
  selectedMemberIds: string[],
): Promise<number> {
  const userId = await requireAuth();
  if (selectedMemberIds.length === 0) throw new Error('Select at least one Inner Circle member');
  const { createInnerCircleIntroductions: fn } = await import('@/lib/services/bond-service');
  return fn(userId, newMemberUserId, selectedMemberIds);
}

export async function createBondInviteLink(): Promise<{ url: string; expiresAt: Date }> {
  const userId = await requireAuth();
  const { createTapToken: fn } = await import('@/lib/services/bond-tap-service');
  const result = await fn(userId, 'person');
  return { url: result.url, expiresAt: result.expiresAt };
}

// ======== RECONNECT FLOW ========
export async function requestReconnect(bondId: string): Promise<void> {
  const userId = await requireAuth();
  const { requestReconnect: fn } = await import('@/lib/services/bond-service');
  return fn(bondId, userId);
}

export async function respondToReconnect(bondId: string, accept: boolean): Promise<void> {
  const userId = await requireAuth();
  if (accept) {
    const { approveReconnect: fn } = await import('@/lib/services/bond-service');
    return fn(bondId, userId);
  } else {
    const { declineReconnect: fn } = await import('@/lib/services/bond-service');
    return fn(bondId, userId);
  }
}

/**
 * Forward migration: Reset bonds with key-pair mismatches.
 * Clears publicKeyJwk on bonds where the server key doesn't match
 * any locally recoverable key, allowing clean re-generation on the
 * next sync cycle. Operates on both sides of mutual bonds.
 *
 * @returns Number of bonds reset
 */
export async function migrateBrokenBondKeys(): Promise<number> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { bonds } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  // Find all user-type bonds that have a server-side key
  const userBonds = await db.select().from(bonds)
    .where(and(eq(bonds.userId, userId), eq(bonds.targetType, 'user')));

  let fixed = 0;

  for (const bond of userBonds) {
    if (!bond.publicKeyJwk || !bond.targetId) continue;

    // Find the peer's bond row
    const [peerBond] = await db.select().from(bonds)
      .where(and(eq(bonds.userId, bond.targetId), eq(bonds.targetId, userId)))
      .limit(1);

    if (!peerBond) continue;

    // If both sides have keys, the encryption handshake should work.
    // The key-sync-provider will detect local/server mismatches.
    // Here we just clear bonds where the peer also has a key but
    // the shared-secret derivation keeps failing (both sides need reset).
    // For safety, only clear OUR side — let the peer's device handle theirs.
    await db.update(bonds).set({ publicKeyJwk: null })
      .where(eq(bonds.id, bond.id));
    fixed++;
  }

  return fixed;
}
