/**
 * @fileoverview Service layer for post-related actions.
 * Now backed by Drizzle ORM + SQLite.
 */
import { db } from '@/db';
import { posts, postMoodTags, comments, blockedUsers, vibes, tribeMembers } from '@/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { users } from '@/db/schema';
import type { TribePost, MoodStreamPost, DiscussionComment } from '@/lib/types';
import { rowToTribePost } from '@/lib/mappers/post-mapper';

function buildCommentTree(allComments: (typeof comments.$inferSelect)[], parentId: string | null): DiscussionComment[] {
  return allComments
    .filter(c => c.parentCommentId === parentId)
    .map(c => ({
      id: c.id,
      authorId: c.authorId,
      authorName: c.authorName,
      authorAvatar: c.authorAvatar ?? undefined,
      authorAvatarFallback: c.authorAvatarFallback,
      dataAiHintAvatar: c.dataAiHintAvatar ?? undefined,
      content: c.content,
      vibes: c.vibeCount ?? 0,
      timestamp: c.createdAt ?? new Date(),
      replies: buildCommentTree(allComments, c.id),
    }));
}

/**
 * Helper: get blocked user IDs for a given user.
 */
async function getBlockedAuthorIds(userId?: string): Promise<string[]> {
  if (!userId) return [];
  const rows = await db.select({ blockedId: blockedUsers.blockedUserId })
    .from(blockedUsers)
    .where(eq(blockedUsers.userId, userId));
  return rows.map(r => r.blockedId);
}

/**
 * Helper: get tribe IDs that a user is a member of.
 */
async function getUserTribeIds(userId?: string): Promise<string[]> {
  if (!userId) return [];
  const rows = await db.select({ tribeId: tribeMembers.tribeId })
    .from(tribeMembers)
    .where(eq(tribeMembers.userId, userId));
  return rows.map(r => r.tribeId);
}

/**
 * Fetches all posts for a specific tribe.
 * Filters out posts from users blocked by the current viewer.
 */
export async function getPostsForTribe(tribeId: string, viewerUserId?: string): Promise<TribePost[]> {
  const blockedIds = await getBlockedAuthorIds(viewerUserId);

  let rows;
  if (blockedIds.length > 0) {
    rows = await db.select().from(posts)
      .where(eq(posts.tribeId, tribeId))
      .orderBy(desc(posts.createdAt));
    // Filter in JS since notInArray with empty arrays can cause issues in some drivers
    rows = rows.filter(r => !blockedIds.includes(r.authorId));
  } else {
    rows = await db.select().from(posts)
      .where(eq(posts.tribeId, tribeId))
      .orderBy(desc(posts.createdAt));
  }

  const results = await Promise.all(rows.map(async (row) => {
    const commentRows = await db.select().from(comments).where(eq(comments.postId, row.id));
    // Also filter out comments from blocked users
    const filteredComments = blockedIds.length > 0
      ? commentRows.filter(c => !blockedIds.includes(c.authorId))
      : commentRows;
    const commentsData = buildCommentTree(filteredComments, null);
    return rowToTribePost(row, commentsData.length > 0 ? commentsData : undefined);
  }));

  return results;
}

/**
 * Fetches all mood stream posts (posts promoted to mood streams).
 * Filters out posts from users blocked by the current viewer.
 */
