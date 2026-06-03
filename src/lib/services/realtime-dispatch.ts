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
 *
 * Throttled: only sends one push notification per bond per 5-minute window.
 * This prevents notification spam during active conversations — the user
 * already has real-time delivery via WebSocket when the tab is open.
 */

// In-memory throttle map: key = `${userId}:${bondId}`, value = last push timestamp
const bondMessageThrottle = new Map<string, number>();
const BOND_MESSAGE_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

export async function notifyBondMessage(
  targetUserId: string,
  senderName: string,
  bondId: string,
): Promise<void> {
  // Throttle: skip if a notification was recently sent for this bond
  const throttleKey = `${targetUserId}:${bondId}`;
  const lastSent = bondMessageThrottle.get(throttleKey);
  if (lastSent && Date.now() - lastSent < BOND_MESSAGE_THROTTLE_MS) {
    return; // Silently skip — recent notification already sent
  }

  // Check if user wants bond message notifications
  try {
    const { getPreferences } = await import('./notification-service');
    const prefs = await getPreferences(targetUserId);
    if (!prefs.bondMessagesEnabled) return;
  } catch {
    // Preferences not loadable — send anyway
  }

  // Record the throttle timestamp BEFORE sending to prevent race conditions
  bondMessageThrottle.set(throttleKey, Date.now());

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
  // Resolve the deep-link URL.
  // For posts, sourceId IS the postId. For comments, we need to look up the parent post.
  let url = '/your-comms';
  if (sourceType === 'post') {
    url = `/post/${sourceId}`;
  } else if (sourceType === 'comment') {
    try {
      const { db } = await import('@/db');
      const { comments } = await import('@/db/schema');
      const { eq } = await import('drizzle-orm');
      const [comment] = await db.select({ postId: comments.postId })
        .from(comments).where(eq(comments.id, sourceId)).limit(1);
      if (comment) url = `/post/${comment.postId}?commentId=${sourceId}`;
    } catch (err) {
      console.warn('[realtime-dispatch] Failed to resolve comment deep link for mention', { sourceType, sourceId }, err);
      // Fallback to /your-comms if lookup fails
    }
  } else if (sourceType === 'story_comment') {
    try {
      const { db } = await import('@/db');
      const { storyComments } = await import('@/db/schema');
      const { eq } = await import('drizzle-orm');
      const [comment] = await db.select({ storyId: storyComments.storyId })
        .from(storyComments).where(eq(storyComments.id, sourceId)).limit(1);
      if (comment) url = `/our-story/${comment.storyId}?commentId=${sourceId}`;
    } catch (err) {
      console.warn('[realtime-dispatch] Failed to resolve comment deep link for mention', { sourceType, sourceId }, err);
      // Fallback to /your-comms if lookup fails
    }
  }

  await notifyUser(targetUserId, {
    title: 'You were mentioned',
    body: `${mentionerName} mentioned you in a ${sourceType.replace('_', ' ')}`,
    url,
    tag: `mention-${sourceId}`,
  });
}

/**
 * Notify all tribe members about a new post (excluding the author).
 * Sends push notifications + optional email to members with tribeActivity enabled.
 * For encrypted (private) tribes, uses a generic body to avoid leaking ciphertext.
 */
