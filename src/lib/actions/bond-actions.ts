'use server';

import { requireAuth, getCurrentUserId } from './shared';
import type { Bond, BondRequest, BondType, FormationMethod } from '@/lib/types';
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

export async function upgradeToFamilyBond(bondId: string): Promise<void> {
  const userId = await requireAuth();
  const { upgradeToFamilyBond: fn } = await import('@/lib/services/bond-service');
  return fn(bondId, userId);
}

export async function saveBondSettings(updatedBond: Bond): Promise<void> {
  const userId = await requireAuth();
  const { saveBondSettings: fn } = await import('@/lib/services/bond-service');
  return fn(updatedBond, userId);
}

export async function sendBondRequest(toUserId: string, bondType: BondType, message?: string, formationMethod: FormationMethod = 'virtual_request'): Promise<BondRequest> {
  const userId = await requireAuth();
  await bondLimiter.check(userId);
  const { createBondRequest: fn } = await import('@/lib/services/bond-service');
  return fn(userId, toUserId, bondType, formationMethod, message);
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

// ======== FAMILY INTRODUCE (P4-2) ========
export async function getFamilyBonds(): Promise<Bond[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const { getFamilyBonds: fn } = await import('@/lib/services/bond-service');
  return fn(userId);
}

export async function sendFamilyIntroductions(
  newMemberUserId: string,
  selectedFamilyMemberIds: string[],
): Promise<number> {
  const userId = await requireAuth();
  if (selectedFamilyMemberIds.length === 0) throw new Error('Select at least one family member');
  const { createFamilyIntroductions: fn } = await import('@/lib/services/bond-service');
  return fn(userId, newMemberUserId, selectedFamilyMemberIds);
}

export async function createFamilyInviteLink(): Promise<{ url: string; expiresAt: Date }> {
  const userId = await requireAuth();
  const { createTapToken: fn } = await import('@/lib/services/bond-tap-service');
  const result = await fn(userId, 'family');
  return { url: result.url, expiresAt: result.expiresAt };
}
