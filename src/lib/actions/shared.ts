'use server';

/**
 * Shared auth utilities for server actions.
 * Import these in domain-specific action files.
 */

import { getCurrentUserId as getUserIdFromSession } from '@/lib/auth/session';
import { validateCsrfToken } from '@/lib/auth/csrf';

export async function getCurrentUserId(): Promise<string | null> {
  return getUserIdFromSession();
}

/**
 * Guard: validates CSRF token + requires authenticated user.
 * Returns userId or throws.
 */
export async function requireAuth(csrfToken?: string): Promise<string> {
  await validateCsrfToken(csrfToken);
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Unauthorized');

  // Check platform-level ban
  const { isUserBanned } = await import('@/lib/services/moderation-service');
  const ban = await isUserBanned(userId);
  if (ban) {
    const reason = ban.reason ? ` Reason: ${ban.reason}` : '';
    const expiry = ban.expiresAt ? ` Expires: ${ban.expiresAt.toLocaleDateString()}.` : ' This ban is permanent.';
    throw new Error(`Your account has been suspended.${reason}${expiry}`);
  }

  return userId;
}

/** Fire-and-forget contribution tracking. Absorbs failures so callers don't need try/catch. */
export async function trackContribution(userId: string, type: string, refId: string, desc: string) {
  try {
    const { recordContribution } = await import('@/lib/services/contribution-service');
    await recordContribution(userId, type, refId, desc);
  } catch (e) { console.warn('[contributions] tracking failed:', e); }
}

/**
 * Guard: requires authenticated user with Admin role.
 * Returns userId or throws.
 */
export async function requireAdmin(): Promise<string> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (user?.role !== 'Admin') throw new Error('Forbidden: Admin access required.');
  return userId;
}