export async function getMoodStreamPosts(viewerUserId?: string): Promise<MoodStreamPost[]> {
  const blockedIds = await getBlockedAuthorIds(viewerUserId);

  // Get all post IDs that have mood tags
  const taggedPosts = await db.select().from(postMoodTags);
  const postIds = [...new Set(taggedPosts.map(t => t.postId))];

  if (postIds.length === 0) return [];

  const results: MoodStreamPost[] = [];
  for (const postId of postIds) {
    const postRows = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
    const postRow = postRows[0];
    if (!postRow) continue;

    // Skip posts from blocked users
    if (blockedIds.includes(postRow.authorId)) continue;

    // Enforce moodVisibility: restrict non-public posts to tribe members
    if (postRow.moodVisibility && postRow.moodVisibility !== 'public') {
      const viewerTribeIds = await getUserTribeIds(viewerUserId);
      if (!viewerTribeIds.includes(postRow.tribeId)) continue; // Not a member → skip
    }

    const tags = taggedPosts.filter(t => t.postId === postId).map(t => t.moodSlug);

    // Look up tribe name
    const { tribes } = await import('@/db/schema');
    const tribeRows = await db.select().from(tribes).where(eq(tribes.id, postRow.tribeId)).limit(1);
    const tribe = tribeRows[0];

    // Look up promoter name (use first tag's promotedBy)
    let promotedByName: string | undefined;
    const promoterTag = taggedPosts.find(t => t.postId === postId && t.promotedBy);
    if (promoterTag?.promotedBy) {
      const promoterRows = await db.select({ name: users.name }).from(users).where(eq(users.id, promoterTag.promotedBy)).limit(1);
      promotedByName = promoterRows[0]?.name;
    }

    results.push({
      id: postRow.id,
      author: postRow.authorName,
      authorAvatarSrc: postRow.authorAvatar ?? undefined,
      authorAvatarFallback: postRow.authorAvatarFallback,
      dataAiHintAvatar: postRow.dataAiHintAvatar ?? undefined,
      tribeName: tribe?.name ?? undefined,
      tribeId: postRow.tribeId,
      timestamp: postRow.createdAt ?? new Date(),
      title: postRow.title ?? undefined,
      content: postRow.content,
      imageUrl: postRow.imageUrl ?? undefined,
      imageAlt: postRow.imageAlt ?? undefined,
      dataAiHintImage: postRow.dataAiHintImage ?? undefined,
      vibes: postRow.vibeCount ?? 0,
      comments: postRow.commentCount ?? 0,
      moodTags: tags,
      promotedByName,
    });
  }

  return results;
}

/**
 * Creates a new post in a tribe.
 * Image URL should already be uploaded client-side via /api/upload.
 */
export async function createTribePost(tribeId: string, payload: { title?: string; content: string; imageUrl?: string }, authorId: string): Promise<TribePost> {
  const id = `new-post-${Date.now()}`;

  // Access control: verify the author is a member of the tribe
  const memberRows = await db.select().from(tribeMembers)
    .where(and(eq(tribeMembers.tribeId, tribeId), eq(tribeMembers.userId, authorId)))
    .limit(1);
  if (memberRows.length === 0) {
    throw new Error('You must be a member of this tribe to create a post.');
  }

  // Fetch author info
  const authorRows = await db.select().from(users).where(eq(users.id, authorId)).limit(1);
  const author = authorRows[0];

  const finalImageUrl = payload.imageUrl || null;

  await db.insert(posts).values({
    id,
    tribeId,
    authorId,
    authorName: author?.name ?? 'Unknown User',
    authorAvatar: author?.avatar ?? null,
    authorAvatarFallback: (author?.name?.substring(0, 2).toUpperCase()) ?? '??',
    title: payload.title || null,
    content: payload.content,
    imageUrl: finalImageUrl,
    imageAlt: finalImageUrl ? 'User uploaded image' : null,
    dataAiHintImage: finalImageUrl ? 'user upload' : null,
    vibeCount: 0,
    commentCount: 0,
    isRemoved: false,
    canBeReposted: true,
    createdAt: new Date(),
  });

  const finalRows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return rowToTribePost(finalRows[0]!);
}

/**
 * Reposts content.
 */
