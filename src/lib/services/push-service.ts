/**
 * @fileoverview Dual-mode push notification service.
 * DEV: Uses browser Notification API directly (local simulator).
 * PROD: Uses web-push with VAPID keys (real push).
 * iOS APNs: Direct HTTP/2 certificate-based push using native node:http2 and keys/apns-push.p12.
 * Android FCM: Direct OAuth2 REST v1 push using google-auth-library and keys/fcm-service-account.json.
 *
 * Follows the same local-first pattern as Garage S3: simulate in dev,
 * swap transport for production.
 */

import { db } from '@/db';
import { pushSubscriptions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import http2 from 'node:http2';

// ============================================================
// HELPERS
// ============================================================

/** Truncate a device token for safe logging (first 8 + last 4 chars). */
function truncateToken(token: string): string {
  if (token.length <= 16) return token.slice(0, 4) + '…';
  return token.slice(0, 8) + '…' + token.slice(-4);
}

// Module-level caches to avoid re-reading from disk on every push
let _apnsCertBuffer: Buffer | null = null;
let _fcmJwtClient: any = null;

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
    console.warn('[push] VAPID keys not configured — web push notifications disabled');
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
 * Registers a push subscription for a user, keeping one per platform.
 */
export async function registerPushSubscription(
  userId: string,
  subscription: {
    endpoint: string;
    keys?: { p256dh?: string; auth?: string };
    platform?: 'web' | 'ios' | 'android';
  },
): Promise<void> {
  const platform = subscription.platform ?? 'web';
  const id = `push-${userId}-${platform}-${Date.now()}`;

  // Remove existing subscription for this user on the SAME platform to prevent growth
  await db.delete(pushSubscriptions).where(
    and(
      eq(pushSubscriptions.userId, userId),
      eq(pushSubscriptions.platform, platform)
    )
  );

  // Also remove this exact endpoint if registered elsewhere to prevent duplicate delivery or conflict keys
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, subscription.endpoint));

  await db.insert(pushSubscriptions).values({
    id,
    userId,
    endpoint: subscription.endpoint,
    keysP256dh: subscription.keys?.p256dh ?? null,
    keysAuth: subscription.keys?.auth ?? null,
    platform,
  });
}

/**
 * Removes a user's push subscriptions, optionally targeting a specific platform.
 */
export async function removePushSubscription(
  userId: string,
  platform?: 'web' | 'ios' | 'android',
): Promise<void> {
  if (platform) {
    await db.delete(pushSubscriptions).where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.platform, platform)
      )
    );
  } else {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  }
}

/**
 * Gets a user's primary push subscription (if any).
 */
export async function getPushSubscription(userId: string) {
  const [sub] = await db.select().from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .limit(1);
  return sub ?? null;
}

/**
 * Gets all active push subscriptions for a user.
 */
export async function getPushSubscriptions(userId: string) {
  return db.select().from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
}

/**
 * Checks if a user has an active push subscription.
 */
export async function hasActivePushSubscription(userId: string): Promise<boolean> {
  const subs = await getPushSubscriptions(userId);
  return subs.length > 0;
}

// ============================================================
// PLATFORM-SPECIFIC DELIVERERS
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
 * Delivers push notification using standard Web-Push (VAPID).
 */
async function sendWebPushNotification(
  endpoint: string,
  keysP256dh: string,
  keysAuth: string,
  payload: PushPayload,
): Promise<boolean> {
  const configured = await ensureVapidConfigured();
  if (!configured) {
    return false;
  }

  try {
    const webpush = await import('web-push');
    await webpush.default.sendNotification(
      {
        endpoint,
        keys: {
          p256dh: keysP256dh,
          auth: keysAuth,
        },
      },
      JSON.stringify(payload),
    );
    return true;
  } catch (err: any) {
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      console.log('[push-web] Subscription expired, marking stale');
      return false; // Stale, will trigger db cleanup
    }
    console.error('[push-web] Web push delivery error:', err?.message ?? err);
    return false;
  }
}

/**
 * Delivers push notification directly to Apple APNs using native node:http2 client certificate auth.
 */
