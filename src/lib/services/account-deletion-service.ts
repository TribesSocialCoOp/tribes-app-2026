/**
 * @fileoverview Account Deletion Service
 * 
 * Implements a 30-day soft-delete grace period for GDPR Art. 17 / CCPA compliance.
 * 
 * Flow:
 *   1. User requests deletion → `deletionRequestedAt = now()`, all sessions revoked
 *   2. During grace period, account is functionally disabled (proxy redirects to recovery)
 *   3. User can log back in within 30 days → cancel deletion → `deletionRequestedAt = null`
 *   4. After 30 days, cron runs permanent cascade delete via `purgeExpiredAccounts()`
 * 
 * Permanent deletion uses a hybrid approach:
 *   - Posts/comments with replies → tombstoned (isRemoved + hidden)
 *   - Posts/comments with no replies → hard-deleted
 *   - All other user data → hard-deleted via schema cascades + manual cleanup
 *   - Stripe subscription → cancelled immediately on soft-delete
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
  userBans, mentions,
} from '@/db/schema';
import { eq, or, and, sql, lte } from 'drizzle-orm';
import {
  DELETED_USER_NAME,
  DELETED_USER_AVATAR_FALLBACK,
  REMOVED_CONTENT_PLACEHOLDER,
  ACCOUNT_DELETION_REASON,
} from '@/lib/constants';

/** Grace period in days before permanent deletion. */
const GRACE_PERIOD_DAYS = 30;

// ============================================================
// SOFT DELETE (Phase 1: User requests deletion)
// ============================================================

/**
 * Initiates account deletion with a 30-day grace period.
 * - Sets `deletionRequestedAt` timestamp
 * - Cancels Stripe subscription immediately
 * - Revokes all sessions (forces logout)
 * - Sends a confirmation email
 */
export async function requestAccountDeletion(userId: string): Promise<{ scheduledDate: Date }> {
  const now = new Date();
  const scheduledDate = new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  console.log(`[account-deletion] Soft-delete requested for user ${userId}, purge scheduled for ${scheduledDate.toISOString()}`);

  // Mark account for deletion
  await db.update(users).set({
    deletionRequestedAt: now,
  }).where(eq(users.id, userId));

  // Cancel Stripe subscription immediately (refund window starts now)
  await cancelStripeSubscription(userId);

  // Revoke all sessions (force logout everywhere)
  await db.update(sessions).set({
    revokedAt: now,
  }).where(eq(sessions.userId, userId));

  // Send confirmation email (fire-and-forget)
  try {
    const [user] = await db.select({ email: users.email, name: users.name })
      .from(users).where(eq(users.id, userId)).limit(1);
    if (user?.email) {
      const { sendEmail } = await import('./email-service');
      await sendEmail({
        to: user.email,
        subject: 'Your Tribes.app account is scheduled for deletion',
        html: `
          <h2>Account Deletion Scheduled</h2>
          <p>Hi ${user.name ?? 'there'},</p>
          <p>Your Tribes.app account has been scheduled for permanent deletion on <strong>${scheduledDate.toLocaleDateString()}</strong>.</p>
          <p>If this was a mistake, you can cancel the deletion by logging in before that date and clicking "Cancel Deletion" in your Settings.</p>
          <p>After ${GRACE_PERIOD_DAYS} days, all your data will be permanently removed and cannot be recovered.</p>
        `,
      });
    }
  } catch {
    // Email failure is non-critical
  }

  return { scheduledDate };
}

// ============================================================
// CANCEL DELETION (User changes their mind)
// ============================================================

/**
 * Cancels a pending account deletion.
 * Clears `deletionRequestedAt` to reactivate the account.
 */
export async function cancelAccountDeletion(userId: string): Promise<void> {
  console.log(`[account-deletion] Cancelling deletion for user ${userId}`);

  await db.update(users).set({
    deletionRequestedAt: null,
  }).where(eq(users.id, userId));
}

/**
 * Returns the deletion status for a user.
 */
