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

// ======== KEY EXCHANGE (Phase 2C) ========
export async function submitBondPublicKey(bondId: string, publicKeyJwk: string): Promise<void> {
  const userId = await requireAuth();
  const { submitBondPublicKey: fn } = await import('@/lib/services/bond-service');
  return fn(bondId, userId, publicKeyJwk);
}

export async function getPeerPublicKey(bondId: string): Promise<string | null> {
  const userId = await requireAuth();
  const { getPeerPublicKey: fn } = await import('@/lib/services/bond-service');
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