export async function repost(postToRepost: TribePost, editedContent: string): Promise<TribePost> {
  const id = `repost-${postToRepost.id}-${Date.now()}`;

  // Mark original as non-repostable
  await db.update(posts).set({ canBeReposted: false }).where(eq(posts.id, postToRepost.id));

  await db.insert(posts).values({
    id,
    tribeId: postToRepost.tribeId,
    authorId: postToRepost.authorId,
    authorName: postToRepost.authorName,
    authorAvatar: postToRepost.authorAvatar ?? null,
    authorAvatarFallback: postToRepost.authorAvatarFallback,
    dataAiHintAvatar: postToRepost.dataAiHintAvatar ?? null,
    title: postToRepost.title ? `Repost: ${postToRepost.title}` : 'Repost: Untitled',
    content: editedContent,
    imageUrl: postToRepost.imageUrl ?? null,
    imageAlt: postToRepost.imageAlt ?? null,
    dataAiHintImage: postToRepost.dataAiHintImage ?? null,
    vibeCount: 0,
    commentCount: 0,
    isRemoved: false,
    canBeReposted: true,
    originalPostId: postToRepost.id,
    createdAt: new Date(),
  });

  const finalRows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return rowToTribePost(finalRows[0]!);
}

/**
 * Promotes a post to mood streams.
 */
export async function sharePostToTribe(
  sourcePostId: string,
  targetTribeId: string,
  authorId: string,
  persona: string, // 'main_profile' or an alias string
): Promise<TribePost> {
  // Verify the author is a member of the target tribe
  const memberRows = await db.select().from(tribeMembers)
    .where(and(eq(tribeMembers.tribeId, targetTribeId), eq(tribeMembers.userId, authorId)))
    .limit(1);
  if (memberRows.length === 0) {
    throw new Error('You must be a member of this tribe to share a post there.');
  }

  // Get the source post
  const sourceRows = await db.select().from(posts).where(eq(posts.id, sourcePostId)).limit(1);
  const source = sourceRows[0];
  if (!source) throw new Error('Source post not found.');

  // Get author info for display name
  const authorRows = await db.select().from(users).where(eq(users.id, authorId)).limit(1);
  const author = authorRows[0];
  const displayName = persona === 'main_profile'
    ? (author?.name ?? 'Unknown User')
    : persona; // Use the alias directly

  const id = `share-${sourcePostId}-${targetTribeId}-${Date.now()}`;

  await db.insert(posts).values({
    id,
    tribeId: targetTribeId,
    authorId,
    authorName: displayName,
    authorAvatar: author?.avatar ?? null,
    authorAvatarFallback: displayName.substring(0, 2).toUpperCase(),
    title: source.title ? `Shared: ${source.title}` : 'Shared Post',
    content: source.content,
    imageUrl: source.imageUrl,
    imageAlt: source.imageAlt,
    dataAiHintImage: source.dataAiHintImage,
    vibeCount: 0,
    commentCount: 0,
    isRemoved: false,
    canBeReposted: true,
    originalPostId: sourcePostId,
    createdAt: new Date(),
  });

  const finalRows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return rowToTribePost(finalRows[0]!);
}

/**
 * Promotes a post to mood streams.
 */
export async function promotePostToMoods(postId: string, moodSlugs: string[], promotedBy: string): Promise<void> {
  // Enforce moodVisibility: block members_only posts from public mood streams
  const postRows = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  const post = postRows[0];
  if (post?.moodVisibility === 'members_only') {
    throw new Error('This post is marked "members only" and cannot be promoted to a public mood stream.');
  }

  // If tribe_network, upgrade visibility to public when promoted
  if (post && post.moodVisibility === 'tribe_network') {
    await db.update(posts).set({ moodVisibility: 'public' }).where(eq(posts.id, postId));
  }

  for (const moodSlug of moodSlugs) {
    try {
      await db.insert(postMoodTags).values({
        postId,
        moodSlug,
        promotedAt: new Date(),
        promotedBy,
      });
    } catch {
      // Duplicate tag, skip
    }
  }
}

// ============================================================
// VIBE TOGGLE
// ============================================================

/**
 * Toggle a vibe (reaction) on a post or comment.
 * If the user already vibed → remove it (decrement count).
 * If not → add it (increment count).
 * Returns the new count and whether the user now has a vibe.
 */
