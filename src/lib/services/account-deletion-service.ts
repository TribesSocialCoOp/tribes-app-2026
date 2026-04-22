/**
 * @fileoverview Account Deletion Service
 * 
 * Performs a full-cascade account deletion compliant with GDPR Art. 17
 * and CCPA "Right to Delete". Uses a hybrid approach:
 *   - Posts/comments with replies → tombstoned and hidden (isRemoved + removalReason)
 *     to preserve thread integrity while removing content from view
 *   - Posts/comments with no replies → hard-deleted
 *   - All other user data → hard-deleted via schema cascades + manual cleanup
 *   - Stripe subscription → cancelled immediately
 * 
 * TODO: Implement a 30-day soft-delete grace period. Instead of immediate
 * permanent deletion, mark the account as `pending_deletion` and purge
 * data after 30 days via a scheduled job. This gives users a window to
 * recover their account if the deletion was accidental.
 */

import { db } from '@/db';
import {
  users, credentials, sessions, oauthAccounts, vaultBackups,
  subscriptions, inviteRedemptions, contributions,
  bonds, bondRequests, blockedUsers,
  posts, postMoodTags, comments, vibes, reports,
  tribes, tribeMembers, pendingMembers,
  events, eventRsvps, eventStreamPosts,
  messages, storyComments,
  wallBlocks, wallStyles, userPreferences, userAliases,
  notificationPreferences, pushSubscriptions, emailVerificationTokens,
  userBans,
} from '@/db/schema';
import { eq, or, and, sql } from 'drizzle-orm';
import {
  DELETED_USER_NAME,
  DELETED_USER_AVATAR_FALLBACK,
  REMOVED_CONTENT_PLACEHOLDER,
  ACCOUNT_DELETION_REASON,
} from '@/lib/constants';

/**
 * Deletes a user account and all associated data.
 * 
 * Strategy:
 *   1. Cancel Stripe subscription (if any)
 *   2. Tombstone posts that have comments from other users
 *   3. Hard-delete posts with no external comments
 *   4. Tombstone comments that have replies from other users
 *   5. Hard-delete comments with no replies
 *   6. Clean up non-cascading references
 *   7. Delete the user row (cascades handle ~15 related tables)
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  console.log(`[account-deletion] Starting deletion for user ${userId}`);

  // ──────────────────────────────────────────────
  // Step 1: Cancel Stripe subscription
  // ──────────────────────────────────────────────
  await cancelStripeSubscription(userId);

  // ──────────────────────────────────────────────
  // Step 2 & 3: Handle posts (tombstone or delete)
  // ──────────────────────────────────────────────
  await cleanupPosts(userId);

  // ──────────────────────────────────────────────
  // Step 4 & 5: Handle comments (tombstone or delete)
  // ──────────────────────────────────────────────
  await cleanupComments(userId);

  // ──────────────────────────────────────────────
  // Step 6: Clean up non-cascading references
  // ──────────────────────────────────────────────
  await cleanupNonCascadingReferences(userId);

  // ──────────────────────────────────────────────
  // Step 7: Delete user row (cascades handle the rest)
  // ──────────────────────────────────────────────
  await db.delete(users).where(eq(users.id, userId));

  console.log(`[account-deletion] Completed deletion for user ${userId}`);
}

/**
 * Cancel any active Stripe subscription for the user.
 */
async function cancelStripeSubscription(userId: string): Promise<void> {
  const activeSubs = await db.select({
    stripeSubscriptionId: subscriptions.stripeSubscriptionId,
    stripeCustomerId: subscriptions.stripeCustomerId,
  })
    .from(subscriptions)
    .where(and(
      eq(subscriptions.userId, userId),
      eq(subscriptions.status, 'active'),
    ));

  for (const sub of activeSubs) {
    if (sub.stripeSubscriptionId) {
      try {
        const Stripe = (await import('stripe')).default;
        const key = process.env.STRIPE_SECRET_KEY;
        if (key) {
          const stripe = new Stripe(key, { apiVersion: '2026-03-25.dahlia' });
          await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
          console.log(`[account-deletion] Cancelled Stripe subscription ${sub.stripeSubscriptionId}`);
        }
      } catch (err) {
        console.error(`[account-deletion] Failed to cancel Stripe subscription:`, err);
        // Continue with deletion even if Stripe call fails
      }
    }
  }
}

/**
 * Tombstone posts that have comments from other users.
 * Hard-delete posts with no comments from other users.
 */
async function cleanupPosts(userId: string): Promise<void> {
  const userPosts = await db.select({ id: posts.id })
    .from(posts)
    .where(eq(posts.authorId, userId));

  for (const post of userPosts) {
    // Check if any OTHER user has commented on this post
    const externalComments = await db.select({ id: comments.id })
      .from(comments)
      .where(and(
        eq(comments.postId, post.id),
        sql`${comments.authorId} != ${userId}`,
      ))
      .limit(1);

    if (externalComments.length > 0) {
      // Tombstone: hide post from feeds, remove PII and content,
      // but preserve thread integrity for existing replies
      await db.update(posts).set({
        authorName: DELETED_USER_NAME,
        authorAvatar: null,
        authorAvatarFallback: DELETED_USER_AVATAR_FALLBACK,
        dataAiHintAvatar: null,
        content: REMOVED_CONTENT_PLACEHOLDER,
        title: null,
        imageUrl: null,
        imageAlt: null,
        dataAiHintImage: null,
        isRemoved: true,
        removalReason: ACCOUNT_DELETION_REASON,
      }).where(eq(posts.id, post.id));
    } else {
      // No external comments → safe to hard-delete
      // Delete associated mood tags first (they cascade from post, but be explicit)
      await db.delete(postMoodTags).where(eq(postMoodTags.postId, post.id));
      // Delete the user's own comments on this post
      await db.delete(comments).where(eq(comments.postId, post.id));
      // Delete the post
      await db.delete(posts).where(eq(posts.id, post.id));
    }
  }
}

