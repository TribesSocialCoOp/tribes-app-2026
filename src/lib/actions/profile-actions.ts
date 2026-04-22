'use server';

import { requireAuth, getCurrentUserId } from './shared';
import type { UserProfile } from '@/lib/types';
import { contributionLimiter } from '@/lib/auth/rate-limit';

// ======== USER SERVICE ========
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { getUserProfile: fn } = await import('@/lib/services/user-service');
  return fn(userId);
}

export async function updateUserProfile(userId: string, updates: Partial<Omit<UserProfile, 'id' | 'role' | 'email'>>): Promise<UserProfile | null> {
  const sessionUserId = await requireAuth();
  if (sessionUserId !== userId) throw new Error('Forbidden');
  const { updateUserProfile: fn } = await import('@/lib/services/user-service');
  return fn(userId, updates);
}

export async function graduateUserFromOnboarding(): Promise<UserProfile | null> {
  const userId = await requireAuth();
  const { graduateUserFromOnboarding: fn } = await import('@/lib/services/user-service');
  return fn(userId);
}

// ======== VAULT BACKUP ========
export async function saveVaultBackup(encryptedVaultBase64: string, salt: string): Promise<void> {
  const userId = await requireAuth();
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

// ======== CHECKOUT ========
export async function createCheckoutSession(planId: string, interval: 'monthly' | 'yearly' = 'monthly') {
  if (process.env.BILLING_ENABLED !== 'true') {
    throw new Error('Billing is coming soon! Founding members will get early pricing when we launch.');
  }
  const userId = await requireAuth();
  const { createCheckoutSession: fn } = await import('@/lib/services/payment-service');
  return fn(userId, planId, interval);
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

// ======== ACCOUNT DELETION ========
export async function deleteMyAccount(): Promise<{ success: boolean }> {
  const userId = await requireAuth();
  const { deleteUserAccount } = await import('@/lib/services/account-deletion-service');
  await deleteUserAccount(userId);
  // Clear the session after deletion
  const { deleteSession } = await import('@/lib/auth/session');
  await deleteSession();
  return { success: true };
}
