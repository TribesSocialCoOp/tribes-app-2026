/**
 * @fileoverview Notification / activity feed service.
 * Aggregates activity across existing tables — no new writes needed.
 * Respects user notification preferences.
 */

import { db } from '@/db';
import {
  notificationPreferences,
  bondRequests,
  messages,
  bonds,
  pendingMembers,
  tribeMembers,
  tribes,
  users,
  mentions,
  posts,
  comments,
  proposals,
} from '@/db/schema';
import { eq, and, or, isNull, ne, desc, sql, inArray, gte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { buildPostPath } from '@/lib/utils/slugify';

/**
 * Batch-fetches tribe slugs for a set of tribe IDs.
 * Returns a Map<tribeId, slug> (only includes tribes that have a slug).
 */
async function buildTribeSlugMap(tribeIds: string[]): Promise<Map<string, string>> {
  const slugMap = new Map<string, string>();
  if (tribeIds.length === 0) return slugMap;
  const uniqueIds = [...new Set(tribeIds)];
  const rows = await db.select({ id: tribes.id, slug: tribes.slug })
    .from(tribes)
    .where(inArray(tribes.id, uniqueIds));
  for (const row of rows) {
    if (row.slug) slugMap.set(row.id, row.slug);
  }
  return slugMap;
}

// ============================================================
// TYPES
// ============================================================

export interface ActivityItem {
  id: string;
  type: 'bond_request' | 'unread_message' | 'tribe_join_request' | 'mention' | 'new_tribe_post' | 'new_comment' | 'governance' | 'system';
  title: string;
  description: string;
  timestamp: Date;
  actionUrl?: string;
  read: boolean;
}

export interface NotificationPrefs {
  pushEnabled: boolean;
  emailEnabled: boolean;
  mentionsEnabled: boolean;
  bondMessagesEnabled: boolean;
  tribeActivityEnabled: boolean;
  eventRemindersEnabled: boolean;
  governanceEnabled: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  pushEnabled: true,
  emailEnabled: true,
  mentionsEnabled: true,
  bondMessagesEnabled: true,
  tribeActivityEnabled: true,
  eventRemindersEnabled: true,
  governanceEnabled: true,
};

// ============================================================
// PREFERENCES
// ============================================================

export async function getPreferences(userId: string): Promise<NotificationPrefs> {
  const [row] = await db.select().from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  if (!row) return DEFAULT_PREFS;

  return {
    pushEnabled: row.pushEnabled ?? true,
    emailEnabled: row.emailEnabled ?? true,
    mentionsEnabled: row.mentionsEnabled ?? true,
    bondMessagesEnabled: row.bondMessagesEnabled ?? true,
    tribeActivityEnabled: row.tribeActivityEnabled ?? true,
    eventRemindersEnabled: row.eventRemindersEnabled ?? true,
    governanceEnabled: row.governanceEnabled ?? true,
  };
}

export async function savePreferences(
  userId: string,
  prefs: Partial<NotificationPrefs>,
): Promise<void> {
  const existing = await db.select().from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db.update(notificationPreferences)
      .set({ ...prefs, updatedAt: new Date() })
      .where(eq(notificationPreferences.userId, userId));
  } else {
    await db.insert(notificationPreferences).values({
      userId,
      ...prefs,
      updatedAt: new Date(),
    });
  }
}

// ============================================================
// ACTIVITY FEED
// ============================================================

/**
 * Aggregates recent activity for a user from existing tables.
 * Returns newest items first, max 30 items.
 */