export async function notifyTribePost(
  tribeId: string,
  authorId: string,
  authorName: string,
  tribeName: string,
  postId: string,
  isEncrypted: boolean = false,
): Promise<void> {
  try {
    const { db } = await import('@/db');
    const { tribeMembers, users, notificationPreferences, posts, tribes } = await import('@/db/schema');
    const { eq, and } = await import('drizzle-orm');
    const { getPreferences } = await import('./notification-service');
    const { sendPushToMultiple } = await import('./push-service');
    const { buildPostPath } = await import('@/lib/utils/slugify');

    // Fetch post slug and tribe slug for canonical URL
    const [postRow] = await db.select({ slug: posts.slug }).from(posts).where(eq(posts.id, postId)).limit(1);
    const [tribeRow] = await db.select({ slug: tribes.slug }).from(tribes).where(eq(tribes.id, tribeId)).limit(1);
    const postUrl = buildPostPath(postId, postRow?.slug, tribeRow?.slug);

    // Get all tribe members except the author
    const members = await db.select({ userId: tribeMembers.userId })
      .from(tribeMembers)
      .where(eq(tribeMembers.tribeId, tribeId));

    const recipientIds = members
      .map(m => m.userId)
      .filter(id => id !== authorId);

    if (recipientIds.length === 0) return;

    // Filter by tribeActivityEnabled preference
    const pushEligible: string[] = [];
    const emailEligible: Array<{ userId: string; email: string; name: string }> = [];

    const { inArray } = await import('drizzle-orm');

    try {
      // Batch fetch preferences
      const prefsRows = await db.select()
        .from(notificationPreferences)
        .where(inArray(notificationPreferences.userId, recipientIds));
      
      const prefsMap = new Map(prefsRows.map(r => [r.userId, r]));

      // Batch fetch user names & emails
      const userRows = await db.select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, recipientIds));
        
      const userMap = new Map(userRows.map(u => [u.id, u]));

      for (const userId of recipientIds) {
        const row = prefsMap.get(userId);
        
        const tribeActivityEnabled = row?.tribeActivityEnabled ?? true;
        if (!tribeActivityEnabled) continue;

        const pushEnabled = row?.pushEnabled ?? true;
        if (pushEnabled) {
          pushEligible.push(userId);
        }

        const emailEnabled = row?.emailEnabled ?? true;
        if (emailEnabled) {
          const user = userMap.get(userId);
          if (user?.email) {
            emailEligible.push({ userId, email: user.email, name: user.name ?? 'there' });
          }
        }
      }
    } catch {
      // If batch fetching fails, fallback to pushing everything to ensure delivery
      pushEligible.push(...recipientIds);
    }

    // Push notifications — never include encrypted content
    const pushBody = isEncrypted
      ? `New post in ${tribeName}`
      : `${authorName} posted in ${tribeName}`;

    if (pushEligible.length > 0) {
      sendPushToMultiple(pushEligible, {
        title: tribeName,
        body: pushBody,
        url: postUrl,
        tag: `tribe-post-${postId}`,
      }).catch(() => {});
    }

    // Email notifications — fire-and-forget, never include encrypted content
    if (emailEligible.length > 0) {
      import('./email-service').then(async ({ sendEmail }) => {
        const { tribePostEmail } = await import('./email-templates');
        const { generateUnsubscribeUrl } = await import('./email-unsubscribe-service');

        for (const recipient of emailEligible) {
          try {
            const unsubUrl = generateUnsubscribeUrl(recipient.userId, 'tribeActivity');
            const email = tribePostEmail(recipient.name, authorName, tribeName, unsubUrl, tribeId, postId, postRow?.slug, tribeRow?.slug);
            await sendEmail({ to: recipient.email, ...email }, recipient.userId);
          } catch {
            // Individual email failures don't affect others
          }
        }
      }).catch(() => {});
    }

    // Realtime WS push to all members
    const allTribeUsers = [...recipientIds, authorId];
    for (const memberId of allTribeUsers) {
      pushToUserSocket(memberId, { type: 'feed-update' }).catch(() => {});
    }
  } catch (err) {
    console.warn('[realtime-dispatch] notifyTribePost failed:', err);
  }
}

/**
 * Notify the post author when someone comments on their post.
 * Skips self-comments and respects tribeActivityEnabled preference.
 */
export async function notifyComment(
  postAuthorId: string,
  commenterId: string,
  commenterName: string,
  postId: string,
  tribeId: string | null,
  commentId?: string,
): Promise<void> {
  // Push real-time WS events
  if (tribeId) {
    import('@/db').then(async ({ db }) => {
      const { tribeMembers } = await import('@/db/schema');
      const { eq } = await import('drizzle-orm');
      const members = await db.select({ userId: tribeMembers.userId })
        .from(tribeMembers).where(eq(tribeMembers.tribeId, tribeId));
      for (const m of members) {
        pushToUserSocket(m.userId, { type: 'feed-update' }).catch(() => {});
      }
    }).catch(() => {});
  } else {
    pushToUserSocket(postAuthorId, { type: 'feed-update' }).catch(() => {});
    pushToUserSocket(commenterId, { type: 'feed-update' }).catch(() => {});
  }
  pushToUserSocket(postAuthorId, { type: 'activity' }).catch(() => {});

  // Don't notify yourself
  if (commenterId === postAuthorId) return;

  try {
    const { getPreferences } = await import('./notification-service');
    const prefs = await getPreferences(postAuthorId);
    if (!prefs.tribeActivityEnabled) return;
  } catch {
    // Prefs not loadable — send anyway
  }

  const url = commentId ? `/post/${postId}?commentId=${commentId}` : `/post/${postId}`;

  await notifyUser(postAuthorId, {
    title: 'New Comment',
    body: `${commenterName} commented on your post`,
    url,
    tag: `comment-${postId}`,
  });
}

/**
 * Notify a parent comment author when someone replies to their comment.
 * Skips self-replies and respects tribeActivityEnabled preference.
 */