async function sendApnsPushNotification(
  deviceToken: string,
  payload: PushPayload,
): Promise<boolean> {
  const p12Path = path.join(process.cwd(), 'keys/apns-push.p12');
  if (!fs.existsSync(p12Path)) {
    console.warn('[push-apns] APNs certificate not found at keys/apns-push.p12 — logging mock push instead');
    console.log(`[push-apns] [MOCK SEND] Token: ${truncateToken(deviceToken)}, Title: ${payload.title}`);
    return true; // Graceful mock success for dev environments
  }

  const isProduction = process.env.NODE_ENV === 'production';
  // Use sandbox for local dev / TestFlight, production for App Store
  const apnsHost = isProduction ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
  const topic = 'app.tribes.TribesApp'; // iOS Bundle ID
  // APNS_PASSPHRASE env var: set to the .p12 export password (empty string if none)

  return new Promise<boolean>((resolve) => {
    let resolved = false;
    const safeResolve = (val: boolean) => {
      if (!resolved) { resolved = true; resolve(val); }
    };

    try {
      // Cache the .p12 buffer so we don't re-read from disk on every push
      if (!_apnsCertBuffer) {
        _apnsCertBuffer = fs.readFileSync(p12Path);
      }
      const client = http2.connect(apnsHost, {
        pfx: _apnsCertBuffer,
        passphrase: process.env.APNS_PASSPHRASE || '',
      });

      client.on('error', (err) => {
        console.error('[push-apns] APNs HTTP/2 connection error:', err);
        client.close();
        safeResolve(false);
      });

      const body = {
        aps: {
          alert: {
            title: payload.title,
            body: payload.body,
          },
          sound: 'default',
        },
        url: payload.url || '/your-comms',
      };

      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        'apns-topic': topic,
        'apns-push-type': 'alert',
        'content-type': 'application/json',
      });

      let responseStatus = 0;
      let responseData = '';

      req.on('response', (headers) => {
        responseStatus = parseInt(headers[':status'] as any, 10);
      });

      req.on('data', (chunk) => {
        responseData += chunk;
      });

      req.on('end', () => {
        client.close();
        if (responseStatus === 200) {
          console.log(`[push-apns] APNs push sent to ${truncateToken(deviceToken)}`);
          safeResolve(true);
        } else {
          console.error(`[push-apns] APNs delivery failed (${responseStatus}): ${responseData}`);
          // 410 (Unregistered) or 400 (BadDeviceToken) indicates stale token
          if (responseStatus === 410 || responseStatus === 404 || responseStatus === 400) {
            safeResolve(false); // Stale token, will trigger db cleanup
          } else {
            safeResolve(true); // Temporary failure, keep registration
          }
        }
      });

      req.on('error', (err) => {
        console.error('[push-apns] APNs HTTP/2 stream error:', err);
        client.close();
        safeResolve(false);
      });

      req.write(JSON.stringify(body));
      req.end();
    } catch (err) {
      console.error('[push-apns] APNs direct push execution error:', err);
      safeResolve(false);
    }
  });
}

/**
 * Delivers push notification directly to Google FCM REST v1 API.
 */
async function sendFcmPushNotification(
  deviceToken: string,
  payload: PushPayload,
): Promise<boolean> {
  const serviceAccountPath = path.join(process.cwd(), 'keys/fcm-service-account.json');
  if (!fs.existsSync(serviceAccountPath)) {
    console.warn('[push-fcm] FCM service account key not found at keys/fcm-service-account.json — logging mock push instead');
    console.log(`[push-fcm] [MOCK SEND] Token: ${truncateToken(deviceToken)}, Title: ${payload.title}`);
    return true; // Graceful mock success for dev environments
  }

  try {
    // Cache the JWT client so we don't re-parse the key file + re-init on every push.
    // google-auth-library handles token refresh internally.
    if (!_fcmJwtClient) {
      const { JWT } = await import('google-auth-library');
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      _fcmJwtClient = {
        jwt: new JWT({
          email: serviceAccount.client_email,
          key: serviceAccount.private_key,
          scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
        }),
        projectId: serviceAccount.project_id || 'tribes-app-422f1',
      };
    }

    const credentials = await _fcmJwtClient.jwt.authorize();
    const accessToken = credentials.access_token;

    if (!accessToken) {
      console.error('[push-fcm] Failed to generate FCM OAuth2 token');
      return false;
    }

    const projectId = _fcmJwtClient.projectId;
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    const body = {
      message: {
        token: deviceToken,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          url: payload.url || '/your-comms',
        },
        android: {
          notification: {
            click_action: 'OPEN_ACTIVITY',
            sound: 'default',
          },
        },
      },
    };

    const res = await fetch(fcmUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      console.log(`[push-fcm] FCM push sent to ${truncateToken(deviceToken)}`);
      return true;
    } else {
      const errorText = await res.text();
      console.error(`[push-fcm] FCM delivery failed with status ${res.status}: ${errorText}`);
      // Clean up stale subscription on 404 (UNREGISTERED) or 410
      if (res.status === 404 || res.status === 410) {
        return false; // Stale token, will trigger db Pruning
      }
      return true; // Temporary error, keep registration
    }
  } catch (err) {
    console.error('[push-fcm] FCM direct push execution error:', err);
    return false;
  }
}

// ============================================================
// PUSH DELIVERY BROADCASTER
// ============================================================

/**
 * Sends a push notification to all active devices (web, iOS, Android) for a user.
 * Checks notification preferences before sending.
 * Cleans up stale/expired subscriptions automatically.
 *
 * @returns true if at least one notification was successfully dispatched, false otherwise
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
    // If preference system fails/isn't set, default to allowing
  }

  // Retrieve all active device subscriptions for the target user
  const subs = await getPushSubscriptions(userId);
  if (subs.length === 0) {
    return false;
  }

  let overallSuccess = false;

  for (const sub of subs) {
    const platform = sub.platform ?? 'web';
    let success = false;

    try {
      if (platform === 'ios') {
        success = await sendApnsPushNotification(sub.endpoint, payload);
      } else if (platform === 'android') {
        success = await sendFcmPushNotification(sub.endpoint, payload);
      } else {
        // Web push
        if (sub.keysP256dh && sub.keysAuth) {
          success = await sendWebPushNotification(sub.endpoint, sub.keysP256dh, sub.keysAuth, payload);
        } else {
          console.warn(`[push] Stale web subscription missing keys for user ${userId}`);
          success = false;
        }
      }

      if (success) {
        overallSuccess = true;
      } else {
        // Prune the expired/stale subscription endpoint from the database
        console.log(`[push] Pruning stale subscription (${platform}) for user ${userId}`);
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      }
    } catch (err) {
      console.error(`[push] Failed to send push on platform ${platform} for user ${userId}:`, err);
    }
  }

  return overallSuccess;
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