export async function getDeletionStatus(userId: string): Promise<{
  isPending: boolean;
  requestedAt: Date | null;
  scheduledPurgeDate: Date | null;
  daysRemaining: number | null;
}> {
  const [user] = await db.select({ deletionRequestedAt: users.deletionRequestedAt })
    .from(users).where(eq(users.id, userId)).limit(1);

  if (!user?.deletionRequestedAt) {
    return { isPending: false, requestedAt: null, scheduledPurgeDate: null, daysRemaining: null };
  }

  const scheduledPurge = new Date(user.deletionRequestedAt.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const daysRemaining = Math.max(0, Math.ceil((scheduledPurge.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

  return {
    isPending: true,
    requestedAt: user.deletionRequestedAt,
    scheduledPurgeDate: scheduledPurge,
    daysRemaining,
  };
}

// ============================================================
// PERMANENT PURGE (Cron job after grace period)
// ============================================================

/**
 * Permanently deletes all accounts whose grace period has expired.
 * Should be called by a daily cron job.
 * Returns the number of accounts purged.
 */
export async function purgeExpiredAccounts(): Promise<number> {
  const cutoff = new Date(Date.now() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const expiredUsers = await db.select({ id: users.id })
    .from(users)
    .where(lte(users.deletionRequestedAt, cutoff));

  let purged = 0;
  for (const user of expiredUsers) {
    try {
      await permanentlyDeleteUser(user.id);
      purged++;
    } catch (err) {
      console.error(`[account-deletion] Failed to purge user ${user.id}:`, err);
    }
  }

  console.log(`[account-deletion] Purged ${purged} expired accounts`);
  return purged;
}

/**
 * Performs the actual permanent deletion of a user account.
 * This is the destructive operation — no recovery after this.
 */
async function permanentlyDeleteUser(userId: string): Promise<void> {
  console.log(`[account-deletion] Starting permanent deletion for user ${userId}`);

  await cleanupPosts(userId);
  await cleanupComments(userId);
  await cleanupNonCascadingReferences(userId);

  // Delete the user row (cascades handle ~15 related tables)
  await db.delete(users).where(eq(users.id, userId));

  console.log(`[account-deletion] Completed permanent deletion for user ${userId}`);
}

// ============================================================
// LEGACY: Immediate deletion (kept for admin use)
// ============================================================

/**
 * Immediately and permanently deletes a user account (no grace period).
 * Use only for admin-initiated deletions or testing.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  await cancelStripeSubscription(userId);
  await permanentlyDeleteUser(userId);
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

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
      await db.delete(postMoodTags).where(eq(postMoodTags.postId, post.id));
      await db.delete(comments).where(eq(comments.postId, post.id));
      await db.delete(posts).where(eq(posts.id, post.id));
    }
  }
}

/**
 * Tombstone comments that have replies from other users.
 * Hard-delete comments with no replies.
 */
async function cleanupComments(userId: string): Promise<void> {
  const userComments = await db.select({ id: comments.id })
    .from(comments)
    .where(eq(comments.authorId, userId));

  for (const comment of userComments) {
    const externalReplies = await db.select({ id: comments.id })
      .from(comments)
      .where(and(
        eq(comments.parentCommentId, comment.id),
        sql`${comments.authorId} != ${userId}`,
      ))
      .limit(1);

    if (externalReplies.length > 0) {
      await db.update(comments).set({
        authorName: DELETED_USER_NAME,
        authorAvatar: null,
        authorAvatarFallback: DELETED_USER_AVATAR_FALLBACK,
        dataAiHintAvatar: null,
        content: REMOVED_CONTENT_PLACEHOLDER,
      }).where(eq(comments.id, comment.id));
    } else {
      await db.delete(comments).where(eq(comments.id, comment.id));
    }
  }
}

/**
 * Clean up tables that reference users.id WITHOUT onDelete: 'cascade'.
 */
async function cleanupNonCascadingReferences(userId: string): Promise<void> {
  // Bond requests
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

  // Vibes
  await db.delete(vibes).where(eq(vibes.userId, userId));

  // Mentions — clean up both sides
  await db.delete(mentions).where(
    or(eq(mentions.mentionedUserId, userId), eq(mentions.mentionerUserId, userId))
  );

  // Tribes — nullify createdBy (don't delete the tribe itself)
  await db.update(tribes).set({
    createdBy: null,
  }).where(eq(tribes.createdBy, userId));

  // Events — creatorId is NOT NULL, can't nullify.
  // Delete events with no external RSVPs; leave others.
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
      await db.delete(eventStreamPosts).where(eq(eventStreamPosts.eventId, event.id));
      await db.delete(eventRsvps).where(eq(eventRsvps.eventId, event.id));
      await db.delete(events).where(eq(events.id, event.id));
    }
  }

  // Story comments — tombstone content, anonymize author
  const userStoryComments = await db.select({ id: storyComments.id })
    .from(storyComments)
    .where(eq(storyComments.authorId, userId));

  for (const sc of userStoryComments) {
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

  // Messages
  await db.delete(messages).where(eq(messages.senderId, userId));

  // Event stream posts
  await db.delete(eventStreamPosts).where(eq(eventStreamPosts.authorId, userId));

  // Revoke all active sessions
  await db.update(sessions).set({
    revokedAt: new Date(),
  }).where(eq(sessions.userId, userId));
}