export async function notifyCommentReply(
  parentCommentAuthorId: string,
  replierId: string,
  replierName: string,
  postId: string,
  tribeId: string | null,
  commentId?: string,
): Promise<void> {
  // Push real-time WS events
  if (tribeId) {
    import('@/db').then(async ({ db }) => {
      const { tribeMembers } = await import('@/db/schema');
      const { eq } = await import('drizzle-orm');
      const members = await db.select({ userId: tribeMembers.userId })
        .from(tribeMembers).where(eq(tribeMembers.tribeId, tribeId));
      for (const m of members) {
        pushToUserSocket(m.userId, { type: 'feed-update' }).catch(() => {});
      }
    }).catch(() => {});
  } else {
    pushToUserSocket(parentCommentAuthorId, { type: 'feed-update' }).catch(() => {});
    pushToUserSocket(replierId, { type: 'feed-update' }).catch(() => {});
  }
  pushToUserSocket(parentCommentAuthorId, { type: 'activity' }).catch(() => {});

  // Don't notify yourself
  if (replierId === parentCommentAuthorId) return;

  try {
    const { getPreferences } = await import('./notification-service');
    const prefs = await getPreferences(parentCommentAuthorId);
    if (!prefs.tribeActivityEnabled) return;
  } catch {
    // Prefs not loadable — send anyway
  }

  const url = commentId ? `/post/${postId}?commentId=${commentId}` : `/post/${postId}`;

  await notifyUser(parentCommentAuthorId, {
    title: 'New Reply',
    body: `${replierName} replied to your comment`,
    url,
    tag: `reply-${postId}`,
  });
}

/**
 * Notify tribe admins/founders when someone requests to join their tribe.
 * Checks each admin's tribeActivityEnabled preference.
 */
