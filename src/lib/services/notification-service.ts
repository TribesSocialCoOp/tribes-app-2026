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
  storyComments,
} from '@/db/schema';
import { eq, and, isNull, ne, desc, sql, inArray, gte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { buildPostPath } from '@/lib/utils/slugify';

interface TribeMeta {
  slug: string | undefined;
  name: string;
  isPublic: boolean;
}

/**
 * Batch-fetches tribe slugs + names + visibility for a set of tribe IDs.
 * Returns a Map<tribeId, { slug, name, isPublic }>.
 */
async function buildTribeMetaMap(tribeIds: string[]): Promise<Map<string, TribeMeta>> {
  const metaMap = new Map<string, TribeMeta>();
  if (tribeIds.length === 0) return metaMap;
  const uniqueIds = [...new Set(tribeIds)];
  const rows = await db.select({ id: tribes.id, slug: tribes.slug, name: tribes.name, isPublic: tribes.isPublic })
    .from(tribes)
    .where(inArray(tribes.id, uniqueIds));
  for (const row of rows) {
    metaMap.set(row.id, { slug: row.slug ?? undefined, name: row.name, isPublic: row.isPublic ?? false });
  }
  return metaMap;
}

/**
 * Builds a plaintext preview snippet for an activity card.
 * Returns undefined for encrypted or empty content — encrypted bodies
 * (posts/comments) and chat messages must never leak into the feed.
 */
function makeSnippet(text?: string | null, isEncrypted?: boolean | null): string | undefined {
  if (isEncrypted || !text) return undefined;
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return t.length > 120 ? `${t.slice(0, 119).trimEnd()}…` : t;
}

function initials(name?: string | null): string | undefined {
  const n = name?.trim();
  return n ? n.substring(0, 2).toUpperCase() : undefined;
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
  /** Person who triggered the item (alias-aware for join requests) */
  actorName?: string;
  actorAvatar?: string | null;
  actorAvatarFallback?: string;
  /** Where it happened: tribe name, bond type, post title, or 'Platform-wide' */
  contextName?: string;
  /** Plaintext-only content preview, ≤120 chars. Never set for encrypted content. */
  snippet?: string;
  /** Aggregation count (e.g. unread messages per bond) */
  count?: number;
}

export interface NotificationPrefs {
  pushEnabled: boolean;
  emailEnabled: boolean;
  mentionsEnabled: boolean;
  bondMessagesEnabled: boolean;
  tribeActivityEnabled: boolean;
  eventRemindersEnabled: boolean;
  governanceEnabled: boolean;
  readReceiptsEnabled: boolean;
  typingIndicatorsEnabled: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  pushEnabled: true,
  emailEnabled: true,
  mentionsEnabled: true,
  bondMessagesEnabled: true,
  tribeActivityEnabled: true,
  eventRemindersEnabled: true,
  governanceEnabled: true,
  readReceiptsEnabled: true,
  typingIndicatorsEnabled: true,
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
    readReceiptsEnabled: row.readReceiptsEnabled ?? true,
    typingIndicatorsEnabled: row.typingIndicatorsEnabled ?? true,
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

  if (pendingBondReqs.length > 0) {
    // Batch sender lookups (was N+1)
    const senderIds = [...new Set(pendingBondReqs.map(r => r.fromUserId))];
    const senderMap = new Map<string, { name: string; avatar: string | null }>();
    const senderRows = await db.select({ id: users.id, name: users.name, avatar: users.avatar })
      .from(users).where(inArray(users.id, senderIds));
    for (const r of senderRows) senderMap.set(r.id, { name: r.name, avatar: r.avatar });

    for (const req of pendingBondReqs) {
      const sender = senderMap.get(req.fromUserId);
      items.push({
        id: `activity-bond-${req.id}`,
        type: 'bond_request',
        title: 'New Bond Request',
        description: `${sender?.name ?? 'Someone'} wants to form a ${req.bondType} bond`,
        timestamp: req.createdAt ?? new Date(),
        actionUrl: '/bonds',
        read: false,
        actorName: sender?.name,
        actorAvatar: sender?.avatar,
        actorAvatarFallback: initials(sender?.name),
        contextName: req.bondType,
        snippet: makeSnippet(req.message),
      });
    }
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

    if (userBonds.length > 0) {
      // Messages may be stored under either bond ID (sender's or recipient's)
      // so we need to check both — same pattern as getMessages().
      // Batched: one reverse-bond query + one grouped unread query (was per-bond).
      const targetIds = [...new Set(userBonds.map(b => b.targetId))];
      const peerBonds = await db.select({ id: bonds.id, userId: bonds.userId })
        .from(bonds)
        .where(and(inArray(bonds.userId, targetIds), eq(bonds.targetId, userId)));
      const peerBondIdByTarget = new Map(peerBonds.map(pb => [pb.userId, pb.id]));

      const allBondIds = [...userBonds.map(b => b.id), ...peerBonds.map(pb => pb.id)];
      const unreadRows = await db.select({
        bondId: messages.bondId,
        count: sql<number>`count(*)`,
        latestSentAt: sql<string | null>`max(${messages.sentAt})`,
      }).from(messages)
        .where(and(
          inArray(messages.bondId, allBondIds),
          ne(messages.senderId, userId),
          isNull(messages.seenAt),
        ))
        .groupBy(messages.bondId);
      const unreadByBond = new Map(unreadRows.map(r => [r.bondId, r]));

      // Batch chat-partner avatars (bonds only denormalizes the name)
      const targetRows = await db.select({ id: users.id, avatar: users.avatar })
        .from(users).where(inArray(users.id, targetIds));
      const avatarByUser = new Map(targetRows.map(r => [r.id, r.avatar]));

      for (const bond of userBonds) {
        const own = unreadByBond.get(bond.id);
        const peerBondId = peerBondIdByTarget.get(bond.targetId);
        const peer = peerBondId ? unreadByBond.get(peerBondId) : undefined;
        const count = Number(own?.count ?? 0) + Number(peer?.count ?? 0);
        if (count > 0) {
          const latestTimes = [own?.latestSentAt, peer?.latestSentAt]
            .filter((s): s is string => Boolean(s))
            .map(s => new Date(s));
          items.push({
            id: `activity-msg-${bond.id}`,
            type: 'unread_message',
            title: `${count} unread message${count > 1 ? 's' : ''}`,
            description: `from ${bond.targetName}`,
            // Latest unread message time — a fetch-time timestamp would always
            // postdate lastActivityViewedAt, making "Mark all read" a no-op here
            timestamp: latestTimes.length > 0
              ? new Date(Math.max(...latestTimes.map(d => d.getTime())))
              : new Date(),
            actionUrl: `/chat/${bond.id}`,
            read: false,
            actorName: bond.targetName,
            actorAvatar: avatarByUser.get(bond.targetId) ?? null,
            actorAvatarFallback: initials(bond.targetName),
            count,
            // No snippet ever — chat messages are E2E encrypted
          });
        }
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

    if (adminMemberships.length > 0) {
      // Batched (was per-tribe + per-applicant): one pending query, one tribe
      // meta query, one applicant users query. Per-tribe cap applied in JS.
      const adminTribeIds = adminMemberships.map(m => m.tribeId);
      const allPending = await db.select({
        id: pendingMembers.id,
        tribeId: pendingMembers.tribeId,
        usrId: pendingMembers.userId,
        joinedAsAlias: pendingMembers.joinedAsAlias,
        joinedAsAvatar: pendingMembers.joinedAsAvatar,
        requestedAt: pendingMembers.requestedAt,
      }).from(pendingMembers)
        .where(inArray(pendingMembers.tribeId, adminTribeIds));

      const adminTribeMeta = await buildTribeMetaMap(adminTribeIds);
      const applicantIds = [...new Set(allPending.map(p => p.usrId))];
      const applicantMap = new Map<string, { name: string; avatar: string | null }>();
      if (applicantIds.length > 0) {
        const applicantRows = await db.select({ id: users.id, name: users.name, avatar: users.avatar })
          .from(users).where(inArray(users.id, applicantIds));
        for (const r of applicantRows) applicantMap.set(r.id, { name: r.name, avatar: r.avatar });
      }

      const perTribeCount = new Map<string, number>();
      for (const p of allPending) {
        const seen = perTribeCount.get(p.tribeId) ?? 0;
        if (seen >= 5) continue; // preserve the old per-tribe limit(5)
        perTribeCount.set(p.tribeId, seen + 1);

        const tribeName = adminTribeMeta.get(p.tribeId)?.name;
        const applicant = applicantMap.get(p.usrId);
        // Alias-joined applicants must show their alias, not their real identity
        const displayName = p.joinedAsAlias ?? applicant?.name;
        items.push({
          id: `activity-join-${p.id}`,
          type: 'tribe_join_request',
          title: 'Tribe Join Request',
          description: `${displayName ?? 'Someone'} wants to join ${tribeName ?? 'your tribe'}`,
          timestamp: p.requestedAt ?? new Date(),
          actionUrl: `/tribes/${p.tribeId}/manage-members`,
          read: false,
          actorName: displayName,
          actorAvatar: p.joinedAsAlias ? p.joinedAsAvatar : (applicant?.avatar ?? null),
          actorAvatarFallback: initials(displayName),
          contextName: tribeName,
        });
      }
    }
  }

  // 4. Unread mentions (if mentions enabled)
  if (prefs.mentionsEnabled) {
    const mentionRows = await db.select({
      id: mentions.id,
      sourceType: mentions.sourceType,
      sourceId: mentions.sourceId,
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

    if (mentionRows.length > 0) {
      // 1. Batch query posts for mentions of type 'post'
      const postIds = mentionRows.filter(m => m.sourceType === 'post').map(m => m.sourceId);
      const postMap = new Map<string, { slug: string | null; tribeId: string | null; title: string | null; content: string; isEncrypted: boolean | null }>();
      if (postIds.length > 0) {
        const postRows = await db.select({ id: posts.id, slug: posts.slug, tribeId: posts.tribeId, title: posts.title, content: posts.content, isEncrypted: posts.isEncrypted })
          .from(posts).where(inArray(posts.id, postIds));
        for (const r of postRows) {
          postMap.set(r.id, { slug: r.slug, tribeId: r.tribeId, title: r.title, content: r.content, isEncrypted: r.isEncrypted });
        }
      }

      // 2. Batch query comments and their corresponding posts for mentions of type 'comment'
      const commentIds = mentionRows.filter(m => m.sourceType === 'comment').map(m => m.sourceId);
      const commentMap = new Map<string, { postId: string; content: string; isEncrypted: boolean | null }>();
      const commentPostMap = new Map<string, { slug: string | null; tribeId: string | null; title: string | null }>();
      if (commentIds.length > 0) {
        const commentRows = await db.select({ id: comments.id, postId: comments.postId, content: comments.content, isEncrypted: comments.isEncrypted })
          .from(comments).where(inArray(comments.id, commentIds));
        for (const r of commentRows) {
          commentMap.set(r.id, { postId: r.postId, content: r.content, isEncrypted: r.isEncrypted });
        }
        const commentPostIds = commentRows.map(r => r.postId);
        if (commentPostIds.length > 0) {
          const postRows = await db.select({ id: posts.id, slug: posts.slug, tribeId: posts.tribeId, title: posts.title })
            .from(posts).where(inArray(posts.id, commentPostIds));
          for (const r of postRows) {
            commentPostMap.set(r.id, { slug: r.slug, tribeId: r.tribeId, title: r.title });
          }
        }
      }

      // 3. Batch query story comments for mentions of type 'story_comment'
      // (storyComments has no encryption columns — always plaintext)
      const storyCommentIds = mentionRows.filter(m => m.sourceType === 'story_comment').map(m => m.sourceId);
      const storyCommentMap = new Map<string, { storyId: string; content: string }>();
      if (storyCommentIds.length > 0) {
        const storyCommentRows = await db.select({ id: storyComments.id, storyId: storyComments.storyId, content: storyComments.content })
          .from(storyComments).where(inArray(storyComments.id, storyCommentIds));
        for (const r of storyCommentRows) {
          storyCommentMap.set(r.id, { storyId: r.storyId, content: r.content });
        }
      }

      // 4. Batch query tribe slugs/names for all referenced tribes
      const tribeIds: string[] = [];
      for (const p of postMap.values()) {
        if (p.tribeId) tribeIds.push(p.tribeId);
      }
      for (const p of commentPostMap.values()) {
        if (p.tribeId) tribeIds.push(p.tribeId);
      }
      const tribeMetaMap = await buildTribeMetaMap(tribeIds);

      // 4b. Mentions resolve platform-wide (processMentions does no membership
      // check), so the mentioned user may not have access to the source tribe.
      // Snippets/context must only surface content they can actually see:
      // membership (one batched query) or a public tribe. Encrypted content is
      // already suppressed by makeSnippet, but plaintext rows in a private
      // tribe (legacy/non-UI writes) must not leak either.
      const uniqueMentionTribeIds = [...new Set(tribeIds)];
      const memberTribeIds = new Set<string>();
      if (uniqueMentionTribeIds.length > 0) {
        const membershipRows = await db.select({ tribeId: tribeMembers.tribeId })
          .from(tribeMembers)
          .where(and(
            eq(tribeMembers.userId, userId),
            inArray(tribeMembers.tribeId, uniqueMentionTribeIds),
          ));
        for (const r of membershipRows) memberTribeIds.add(r.tribeId);
      }
      // No tribe (journal/bond/public-ring source) → not tribe-gated
      const canViewTribeContent = (tribeId: string | null): boolean =>
        !tribeId || memberTribeIds.has(tribeId) || (tribeMetaMap.get(tribeId)?.isPublic ?? false);

      // 5. Batch query mentioner display names + avatars
      const mentionerIds = [...new Set(mentionRows.map(m => m.mentionerUserId).filter(Boolean) as string[])];
      const mentionerMap = new Map<string, { name: string; avatar: string | null }>();
      if (mentionerIds.length > 0) {
        const mentionerRows = await db.select({ id: users.id, name: users.name, avatar: users.avatar })
          .from(users).where(inArray(users.id, mentionerIds));
        for (const r of mentionerRows) {
          if (r.name) mentionerMap.set(r.id, { name: r.name, avatar: r.avatar });
        }
      }

      for (const m of mentionRows) {
        const mentioner = m.mentionerUserId ? mentionerMap.get(m.mentionerUserId) : undefined;
        const mentionerName = mentioner?.name ?? 'Someone';

        let actionUrl = '/your-comms';
        let snippet: string | undefined;
        let contextName: string | undefined;
        if (m.sourceType === 'post') {
          const p = postMap.get(m.sourceId);
          if (p) {
            actionUrl = buildPostPath(m.sourceId, p.slug, p.tribeId ? tribeMetaMap.get(p.tribeId)?.slug : undefined);
            if (canViewTribeContent(p.tribeId)) {
              snippet = makeSnippet(p.content, p.isEncrypted);
              contextName = p.title ?? (p.tribeId ? tribeMetaMap.get(p.tribeId)?.name : undefined);
            }
          }
        } else if (m.sourceType === 'comment') {
          const c = commentMap.get(m.sourceId);
          if (c) {
            const p = commentPostMap.get(c.postId);
            actionUrl = `${buildPostPath(c.postId, p?.slug, p?.tribeId ? tribeMetaMap.get(p.tribeId)?.slug : undefined)}?commentId=${m.sourceId}`;
            if (canViewTribeContent(p?.tribeId ?? null)) {
              snippet = makeSnippet(c.content, c.isEncrypted);
              contextName = p?.title ?? (p?.tribeId ? tribeMetaMap.get(p.tribeId)?.name : undefined);
            }
          }
        } else if (m.sourceType === 'story_comment') {
          const sc = storyCommentMap.get(m.sourceId);
          if (sc) {
            actionUrl = `/our-story/${sc.storyId}?commentId=${m.sourceId}`;
            snippet = makeSnippet(sc.content);
            contextName = 'Our Story';
          }
        }

        items.push({
          id: `activity-mention-${m.id}`,
          type: 'mention',
          title: 'You were mentioned',
          description: `${mentionerName} mentioned you in a ${m.sourceType?.replace('_', ' ') ?? 'post'}`,
          timestamp: m.createdAt ?? new Date(),
          actionUrl,
          read: false,
          actorName: mentioner?.name,
          actorAvatar: mentioner?.avatar,
          actorAvatarFallback: initials(mentioner?.name),
          contextName,
          snippet,
        });
      }
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
        authorAvatar: posts.authorAvatar,
        authorAvatarFallback: posts.authorAvatarFallback,
        tribeId: posts.tribeId,
        createdAt: posts.createdAt,
        title: posts.title,
        slug: posts.slug,
        content: posts.content,
        isEncrypted: posts.isEncrypted,
      }).from(posts)
        .where(and(
          inArray(posts.tribeId, tribeIds),
          gte(posts.createdAt, sevenDaysAgo),
        ))
        .orderBy(desc(posts.createdAt))
        .limit(15);

      // Look up tribe names and slugs for display/routing (one batched query)
      const tribeMetaMap = await buildTribeMetaMap(tribeIds);

      for (const post of recentPosts) {
        if (post.authorId === userId) continue; // Skip own posts
        const tribeName = tribeMetaMap.get(post.tribeId!)?.name;
        items.push({
          id: `activity-tribepost-${post.id}`,
          // Encrypted posts keep plaintext `title` NULL (the title is in the
          // title_ciphertext column, undecryptable server-side) → falls back to 'New post'.
          type: 'new_tribe_post',
          title: post.title ?? 'New post',
          description: `${post.authorName ?? 'Someone'} posted in ${tribeName ?? 'your tribe'}`,
          timestamp: post.createdAt ?? new Date(),
          actionUrl: buildPostPath(post.id, post.slug, tribeMetaMap.get(post.tribeId!)?.slug),
          read: false,
          actorName: post.authorName ?? undefined,
          actorAvatar: post.authorAvatar,
          actorAvatarFallback: post.authorAvatarFallback ?? initials(post.authorName),
          contextName: tribeName,
          snippet: makeSnippet(post.content, post.isEncrypted),
        });
      }
    }
  }

  // 6. Comments on user's posts (last 30 days)
  if (prefs.tribeActivityEnabled) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const userPosts = await db.select({ id: posts.id, tribeId: posts.tribeId, slug: posts.slug, title: posts.title })
      .from(posts)
      .where(eq(posts.authorId, userId));

    if (userPosts.length > 0) {
      const postIds = userPosts.map(p => p.id);
      const postTribeMap = new Map(userPosts.map(p => [p.id, p.tribeId]));
      const postSlugMap = new Map(userPosts.map(p => [p.id, p.slug]));
      const postTitleMap = new Map(userPosts.map(p => [p.id, p.title]));

      // Also fetch slugs for these tribes
      const tribeIds = [...new Set(userPosts.map(p => p.tribeId).filter(Boolean) as string[])];
      const tribeMetaMap = await buildTribeMetaMap(tribeIds);

      const recentComments = await db.select({
        id: comments.id,
        authorId: comments.authorId,
        authorName: comments.authorName,
        authorAvatar: comments.authorAvatar,
        authorAvatarFallback: comments.authorAvatarFallback,
        postId: comments.postId,
        createdAt: comments.createdAt,
        content: comments.content,
        isEncrypted: comments.isEncrypted,
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
          actionUrl: `${buildPostPath(cmt.postId, postSlugMap.get(cmt.postId), tribeId ? tribeMetaMap.get(tribeId)?.slug : undefined)}?commentId=${cmt.id}`,
          read: false,
          actorName: cmt.authorName ?? undefined,
          actorAvatar: cmt.authorAvatar,
          actorAvatarFallback: cmt.authorAvatarFallback ?? initials(cmt.authorName),
          contextName: postTitleMap.get(cmt.postId) ?? undefined,
          snippet: makeSnippet(cmt.content, cmt.isEncrypted),
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
      authorAvatar: comments.authorAvatar,
      authorAvatarFallback: comments.authorAvatarFallback,
      postId: comments.postId,
      createdAt: comments.createdAt,
      content: comments.content,
      isEncrypted: comments.isEncrypted,
      postSlug: posts.slug,
      postTribeId: posts.tribeId,
      postTitle: posts.title,
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
      const replyTribeMetaMap = await buildTribeMetaMap(replyTribeIds);

      for (const reply of replyRows) {
        const tribeSlug = reply.postTribeId ? replyTribeMetaMap.get(reply.postTribeId)?.slug : undefined;
        items.push({
          id: `activity-reply-${reply.id}`,
          type: 'new_comment',
          title: 'New Reply',
          description: `${reply.authorName ?? 'Someone'} replied to your comment`,
          timestamp: reply.createdAt ?? new Date(),
          actionUrl: `${buildPostPath(reply.postId, reply.postSlug, tribeSlug)}?commentId=${reply.id}`,
          read: false,
          actorName: reply.authorName ?? undefined,
          actorAvatar: reply.authorAvatar,
          actorAvatarFallback: reply.authorAvatarFallback ?? initials(reply.authorName),
          contextName: reply.postTitle ?? undefined,
          snippet: makeSnippet(reply.content, reply.isEncrypted),
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
      description: proposals.description,
      tribeId: proposals.tribeId,
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

    if (activeProposals.length > 0) {
      const proposalTribeIds = [...new Set(activeProposals.map(p => p.tribeId).filter(Boolean) as string[])];
      const proposalTribeMeta = await buildTribeMetaMap(proposalTribeIds);

      for (const proposal of activeProposals) {
        if (proposal.createdBy === userId) continue; // Skip own proposals
        items.push({
          id: `activity-governance-${proposal.id}`,
          type: 'governance',
          title: 'Active Proposal',
          description: `"${proposal.title}" — vote now`,
          timestamp: proposal.createdAt ?? new Date(),
          actionUrl: `/voting/${proposal.id}`,
          read: false,
          contextName: proposal.tribeId
            ? proposalTribeMeta.get(proposal.tribeId)?.name
            : 'Platform-wide',
          snippet: makeSnippet(proposal.description),
        });
      }
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
