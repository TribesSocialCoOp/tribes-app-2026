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

/**
 * Delivery result for platform-specific push senders.
 * - 'delivered': Push was accepted by the gateway.
 * - 'stale': Token is permanently invalid (unregistered, expired). Safe to prune from DB.
 * - 'error': Transient failure (network, auth, config). Keep subscription — retry later.
 */
type DeliveryResult = 'delivered' | 'stale' | 'error';

/**
 * APNs-specific outcome. Carries the gateway's `reason` string so the broadcaster can
 * distinguish an environment mismatch (BadDeviceToken → retry the other gateway) from a
 * genuinely dead token (Unregistered → prune) or a config error (BadTopic, etc. → keep).
 */
interface ApnsOutcome {
  result: DeliveryResult;
  reason?: string;
}

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
    apnsSandbox?: boolean;
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
    // ⚠️ Per-device APNs gateway routing — DO NOT remove.
    // TestFlight/dev builds use the APNs sandbox; App Store builds use production.
    // Defaulting to true (sandbox) is safe — TestFlight failures are silent,
    // but sending sandbox tokens to production APNs returns BadDeviceToken (400).
    apnsSandbox: platform === 'ios' ? (subscription.apnsSandbox ?? true) : null,
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
): Promise<DeliveryResult> {
  const configured = await ensureVapidConfigured();
  if (!configured) {
    // VAPID not configured is a server-side config issue, not a stale token
    return 'error';
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
    return 'delivered';
  } catch (err: any) {
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      console.log('[push-web] Subscription expired, marking stale');
      return 'stale';
    }
    console.error('[push-web] Web push delivery error:', err?.message ?? err);
    // Any other error (5xx, network, etc.) is transient — keep subscription
    return 'error';
  }
}

/**
 * Delivers push notification directly to Apple APNs using native node:http2 client certificate auth.
 *
 * ⚠️ Routes to sandbox or production APNs based on the per-subscription apnsSandbox flag.
 * DO NOT replace this with NODE_ENV — TestFlight builds run NODE_ENV=production but use
 * the APNs sandbox gateway. Mixing this up causes silent push failures.
 */
async function sendApnsPushNotification(
  deviceToken: string,
  payload: PushPayload,
  useSandbox: boolean,
): Promise<ApnsOutcome> {
  const p12Path = path.join(process.cwd(), 'keys/apns-push.p12');
  if (!fs.existsSync(p12Path)) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[push-apns] ⚠️ APNs certificate MISSING in production at keys/apns-push.p12 — iOS push will NOT work! Re-upload the .p12 file to the server.');
      return { result: 'error' };
    }
    console.log(`[push-apns] [MOCK SEND] Token: ${truncateToken(deviceToken)}, Title: ${payload.title}`);
    return { result: 'delivered' }; // Graceful mock success for dev environments
  }

  // ⚠️ Route to correct APNs gateway based on per-device flag (NOT NODE_ENV).
  // TestFlight builds have NODE_ENV=production but use the sandbox gateway.
  const apnsHost = useSandbox
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com';
  const topic = 'app.tribes.TribesApp'; // iOS Bundle ID
  // APNS_PASSPHRASE env var: set to the .p12 export password (empty string if none)

  return new Promise<ApnsOutcome>((resolve) => {
    let resolved = false;
    const safeResolve = (val: ApnsOutcome) => {
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
        console.error(`[push-apns] APNs HTTP/2 connection error (${useSandbox ? 'sandbox' : 'production'}):`, err);
        client.close();
        safeResolve({ result: 'error' });
      });

      const body = {
        aps: {
          alert: {
            title: payload.title,
            body: payload.body,
          },
          sound: 'default',
        },
        url: payload.url || '/activity',
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
          console.log(`[push-apns] APNs push sent to ${truncateToken(deviceToken)} (${useSandbox ? 'sandbox' : 'production'})`);
          safeResolve({ result: 'delivered' });
        } else {
          // APNs error bodies are JSON: { "reason": "BadDeviceToken" | "Unregistered" | ... }
          let reason: string | undefined;
          try { reason = JSON.parse(responseData)?.reason; } catch { /* non-JSON body */ }
          console.error(`[push-apns] APNs delivery failed (${responseStatus}${reason ? ` ${reason}` : ''}) on ${useSandbox ? 'sandbox' : 'production'}: ${responseData}`);
          // Classify:
          //  - BadDeviceToken (usually a 400): token was minted for the OTHER APNs environment.
          //    Report 'stale' + reason so the broadcaster can retry the opposite gateway before pruning.
          //  - Unregistered (410) / 404: token is truly dead → prune.
          //  - Anything else (BadTopic, PayloadTooLarge, 5xx, …): config/transient → keep registration.
          if (reason === 'BadDeviceToken' || responseStatus === 410 || responseStatus === 404) {
            safeResolve({ result: 'stale', reason });
          } else {
            safeResolve({ result: 'error', reason });
          }
        }
      });

      req.on('error', (err) => {
        console.error('[push-apns] APNs HTTP/2 stream error:', err);
        client.close();
        safeResolve({ result: 'error' });
      });

      req.write(JSON.stringify(body));
      req.end();
    } catch (err) {
      console.error('[push-apns] APNs direct push execution error:', err);
      safeResolve({ result: 'error' });
    }
  });
}

