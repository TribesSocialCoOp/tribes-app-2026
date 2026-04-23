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
// VAPID CONFIGURATION
// ============================================================

let vapidConfigured = false;

async function ensureVapidConfigured(): Promise<boolean> {
  if (vapidConfigured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:noreply@tribes.app';

  if (!publicKey || !privateKey) {
    console.warn('[push] VAPID keys not configured — push notifications disabled');
    return false;
  }

  try {
    const webpush = await import('web-push');
    webpush.default.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
    return true;
  } catch (err) {
    console.error('[push] Failed to configure VAPID:', err);
    return false;
  }
}

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

// ============================================================
// PUSH DELIVERY
// ============================================================

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  actions?: Array<{ action: string; title: string }>;
}

/**
 * Sends a push notification to a user.
 * Checks notification preferences before sending.
 * Cleans up stale subscriptions on 410 (expired).
 *
 * @returns true if notification was sent, false if skipped or failed
 */
export async function sendPushNotification(
  userId: string,
  payload: PushPayload,
): Promise<boolean> {
  // Check user preference
  try {
    const { getPreferences } = await import('./notification-service');
    const prefs = await getPreferences(userId);
    if (!prefs.pushEnabled) {
      return false;
    }
  } catch {
    // If we can't check prefs, proceed anyway
  }

  // Get subscription
  const sub = await getPushSubscription(userId);
  if (!sub || !sub.keysP256dh || !sub.keysAuth) {
    return false;
  }

  // Ensure VAPID is configured
  const configured = await ensureVapidConfigured();
  if (!configured) {
    return false;
  }

  try {
    const webpush = await import('web-push');
    await webpush.default.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keysP256dh,
          auth: sub.keysAuth,
        },
      },
      JSON.stringify(payload),
    );
    return true;
  } catch (err: any) {
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      // Subscription expired or invalid — clean up
      console.log(`[push] Subscription expired for user ${userId}, cleaning up`);
      await removePushSubscription(userId);
    } else {
      console.error(`[push] Failed to send notification to user ${userId}:`, err?.message ?? err);
    }
    return false;
  }
}

/**
 * Sends a push notification to multiple users.
 * Useful for tribe-wide announcements or broadcast events.
 */
export async function sendPushToMultiple(
  userIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const userId of userIds) {
    const result = await sendPushNotification(userId, payload);
    if (result) sent++;
    else failed++;
  }

  return { sent, failed };
}