export async function notifyTribeJoinRequest(
  tribeId: string,
  applicantName: string,
  tribeName: string,
): Promise<void> {
  try {
    const { db } = await import('@/db');
    const { tribeMembers } = await import('@/db/schema');
    const { eq, and, inArray } = await import('drizzle-orm');
    const { getPreferences } = await import('./notification-service');
    const { sendPushToMultiple } = await import('./push-service');

    // Get admins and founders
    const adminMembers = await db.select({ userId: tribeMembers.userId })
      .from(tribeMembers)
      .where(and(
        eq(tribeMembers.tribeId, tribeId),
        inArray(tribeMembers.role, ['admin', 'founder']),
      ));

    const pushEligible: string[] = [];
    for (const admin of adminMembers) {
      try {
        const prefs = await getPreferences(admin.userId);
        if (prefs.tribeActivityEnabled && prefs.pushEnabled) {
          pushEligible.push(admin.userId);
        }
      } catch {
        pushEligible.push(admin.userId);
      }
    }

    if (pushEligible.length > 0) {
      sendPushToMultiple(pushEligible, {
        title: 'New Join Request',
        body: `${applicantName} wants to join ${tribeName}`,
        url: `/tribes/${tribeId}/manage-members`,
        tag: `join-request-${tribeId}`,
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('[realtime-dispatch] notifyTribeJoinRequest failed:', err);
  }
}

/**
 * Notify a post/comment author when someone vibes (reacts) on their content.
 * Skips self-vibes and respects tribeActivityEnabled preference.
 */
export async function notifyVibe(
  targetAuthorId: string,
  viberId: string,
  viberName: string,
  emoji: string,
  targetType: 'post' | 'comment',
  tribeId: string | null,
  postId?: string,
): Promise<void> {
  // Don't notify yourself
  if (viberId === targetAuthorId) return;

  try {
    const { getPreferences } = await import('./notification-service');
    const prefs = await getPreferences(targetAuthorId);
    if (!prefs.tribeActivityEnabled) return;
  } catch {
    // Prefs not loadable — send anyway
  }

  const url = postId
    ? `/post/${postId}`
    : tribeId
      ? `/tribes/${tribeId}`
      : '/your-comms';

  await notifyUser(targetAuthorId, {
    title: 'New Reaction',
    body: `${viberName} reacted ${emoji} to your ${targetType}`,
    url,
    tag: `vibe-${targetAuthorId}-${targetType}`,
  });
}

// ============================================================
// GOVERNANCE NOTIFICATIONS
// ============================================================

/**
 * Notify eligible voters about a new proposal.
 * For platform-wide proposals: all paid co-op members.
 * For tribe-scoped proposals: all tribe members.
 * Respects governanceEnabled preference.
 */
export async function notifyNewProposal(
  proposalId: string,
  creatorId: string,
  creatorName: string,
  proposalTitle: string,
  tribeId: string | null,
): Promise<void> {
  try {
    const { db } = await import('@/db');
    const { subscriptions, tribeMembers, notificationPreferences } = await import('@/db/schema');
    const { eq, and, ne, inArray } = await import('drizzle-orm');
    const { sendPushToMultiple } = await import('./push-service');

    let recipientIds: string[];

    if (tribeId) {
      // Tribe-scoped: notify all tribe members except creator
      const members = await db.select({ userId: tribeMembers.userId })
        .from(tribeMembers)
        .where(eq(tribeMembers.tribeId, tribeId));
      recipientIds = members.map(m => m.userId).filter(id => id !== creatorId);
    } else {
      // Platform-wide: notify all paid co-op members (who can vote)
      const paidSubs = await db.select({ userId: subscriptions.userId })
        .from(subscriptions)
        .where(and(
          eq(subscriptions.status, 'active'),
          ne(subscriptions.source, 'earned'),
        ));
      recipientIds = [...new Set(paidSubs.map(s => s.userId))].filter(id => id !== creatorId);
    }

    if (recipientIds.length === 0) return;

    // Filter by governanceEnabled preference
    const pushEligible: string[] = [];
    try {
      const prefsRows = await db.select()
        .from(notificationPreferences)
        .where(inArray(notificationPreferences.userId, recipientIds));
      const prefsMap = new Map(prefsRows.map(r => [r.userId, r]));

      for (const userId of recipientIds) {
        const row = prefsMap.get(userId);
        const govEnabled = row?.governanceEnabled ?? true;
        const pushEnabled = row?.pushEnabled ?? true;
        if (govEnabled && pushEnabled) {
          pushEligible.push(userId);
        }
      }
    } catch {
      // Fallback: send to all
      pushEligible.push(...recipientIds);
    }

    if (pushEligible.length > 0) {
      sendPushToMultiple(pushEligible, {
        title: '🏛️ New Proposal',
        body: `${creatorName} submitted: "${proposalTitle}"`,
        url: `/voting/${proposalId}`,
        tag: `governance-proposal-${proposalId}`,
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('[realtime-dispatch] notifyNewProposal failed:', err);
  }
}

/**
 * Notify the proposal creator when their proposal is closed (results available).
 * Respects governanceEnabled preference.
 */
export async function notifyProposalClosed(
  proposalId: string,
  proposalTitle: string,
  creatorId: string,
): Promise<void> {
  try {
    const { getPreferences } = await import('./notification-service');
    const prefs = await getPreferences(creatorId);
    if (!prefs.governanceEnabled) return;
  } catch {
    // Prefs not loadable — send anyway
  }

  await notifyUser(creatorId, {
    title: '🏛️ Proposal Closed',
    body: `Voting has ended on "${proposalTitle}" — view results`,
    url: `/voting/${proposalId}`,
    tag: `governance-closed-${proposalId}`,
  });
}

/**
 * Notify a proposal author when someone comments on their proposal.
 * Skips self-comments. Respects governanceEnabled preference.
 */
export async function notifyProposalComment(
  proposalAuthorId: string,
  commenterId: string,
  commenterName: string,
  proposalId: string,
  proposalTitle: string,
): Promise<void> {
  // Don't notify yourself
  if (commenterId === proposalAuthorId) return;

  try {
    const { getPreferences } = await import('./notification-service');
    const prefs = await getPreferences(proposalAuthorId);
    if (!prefs.governanceEnabled) return;
  } catch {
    // Prefs not loadable — send anyway
  }

  await notifyUser(proposalAuthorId, {
    title: '🏛️ New Comment on Proposal',
    body: `${commenterName} commented on "${proposalTitle}"`,
    url: `/voting/${proposalId}`,
    tag: `governance-comment-${proposalId}`,
  });
}

/**
 * Pushes a real-time message to the user's active WebSockets via ws-relay internal HTTP API.
 */
export async function pushToUserSocket(
  userId: string,
  payload: { type: 'feed-update' | 'activity'; [key: string]: any }
): Promise<void> {
  const internalSecret = process.env.INTERNAL_API_SECRET || 'tribes-internal-super-secret-123';
  const url = process.env.WS_RELAY_INTERNAL_URL || 'http://localhost:9004';

  try {
    const res = await fetch(`${url}/internal/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': internalSecret,
      },
      body: JSON.stringify({ userId, payload }),
    });

    if (!res.ok) {
      console.warn(`[realtime-dispatch] Failed to push to socket for user ${userId}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`[realtime-dispatch] Error pushing to socket for user ${userId}:`, err);
  }
}