/**
 * Delivers push notification directly to Google FCM REST v1 API.
 */
async function sendFcmPushNotification(
  deviceToken: string,
  payload: PushPayload,
): Promise<DeliveryResult> {
  const serviceAccountPath = path.join(process.cwd(), 'keys/fcm-service-account.json');
  if (!fs.existsSync(serviceAccountPath)) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[push-fcm] ⚠️ FCM service account key MISSING in production at keys/fcm-service-account.json — Android push will NOT work! Re-upload the key file to the server.');
      return 'error';
    }
    console.log(`[push-fcm] [MOCK SEND] Token: ${truncateToken(deviceToken)}, Title: ${payload.title}`);
    return 'delivered'; // Graceful mock success for dev environments
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
      return 'error';
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
          url: payload.url || '/activity',
        },
        android: {
          priority: 'high',
          notification: {
            channel_id: 'PushDefaultChannel',
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
      return 'delivered';
    } else {
      const errorText = await res.text();
      console.error(`[push-fcm] FCM delivery failed with status ${res.status}: ${errorText}`);
      // Clean up stale subscription on 404 (UNREGISTERED) or 410
      if (res.status === 404 || res.status === 410) {
        return 'stale';
      }
      return 'error'; // Temporary error, keep registration
    }
  } catch (err) {
    console.error('[push-fcm] FCM direct push execution error:', err);
    return 'error';
  }
}

// ============================================================
// PUSH DELIVERY BROADCASTER
// ============================================================

/**
 * Sends a push notification to all active devices (web, iOS, Android) for a user.
 * Checks notification preferences before sending.
 * Only prunes subscriptions that are confirmed stale (permanent token failure).
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
      console.log(`[push] Push disabled by user preference for ${userId}`);
      return false;
    }
  } catch {
    // If preference system fails/isn't set, default to allowing
  }

  // Retrieve all active device subscriptions for the target user
  const subs = await getPushSubscriptions(userId);
  if (subs.length === 0) {
    console.log(`[push] No push subscriptions found for user ${userId} — has the user enabled push in Settings?`);
    return false;
  }
  console.log(`[push] Dispatching to ${subs.length} subscription(s) for user ${userId}: ${subs.map(s => s.platform).join(', ')}`);

  let overallSuccess = false;

  for (const sub of subs) {
    const platform = sub.platform ?? 'web';
    let result: DeliveryResult = 'error';

    try {
      if (platform === 'ios') {
        // First try the gateway hinted by the per-device flag (default sandbox).
        const useSandbox = sub.apnsSandbox ?? true;
        let apns = await sendApnsPushNotification(sub.endpoint, payload, useSandbox);

        // Self-correcting gateway routing: a BadDeviceToken means the token was minted for
        // the OTHER APNs environment (the client's sandbox/prod hint can be wrong — e.g. the
        // native WebView loads the production site so its NODE_ENV heuristic always says prod).
        // Retry the opposite gateway before pruning, and persist the corrected flag so future
        // sends go direct.
        if (apns.result === 'stale' && apns.reason === 'BadDeviceToken') {
          console.log(`[push-apns] BadDeviceToken on ${useSandbox ? 'sandbox' : 'production'} — retrying ${useSandbox ? 'production' : 'sandbox'} gateway for user ${userId}`);
          const retry = await sendApnsPushNotification(sub.endpoint, payload, !useSandbox);
          if (retry.result === 'delivered') {
            await db.update(pushSubscriptions)
              .set({ apnsSandbox: !useSandbox })
              .where(eq(pushSubscriptions.id, sub.id));
            console.log(`[push-apns] Corrected apnsSandbox=${!useSandbox} for user ${userId} — token recovered`);
          }
          // Only treat as truly stale (prune) when BOTH gateways reject the token.
          apns = retry;
        }
        result = apns.result;
      } else if (platform === 'android') {
        result = await sendFcmPushNotification(sub.endpoint, payload);
      } else {
        // Web push
        if (sub.keysP256dh && sub.keysAuth) {
          result = await sendWebPushNotification(sub.endpoint, sub.keysP256dh, sub.keysAuth, payload);
        } else {
          console.warn(`[push] Stale web subscription missing keys for user ${userId}`);
          result = 'stale';
        }
      }

      if (result === 'delivered') {
        overallSuccess = true;
      } else if (result === 'stale') {
        // Only prune on confirmed stale tokens — not transient errors
        console.log(`[push] Pruning stale subscription (${platform}) for user ${userId}`);
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      } else {
        // 'error' — transient failure, keep subscription for next attempt
        console.warn(`[push] Transient delivery failure (${platform}) for user ${userId} — keeping subscription`);
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