export async function toggleVibe(
  userId: string,
  targetId: string,
  targetType: 'post' | 'comment',
  emoji: string,
): Promise<{ vibed: boolean; newCount: number }> {
  // Check if vibe already exists
  const existing = await db.select().from(vibes).where(
    and(
      eq(vibes.userId, userId),
      eq(vibes.targetId, targetId),
      eq(vibes.targetType, targetType),
    )
  ).limit(1);

  if (existing.length > 0) {
    // Remove vibe
    await db.delete(vibes).where(eq(vibes.id, existing[0]!.id));

    // Decrement count
    if (targetType === 'post') {
      await db.update(posts).set({
        vibeCount: sql`MAX(0, ${posts.vibeCount} - 1)`,
      }).where(eq(posts.id, targetId));
    } else {
      await db.update(comments).set({
        vibeCount: sql`MAX(0, ${comments.vibeCount} - 1)`,
      }).where(eq(comments.id, targetId));
    }

    // Get new count
    const newCount = targetType === 'post'
      ? (await db.select({ c: posts.vibeCount }).from(posts).where(eq(posts.id, targetId)))[0]?.c ?? 0
      : (await db.select({ c: comments.vibeCount }).from(comments).where(eq(comments.id, targetId)))[0]?.c ?? 0;

    return { vibed: false, newCount };
  } else {
    // Add vibe
    const id = `vibe-${userId.substring(0, 8)}-${Date.now()}`;
    await db.insert(vibes).values({
      id,
      userId,
      targetId,
      targetType,
      emoji,
      createdAt: new Date(),
    });

    // Increment count
    if (targetType === 'post') {
      await db.update(posts).set({
        vibeCount: sql`${posts.vibeCount} + 1`,
      }).where(eq(posts.id, targetId));
    } else {
      await db.update(comments).set({
        vibeCount: sql`${comments.vibeCount} + 1`,
      }).where(eq(comments.id, targetId));
    }

    const newCount = targetType === 'post'
      ? (await db.select({ c: posts.vibeCount }).from(posts).where(eq(posts.id, targetId)))[0]?.c ?? 0
      : (await db.select({ c: comments.vibeCount }).from(comments).where(eq(comments.id, targetId)))[0]?.c ?? 0;

    return { vibed: true, newCount };
  }
}

// ============================================================
// COMMENT CRUD
// ============================================================

/**
 * Get all comments for a post (threaded).
 */
export async function getCommentsForPost(postId: string): Promise<DiscussionComment[]> {
  const allComments = await db.select().from(comments)
    .where(eq(comments.postId, postId))
    .orderBy(desc(comments.createdAt));
  return buildCommentTree(allComments, null);
}

/**
 * Create a comment on a post.
 * Updates the post's commentCount denormalization.
 */
export async function createComment(
  postId: string,
  userId: string,
  content: string,
  parentCommentId?: string,
): Promise<DiscussionComment> {
  // Fetch author info
  const [author] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!author) throw new Error('User not found');

  const id = crypto.randomUUID();
  const initials = (author.name ?? 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  await db.insert(comments).values({
    id,
    postId,
    parentCommentId: parentCommentId ?? null,
    authorId: userId,
    authorName: author.name ?? 'Unknown',
    authorAvatar: author.avatar ?? null,
    authorAvatarFallback: initials,
    content,
    vibeCount: 0,
    createdAt: new Date(),
  });

  // Increment post comment count
  await db.update(posts).set({
    commentCount: sql`${posts.commentCount} + 1`,
  }).where(eq(posts.id, postId));

  return {
    id,
    authorId: userId,
    authorName: author.name ?? 'Unknown',
    authorAvatar: author.avatar ?? undefined,
    authorAvatarFallback: initials,
    content,
    vibes: 0,
    timestamp: new Date(),
    replies: [],
  };
}

