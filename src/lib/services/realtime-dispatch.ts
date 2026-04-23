/**
 * @fileoverview Realtime Dispatch Service
 * 
 * Central dispatcher for user notifications. Sends via WebSocket when the user
 * is connected, and always sends a push notification as fallback (the browser
 * service worker handles dedup when the tab is focused).
 */

import { sendPushNotification } from './push-service';

interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Notify a user with both push notification and (in the future) WS relay.
 * 
 * The WS relay handles real-time delivery when the user has an active tab.
 * Push notifications serve as the fallback for offline/background users.
 * The browser's service worker deduplicates if both arrive while the tab is focused.
 * 
 * @param userId - Target user ID
 * @param payload - Notification content
 */
export async function notifyUser(userId: string, payload: NotificationPayload): Promise<void> {
  // Always send push as fallback — browser handles dedup if tab is focused
  // Push will be silently skipped if user has push disabled
  await sendPushNotification(userId, {
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
  }).catch((err) => {
    console.warn(`[realtime-dispatch] Push failed for user ${userId}:`, err);
  });

  // Note: WS delivery happens automatically via the ws-relay server.
  // When a message is sent via `ws.sendEncryptedMessage()` or the bond service
  // writes a message, the ws-relay routes it to all active sockets for that user.
  // This service focuses on the push notification fallback layer.
}

/**
 * Notify a user about a new bond message.
 * Uses the realtime dispatch to ensure delivery via push if WS is not available.
 */
export async function notifyBondMessage(
  targetUserId: string,
  senderName: string,
  bondId: string,
): Promise<void> {
  // Check if user wants bond message notifications
  try {
    const { getPreferences } = await import('./notification-service');
    const prefs = await getPreferences(targetUserId);
    if (!prefs.bondMessagesEnabled) return;
  } catch {
    // Preferences not loadable — send anyway
  }

  await notifyUser(targetUserId, {
    title: 'New Message',
    body: `${senderName} sent you a message`,
    url: `/bonds/${bondId}`,
    tag: `bond-msg-${bondId}`,
  });
}

/**
 * Notify a user about a new mention in a post or comment.
 */
export async function notifyMention(
  targetUserId: string,
  mentionerName: string,
  sourceType: 'post' | 'comment' | 'story_comment',
  sourceId: string,
): Promise<void> {
  await notifyUser(targetUserId, {
    title: 'You were mentioned',
    body: `${mentionerName} mentioned you in a ${sourceType.replace('_', ' ')}`,
    url: '/your-comms',
    tag: `mention-${sourceId}`,
  });
}