export async function getActivityFeed(userId: string): Promise<ActivityItem[]> {
  const prefs = await getPreferences(userId);
  const items: ActivityItem[] = [];

  // Get the last time the user viewed activity — items before this are "read"
  const [prefRow] = await db.select({
    lastViewed: notificationPreferences.lastActivityViewedAt,
    readIds: notificationPreferences.readActivityIds,
  })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  const lastViewed = prefRow?.lastViewed ?? null;
  const readIds = new Set<string>(prefRow?.readIds ?? []);

  // 1. Pending bond requests TO this user
  const pendingBondReqs = await db.select({
    id: bondRequests.id,
    fromUserId: bondRequests.fromUserId,
    bondType: bondRequests.bondType,
    createdAt: bondRequests.createdAt,
    message: bondRequests.message,
  }).from(bondRequests)
    .where(and(
      eq(bondRequests.toUserId, userId),
      eq(bondRequests.status, 'pending'),
      ne(bondRequests.fromUserId, bondRequests.toUserId)
    ))
    .orderBy(desc(bondRequests.createdAt))
    .limit(10);

  for (const req of pendingBondReqs) {
    // Look up sender name
    const [sender] = await db.select({ name: users.name })
      .from(users).where(eq(users.id, req.fromUserId)).limit(1);

    items.push({
      id: `activity-bond-${req.id}`,
      type: 'bond_request',
      title: 'New Bond Request',
      description: `${sender?.name ?? 'Someone'} wants to form a ${req.bondType} bond${req.message ? `: "${req.message}"` : ''}`,
      timestamp: req.createdAt ?? new Date(),
      actionUrl: '/bonds',
      read: false,
    });
  }

  // 2. Unread messages (if bond messages enabled)
  if (prefs.bondMessagesEnabled) {
    const userBonds = await db.select({
      id: bonds.id,
      targetId: bonds.targetId,
      targetName: bonds.targetName,
    })
      .from(bonds)
      .where(eq(bonds.userId, userId));

    for (const bond of userBonds) {
      // Messages may be stored under either bond ID (sender's or recipient's)
      // so we need to check both — same pattern as getMessages()
      const [peerBond] = await db.select({ id: bonds.id })
        .from(bonds)
        .where(and(eq(bonds.userId, bond.targetId), eq(bonds.targetId, userId)))
        .limit(1);

      const bondIdCondition = peerBond
        ? or(eq(messages.bondId, bond.id), eq(messages.bondId, peerBond.id))!
        : eq(messages.bondId, bond.id);

      const [unread] = await db.select({
        count: sql<number>`count(*)`,
      }).from(messages)
        .where(and(
          bondIdCondition,
          ne(messages.senderId, userId),
          isNull(messages.readAt),
        ));

      const count = unread?.count ?? 0;
      if (count > 0) {
        items.push({
          id: `activity-msg-${bond.id}`,
          type: 'unread_message',
          title: `${count} unread message${count > 1 ? 's' : ''}`,
          description: `from ${bond.targetName}`,
          timestamp: new Date(), // approximate
          actionUrl: `/bonds/${bond.id}`,
          read: false,
        });
      }
    }
  }

  // 3. Tribe join requests (if user is founder/admin/speaker of any tribe)
  if (prefs.tribeActivityEnabled) {
    const adminMemberships = await db.select({ tribeId: tribeMembers.tribeId })
      .from(tribeMembers)
      .where(and(
        eq(tribeMembers.userId, userId),
        inArray(tribeMembers.role, ['founder', 'admin', 'speaker']),
      ));

    for (const membership of adminMemberships) {
      const pending = await db.select({
        id: pendingMembers.id,
        usrId: pendingMembers.userId,
        requestedAt: pendingMembers.requestedAt,
      }).from(pendingMembers)
        .where(eq(pendingMembers.tribeId, membership.tribeId))
        .limit(5);

      const [tribe] = await db.select({ name: tribes.name })
        .from(tribes).where(eq(tribes.id, membership.tribeId)).limit(1);

      for (const p of pending) {
        const [applicant] = await db.select({ name: users.name })
          .from(users).where(eq(users.id, p.usrId)).limit(1);

        items.push({
          id: `activity-join-${p.id}`,
          type: 'tribe_join_request',
          title: 'Tribe Join Request',
          description: `${applicant?.name ?? 'Someone'} wants to join ${tribe?.name ?? 'your tribe'}`,
          timestamp: p.requestedAt ?? new Date(),
          actionUrl: `/tribes/${membership.tribeId}/manage-members`,
          read: false,
        });
      }
    }
  }

  // 4. Unread mentions (if mentions enabled)
  if (prefs.mentionsEnabled) {
    const mentionRows = await db.select({
      id: mentions.id,
      sourceType: mentions.sourceType,
      mentionerUserId: mentions.mentionerUserId,
      createdAt: mentions.createdAt,
      read: mentions.read,
    }).from(mentions)
      .where(and(
        eq(mentions.mentionedUserId, userId),
        eq(mentions.read, false),
      ))
      .orderBy(desc(mentions.createdAt))
      .limit(10);

    for (const m of mentionRows) {
      const [mentioner] = await db.select({ name: users.name })
        .from(users).where(eq(users.id, m.mentionerUserId)).limit(1);

      items.push({
        id: `activity-mention-${m.id}`,
        type: 'mention',
        title: 'You were mentioned',
        description: `${mentioner?.name ?? 'Someone'} mentioned you in a ${m.sourceType?.replace('_', ' ') ?? 'post'}`,
        timestamp: m.createdAt ?? new Date(),
        actionUrl: '/your-comms',
        read: false,
      });
    }
  }

  // 5. New tribe posts from the user's tribes (last 7 days, excluding own posts)
  if (prefs.tribeActivityEnabled) {
    const userMemberships = await db.select({ tribeId: tribeMembers.tribeId })
      .from(tribeMembers)
      .where(eq(tribeMembers.userId, userId));

    if (userMemberships.length > 0) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const tribeIds = userMemberships.map(m => m.tribeId);
      const recentPosts = await db.select({
        id: posts.id,
        authorId: posts.authorId,
        authorName: posts.authorName,
        tribeId: posts.tribeId,
        createdAt: posts.createdAt,
        title: posts.title,
        slug: posts.slug,
      }).from(posts)
        .where(and(
          inArray(posts.tribeId, tribeIds),
          gte(posts.createdAt, sevenDaysAgo),
        ))
        .orderBy(desc(posts.createdAt))
        .limit(15);

      // Look up tribe names and slugs for display/routing
      const tribeSlugMap = await buildTribeSlugMap(tribeIds);
      const tribeNameMap = new Map<string, string>();
      const tribeNameRows = await db.select({ id: tribes.id, name: tribes.name })
        .from(tribes)
        .where(inArray(tribes.id, tribeIds));
      for (const row of tribeNameRows) { tribeNameMap.set(row.id, row.name); }

      for (const post of recentPosts) {
        if (post.authorId === userId) continue; // Skip own posts
        items.push({
          id: `activity-tribepost-${post.id}`,
          type: 'new_tribe_post',
          title: tribeNameMap.get(post.tribeId!) ?? 'Your tribe',
          description: `${post.authorName ?? 'Someone'} posted${post.title ? `: ${post.title}` : ''}`,
          timestamp: post.createdAt ?? new Date(),
          actionUrl: buildPostPath(post.id, post.slug, tribeSlugMap.get(post.tribeId!)),
          read: false,
        });
      }
    }
  }

  // 6. Comments on user's posts (last 30 days)
  if (prefs.tribeActivityEnabled) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const userPosts = await db.select({ id: posts.id, tribeId: posts.tribeId, slug: posts.slug })
      .from(posts)
      .where(eq(posts.authorId, userId));

    if (userPosts.length > 0) {
      const postIds = userPosts.map(p => p.id);
      const postTribeMap = new Map(userPosts.map(p => [p.id, p.tribeId]));
      const postSlugMap = new Map(userPosts.map(p => [p.id, p.slug]));
      
      // Also fetch slugs for these tribes
      const tribeIds = [...new Set(userPosts.map(p => p.tribeId).filter(Boolean) as string[])];
      const tribeSlugMap = await buildTribeSlugMap(tribeIds);

      const recentComments = await db.select({
        id: comments.id,
        authorId: comments.authorId,
        authorName: comments.authorName,
        postId: comments.postId,
        createdAt: comments.createdAt,
      }).from(comments)
        .where(and(
          inArray(comments.postId, postIds),
          gte(comments.createdAt, thirtyDaysAgo),
        ))
        .orderBy(desc(comments.createdAt))
        .limit(10);

      for (const cmt of recentComments) {
        if (cmt.authorId === userId) continue; // Skip own comments
        const tribeId = postTribeMap.get(cmt.postId);
        items.push({
          id: `activity-comment-${cmt.id}`,
          type: 'new_comment',
          title: 'New Comment',
          description: `${cmt.authorName ?? 'Someone'} commented on your post`,
          timestamp: cmt.createdAt ?? new Date(),
          actionUrl: `${buildPostPath(cmt.postId, postSlugMap.get(cmt.postId), tribeId ? tribeSlugMap.get(tribeId) : undefined)}?commentId=${cmt.id}`,
          read: false,
        });
      }
    }
  }

  // 6b. Replies to user's comments on OTHER people's posts (last 30 days)
  // Section 6 covers comments on posts the user authored. This section covers
  // threaded replies to the user's comments on posts they do NOT own.
  // Uses a single joined query to avoid pulling all user comments into memory.
  if (prefs.tribeActivityEnabled) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Alias the comments table for the self-join: reply → parentComment → post
    const parentComments = alias(comments, 'parent_comments');

    const replyRows = await db.select({
      id: comments.id,
      authorId: comments.authorId,
      authorName: comments.authorName,
      postId: comments.postId,
      createdAt: comments.createdAt,
      postSlug: posts.slug,
      postTribeId: posts.tribeId,
    })
      .from(comments)
      .innerJoin(parentComments, eq(comments.parentCommentId, parentComments.id))
      .innerJoin(posts, eq(comments.postId, posts.id))
      .where(and(
        eq(parentComments.authorId, userId),    // parent comment is mine
        ne(comments.authorId, userId),          // reply is not mine
        ne(posts.authorId, userId),             // post is not mine (section 6 handles that)
        gte(comments.createdAt, thirtyDaysAgo),
      ))
      .orderBy(desc(comments.createdAt))
      .limit(15);

    if (replyRows.length > 0) {
      // Batch-fetch tribe slugs for deep links
      const replyTribeIds = [...new Set(replyRows.map(r => r.postTribeId).filter(Boolean) as string[])];
      const replyTribeSlugMap = await buildTribeSlugMap(replyTribeIds);

      for (const reply of replyRows) {
        const tribeSlug = reply.postTribeId ? replyTribeSlugMap.get(reply.postTribeId) : undefined;
        items.push({
          id: `activity-reply-${reply.id}`,
          type: 'new_comment',
          title: 'New Reply',
          description: `${reply.authorName ?? 'Someone'} replied to your comment`,
          timestamp: reply.createdAt ?? new Date(),
          actionUrl: `${buildPostPath(reply.postId, reply.postSlug, tribeSlug)}?commentId=${reply.id}`,
          read: false,
        });
      }
    }
  }

  // 7. Active governance proposals (last 14 days)
  if (prefs.governanceEnabled) {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const activeProposals = await db.select({
      id: proposals.id,
      title: proposals.title,
      createdBy: proposals.createdBy,
      createdAt: proposals.createdAt,
      status: proposals.status,
    }).from(proposals)
      .where(and(
        eq(proposals.status, 'active'),
        gte(proposals.createdAt, fourteenDaysAgo),
      ))
      .orderBy(desc(proposals.createdAt))
      .limit(5);

    for (const proposal of activeProposals) {
      if (proposal.createdBy === userId) continue; // Skip own proposals
      items.push({
        id: `activity-governance-${proposal.id}`,
        type: 'governance',
        title: '🏛️ Active Proposal',
        description: `"${proposal.title}" — vote now`,
        timestamp: proposal.createdAt ?? new Date(),
        actionUrl: `/voting/${proposal.id}`,
        read: false,
      });
    }
  }

  // Sort all items by timestamp desc
  items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Derive read state based on lastActivityViewedAt
  // Bond requests and join requests are always unread (require action), other types use timestamp
  const result = items.slice(0, 30);
  for (const item of result) {
    if (item.type === 'bond_request' || item.type === 'tribe_join_request') {
      // Actionable items stay unread until resolved
      item.read = false;
    } else if (readIds.has(item.id)) {
      // Individually marked read (click-to-read)
      item.read = true;
    } else if (lastViewed && item.timestamp <= lastViewed) {
      // Bulk-marked read via "Mark all read"
      item.read = true;
    }
  }

  return result;
}

