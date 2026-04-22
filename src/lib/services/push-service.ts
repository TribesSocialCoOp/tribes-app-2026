/**
 * @fileoverview Dual-mode push notification service.
 * DEV: Uses browser Notification API directly (local simulator).
 * PROD: Uses web-push with VAPID keys (real push).
 *
 * Follows the same local-first pattern as Garage S3: simulate in dev,
 * swap transport for production.
 */

import { db } from '@/db';
import { pushSubscriptions } from '@/db/schema';
import { eq } from 'drizzle-orm';

// ============================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================

/**
 * Registers a push subscription for a user.
 */
export async function registerPushSubscription(
  userId: string,
  subscription: { endpoint: string; keys?: { p256dh?: string; auth?: string } },
): Promise<void> {
  const id = `push-${userId}-${Date.now()}`;

  // Remove existing subscription for this user (one per user)
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));

  await db.insert(pushSubscriptions).values({
    id,
    userId,
    endpoint: subscription.endpoint,
    keysP256dh: subscription.keys?.p256dh ?? null,
    keysAuth: subscription.keys?.auth ?? null,
  });
}

/**
 * Removes a user's push subscription.
 */
export async function removePushSubscription(userId: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
}

/**
 * Gets a user's push subscription (if any).
 */
export async function getPushSubscription(userId: string) {
  const [sub] = await db.select().from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .limit(1);
  return sub ?? null;
}

/**
 * Checks if a user has an active push subscription.
 */
export async function hasActivePushSubscription(userId: string): Promise<boolean> {
  const sub = await getPushSubscription(userId);
  return sub !== null;
}