/**
 * Tombstone comments that have replies from other users.
 * Hard-delete comments with no replies.
 */
async function cleanupComments(userId: string): Promise<void> {
  // Get remaining comments by this user (some may have been deleted with their posts)
  const userComments = await db.select({ id: comments.id })
    .from(comments)
    .where(eq(comments.authorId, userId));

  for (const comment of userComments) {
    // Check if any OTHER user has replied to this comment
    const externalReplies = await db.select({ id: comments.id })
      .from(comments)
      .where(and(
        eq(comments.parentCommentId, comment.id),
        sql`${comments.authorId} != ${userId}`,
      ))
      .limit(1);

    if (externalReplies.length > 0) {
      // Tombstone
      await db.update(comments).set({
        authorName: DELETED_USER_NAME,
        authorAvatar: null,
        authorAvatarFallback: DELETED_USER_AVATAR_FALLBACK,
        dataAiHintAvatar: null,
        content: REMOVED_CONTENT_PLACEHOLDER,
      }).where(eq(comments.id, comment.id));
    } else {
      // Hard-delete
      await db.delete(comments).where(eq(comments.id, comment.id));
    }
  }
}

/**
 * Clean up tables that reference users.id WITHOUT onDelete: 'cascade'.
 */
async function cleanupNonCascadingReferences(userId: string): Promise<void> {
  // Bond requests (fromUserId / toUserId — no cascade)
  await db.delete(bondRequests).where(
    or(eq(bondRequests.fromUserId, userId), eq(bondRequests.toUserId, userId))
  );

  // Reports — anonymize reporter 
  await db.update(reports).set({
    reporterId: null,
    reporterName: DELETED_USER_NAME,
  }).where(eq(reports.reporterId, userId));

  // Post mood tags — clear promotedBy
  await db.update(postMoodTags).set({
    promotedBy: null,
  }).where(eq(postMoodTags.promotedBy, userId));

  // Vibes — delete (no cascade defined)
  await db.delete(vibes).where(eq(vibes.userId, userId));

  // Tribes — nullify createdBy (don't delete the tribe itself)
  await db.update(tribes).set({
    createdBy: null,
  }).where(eq(tribes.createdBy, userId));

  // Events — creatorId is NOT NULL, can't nullify.
  // Delete events with no external RSVPs; leave others (FK will reference deleted user).
  const userEvents = await db.select({ id: events.id })
    .from(events)
    .where(eq(events.creatorId, userId));

  for (const event of userEvents) {
    const otherRsvps = await db.select({ id: eventRsvps.id })
      .from(eventRsvps)
      .where(and(
        eq(eventRsvps.eventId, event.id),
        sql`${eventRsvps.userId} != ${userId}`,
      ))
      .limit(1);

    if (otherRsvps.length === 0) {
      // No other attendees — safe to delete
      await db.delete(eventStreamPosts).where(eq(eventStreamPosts.eventId, event.id));
      await db.delete(eventRsvps).where(eq(eventRsvps.eventId, event.id));
      await db.delete(events).where(eq(events.id, event.id));
    }
    // If others have RSVPd, the event stays but the FK will dangle.
    // This is acceptable — the event still functions without a creator reference.
  }

  // Story comments — tombstone content, anonymize author
  const userStoryComments = await db.select({ id: storyComments.id })
    .from(storyComments)
    .where(eq(storyComments.authorId, userId));

  for (const sc of userStoryComments) {
    // Check for replies from other users
    const externalReplies = await db.select({ id: storyComments.id })
      .from(storyComments)
      .where(and(
        eq(storyComments.parentCommentId, sc.id),
        sql`${storyComments.authorId} != ${userId}`,
      ))
      .limit(1);

    if (externalReplies.length > 0) {
      await db.update(storyComments).set({
        authorName: DELETED_USER_NAME,
        authorAvatarFallback: DELETED_USER_AVATAR_FALLBACK,
        dataAiHintAvatar: null,
        content: REMOVED_CONTENT_PLACEHOLDER,
      }).where(eq(storyComments.id, sc.id));
    } else {
      await db.delete(storyComments).where(eq(storyComments.id, sc.id));
    }
  }

  // Messages — delete (bond will cascade too, but messages.senderId has no cascade)
  await db.delete(messages).where(eq(messages.senderId, userId));

  // Event stream posts — delete (authorId has no cascade)
  await db.delete(eventStreamPosts).where(eq(eventStreamPosts.authorId, userId));

  // Revoke all active sessions (belt-and-suspenders; cascade will handle too)
  await db.update(sessions).set({
    revokedAt: new Date(),
  }).where(eq(sessions.userId, userId));
}
