'use server';

/**
 * Shared auth utilities for server actions.
 * Import these in domain-specific action files.
 */

import { getCurrentUserId as getUserIdFromSession } from '@/lib/auth/session';
import { PublicError } from './error-utils';

export async function getCurrentUserId(): Promise<string | null> {
  return getUserIdFromSession();
}

/**
 * Guard: requires authenticated user.
 * Returns userId or throws.
 *
 * Note: Server actions are CSRF-protected by Next.js itself (Origin header
 * + action ID hashing). API routes must call validateCsrfToken() directly.
 */
export async function requireAuth(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) throw new PublicError('Unauthorized');

  // Check platform-level ban
  const { isUserBanned } = await import('@/lib/services/moderation-service');
  const ban = await isUserBanned(userId);
  if (ban) {
    const reason = ban.reason ? ` Reason: ${ban.reason}` : '';
    const expiry = ban.expiresAt ? ` Expires: ${ban.expiresAt.toLocaleDateString()}.` : ' This ban is permanent.';
    throw new PublicError(`Your account has been suspended.${reason}${expiry}`);
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
  if (user?.role !== 'Admin') throw new PublicError('Forbidden: Admin access required.');
  return userId;
}

/**
 * Guard: requires authenticated user WITH a verified email.
 *
 * Philosophy: Email doesn't need to be real-name — anonymous/alias emails are fine.
 * The verification just proves the account controls a deliverable inbox, dramatically
 * raising the cost for bot farms (they need a working email per account).
 *
 * Applied to: content creation, tribe creation, event hosting, proposals.
 * NOT applied to: reading, browsing, joining public tribes, basic profile.
 */
export async function requireVerifiedEmail(): Promise<string> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [user] = await db.select({
    emailVerified: users.emailVerified,
    email: users.email,
  }).from(users).where(eq(users.id, userId)).limit(1);

  if (!user?.emailVerified) {
    throw new PublicError(
      'Please verify your email address before creating content. Check your inbox for a verification link, or request a new one from your profile settings.'
    );
  }

  return userId;
}