/**
 * Gets total unread activity count for sidebar badge.
 */
export async function getUnreadActivityCount(userId: string): Promise<number> {
  const feed = await getActivityFeed(userId);
  return feed.filter(item => !item.read).length;
}

/**
 * Stamps the current time so all current activity items become "read".
 */
export async function markActivityViewed(userId: string): Promise<void> {
  const [existing] = await db.select().from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  if (existing) {
    await db.update(notificationPreferences)
      .set({ lastActivityViewedAt: new Date(), readActivityIds: [] })
      .where(eq(notificationPreferences.userId, userId));
  } else {
    await db.insert(notificationPreferences).values({
      userId,
      lastActivityViewedAt: new Date(),
      readActivityIds: [],
    });
  }
}

/**
 * Marks a single activity item as read by appending its ID to the per-item list.
 * The list is bounded to 50 entries to prevent unbounded growth.
 */
export async function markSingleActivityRead(userId: string, activityId: string): Promise<void> {
  const MAX_READ_IDS = 50;

  const [existing] = await db.select({
    readIds: notificationPreferences.readActivityIds,
  }).from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  const currentIds: string[] = (existing?.readIds as string[] | null) ?? [];

  // Deduplicate: don't add if already present
  if (currentIds.includes(activityId)) return;

  // Append and trim to max length (evict oldest = front of array)
  const updated = [...currentIds, activityId].slice(-MAX_READ_IDS);

  if (existing) {
    await db.update(notificationPreferences)
      .set({ readActivityIds: updated })
      .where(eq(notificationPreferences.userId, userId));
  } else {
    await db.insert(notificationPreferences).values({
      userId,
      readActivityIds: updated,
    });
  }
}
