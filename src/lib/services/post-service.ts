/**
 * @fileoverview Service layer for post-related actions.
 * Now backed by Drizzle ORM + SQLite.
 */
import { db } from '@/db';
import { posts, postMoodTags, comments, blockedUsers, vibes, tribeMembers, users, tribes } from '@/db/schema';
import { eq, desc, and, sql, inArray, lt } from 'drizzle-orm';
import { getBlockedAuthorIds, getUserTribeIds, resolveDisplayIdentity } from './query-helpers';
import type { TribePost, MoodStreamPost, DiscussionComment, PaginatedResult } from '@/lib/types';
import { rowToTribePost } from '@/lib/mappers/post-mapper';
import { slugify } from '@/lib/utils/slugify';

/**
 * Helper: Batch-fetch live avatars and names for a set of user IDs.
 * Returns { avatar, name } so callers can skip the live avatar override
 * when a post was authored under an alias (authorName ≠ user.name).
 */
async function batchFetchLiveAvatarInfo(userIds: string[]): Promise<Map<string, { avatar: string | null; name: string }>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const rows = await db.select({ id: users.id, avatar: users.avatar, name: users.name })
    .from(users)
    .where(inArray(users.id, uniqueIds));
  return new Map(rows.map(r => [r.id, { avatar: r.avatar, name: r.name }]));
}

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
      // E2E encryption fields
      isEncrypted: c.isEncrypted ?? false,
      ciphertextBase64: c.ciphertext
        ? Buffer.from(c.ciphertext as Buffer).toString('base64')
        : undefined,
      encryptionIv: c.encryptionIv ?? undefined,
    }));
}


/**
 * Fetches posts for a specific tribe with cursor-based pagination.
 * Filters out posts from users blocked by the current viewer.
 */
export async function getPostsForTribe(
  tribeId: string,
  viewerUserId?: string,
  options?: { cursor?: string; limit?: number },
): Promise<PaginatedResult<TribePost>> {
  const limit = options?.limit ?? 20;
  const cursor = options?.cursor ? new Date(options.cursor) : null;
  const blockedIds = await getBlockedAuthorIds(viewerUserId);

  // Build the query with cursor + limit
  const fetchLimit = limit + 1; // Fetch one extra to detect hasMore

  let rows;
  if (cursor) {
    rows = await db.select().from(posts)
      .where(and(eq(posts.tribeId, tribeId), lt(posts.createdAt, cursor)))
      .orderBy(desc(posts.createdAt))
      .limit(fetchLimit);
  } else {
    rows = await db.select().from(posts)
      .where(eq(posts.tribeId, tribeId))
      .orderBy(desc(posts.createdAt))
      .limit(fetchLimit);
  }

  // Filter blocked users in JS (notInArray with empty arrays can cause driver issues)
  if (blockedIds.length > 0) {
    rows = rows.filter(r => !blockedIds.includes(r.authorId));
  }

  // Determine if there are more pages
  const hasMore = rows.length > limit;
  if (hasMore) rows = rows.slice(0, limit);

  const postIds = rows.map(r => r.id);
  const allComments = postIds.length > 0
    ? await db.select().from(comments).where(inArray(comments.postId, postIds)).orderBy(comments.createdAt)
    : [];

  const commentsByPost = new Map<string, (typeof comments.$inferSelect)[]>();
  for (const c of allComments) {
    if (!commentsByPost.has(c.postId)) commentsByPost.set(c.postId, []);
    commentsByPost.get(c.postId)!.push(c);
  }

  const allVibes = postIds.length > 0
    ? await db.select().from(vibes).where(and(inArray(vibes.targetId, postIds), eq(vibes.targetType, 'post')))
    : [];

  const vibesByPost = new Map<string, (typeof vibes.$inferSelect)[]>();
  for (const v of allVibes) {
    if (!vibesByPost.has(v.targetId)) vibesByPost.set(v.targetId, []);
    vibesByPost.get(v.targetId)!.push(v);
  }

  // Fetch live avatars + names so we can skip the override for alias posts
  const authorIds = rows.map(r => r.authorId);
  const liveAvatarInfo = await batchFetchLiveAvatarInfo(authorIds);


  const items = rows.map((row) => {
    const commentRows = commentsByPost.get(row.id) ?? [];
    // Also filter out comments from blocked users
    const filteredComments = blockedIds.length > 0
      ? commentRows.filter(c => !blockedIds.includes(c.authorId))
      : commentRows;
    const commentsData = buildCommentTree(filteredComments, null);
    
    const postVibes = vibesByPost.get(row.id) ?? [];
    const hasVibed = viewerUserId ? postVibes.some(v => v.userId === viewerUserId) : false;
    
    // Group and sort emojis
    const emojiCounts = new Map<string, number>();
    for (const v of postVibes) {
      emojiCounts.set(v.emoji, (emojiCounts.get(v.emoji) ?? 0) + 1);
    }
    const recentVibes = Array.from(emojiCounts.entries())
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // Only apply live avatar when post was authored under the user's real name
    // (not an alias). Alias posts store the alias avatar at creation time.
    const info = liveAvatarInfo.get(row.authorId);
    const isAliasPost = info && row.authorName !== info.name;
    const liveAvatar = isAliasPost ? undefined : info?.avatar;
    const post = rowToTribePost(row, commentsData.length > 0 ? commentsData : undefined, liveAvatar, !!isAliasPost);
    post.recentVibes = recentVibes;
    post.hasVibed = hasVibed;
    return post;
  });

  // Compute nextCursor from the last item's timestamp
  const nextCursor = hasMore && items.length > 0
    ? items[items.length - 1]!.timestamp.toISOString()
    : null;

  return { items, nextCursor };
}

/**
 * Fetches mood stream posts (posts promoted to mood streams) with cursor-based pagination.
 * Filters out posts from users blocked by the current viewer.
 */
export async function getMoodStreamPosts(
  viewerUserId?: string,
  options?: { cursor?: string; limit?: number },
): Promise<PaginatedResult<MoodStreamPost>> {
  const limit = options?.limit ?? 20;
  const cursor = options?.cursor ? new Date(options.cursor) : null;
  const blockedIds = await getBlockedAuthorIds(viewerUserId);

  // Get all post IDs that have mood tags
  const taggedPosts = await db.select().from(postMoodTags);
  const moodPostIds = [...new Set(taggedPosts.map(t => t.postId))];

  if (moodPostIds.length === 0) return { items: [], nextCursor: null };

  // Fetch posts with cursor + limit
  const fetchLimit = limit + 1;
  let allPosts;
  if (cursor) {
    allPosts = await db.select().from(posts)
      .where(and(inArray(posts.id, moodPostIds), lt(posts.createdAt, cursor)))
      .orderBy(desc(posts.createdAt))
      .limit(fetchLimit);
  } else {
    allPosts = await db.select().from(posts)
      .where(inArray(posts.id, moodPostIds))
      .orderBy(desc(posts.createdAt))
      .limit(fetchLimit);
  }

  // Filter blocked + removed + visibility in JS
  const viewerTribeIds = await getUserTribeIds(viewerUserId);
  allPosts = allPosts.filter(p => {
    if (p.isRemoved) return false;
    if (blockedIds.includes(p.authorId)) return false;
    if (p.moodVisibility && p.moodVisibility !== 'public') {
      if (!p.tribeId || !viewerTribeIds.includes(p.tribeId)) return false;
    }
    return true;
  });

  // Determine hasMore before slicing
  const hasMore = allPosts.length > limit;
  if (hasMore) allPosts = allPosts.slice(0, limit);

  const postIds = allPosts.map(p => p.id);

  // Batch-fetch tribes
  const tribeIds = [...new Set(allPosts.map(p => p.tribeId).filter(Boolean) as string[])];
  const allTribes = tribeIds.length > 0
    ? await db.select({ id: tribes.id, name: tribes.name }).from(tribes).where(inArray(tribes.id, tribeIds))
    : [];
  const tribeMap = new Map(allTribes.map(t => [t.id, t.name]));

  // Batch-fetch promoter names
  const promoterIds = [...new Set(taggedPosts.filter(t => postIds.includes(t.postId) && t.promotedBy).map(t => t.promotedBy!))];
  const allPromoters = promoterIds.length > 0
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, promoterIds))
    : [];
  const promoterMap = new Map(allPromoters.map(u => [u.id, u.name]));

  const allVibes = postIds.length > 0
    ? await db.select().from(vibes).where(and(inArray(vibes.targetId, postIds), eq(vibes.targetType, 'post')))
    : [];

  const vibesByPost = new Map<string, (typeof vibes.$inferSelect)[]>();
  for (const v of allVibes) {
    if (!vibesByPost.has(v.targetId)) vibesByPost.set(v.targetId, []);
    vibesByPost.get(v.targetId)!.push(v);
  }

  // Fetch live avatars + names so we can skip the override for alias posts
  const authorIds = allPosts.map(p => p.authorId);
  const liveAvatarInfo = await batchFetchLiveAvatarInfo(authorIds);

  const items: MoodStreamPost[] = allPosts.map(postRow => {
    const tags = taggedPosts.filter(t => t.postId === postRow.id).map(t => t.moodSlug);
    const tribeName = postRow.tribeId ? tribeMap.get(postRow.tribeId) : undefined;
    const promoterTag = taggedPosts.find(t => t.postId === postRow.id && t.promotedBy);
    const promotedByName = promoterTag?.promotedBy ? promoterMap.get(promoterTag.promotedBy) : undefined;

    // Only apply live avatar for non-alias posts
    const info = liveAvatarInfo.get(postRow.authorId);
    const isAliasPost = info && postRow.authorName !== info.name;
    const postAvatar = isAliasPost ? (postRow.authorAvatar ?? undefined) : (info?.avatar || (postRow.authorAvatar ?? undefined));

    const postVibes = vibesByPost.get(postRow.id) ?? [];
    const hasVibed = viewerUserId ? postVibes.some(v => v.userId === viewerUserId) : false;
    
    const emojiCounts = new Map<string, number>();
    for (const v of postVibes) {
      emojiCounts.set(v.emoji, (emojiCounts.get(v.emoji) ?? 0) + 1);
    }
    const recentVibes = Array.from(emojiCounts.entries())
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return {
      id: postRow.id,
      author: postRow.authorName,
      authorAvatarSrc: postAvatar,
      authorAvatarFallback: postRow.authorAvatarFallback,
      dataAiHintAvatar: postRow.dataAiHintAvatar ?? undefined,
      tribeName,
      tribeId: postRow.tribeId ?? undefined,
      timestamp: postRow.createdAt ?? new Date(),
      editedAt: postRow.editedAt ?? undefined,
      title: postRow.title ?? undefined,
      content: postRow.content,
      imageUrl: postRow.imageUrl ?? undefined,
      imageAlt: postRow.imageAlt ?? undefined,
      dataAiHintImage: postRow.dataAiHintImage ?? undefined,
      vibes: postRow.vibeCount ?? 0,
      recentVibes,
      hasVibed,
      comments: postRow.commentCount ?? 0,
      moodTags: tags,
      promotedByName,
      // Link preview
      linkUrl: postRow.linkUrl ?? undefined,
      linkTitle: postRow.linkTitle ?? undefined,
      linkDescription: postRow.linkDescription ?? undefined,
      linkImage: postRow.linkImage ?? undefined,
      linkSiteName: postRow.linkSiteName ?? undefined,
    };
  });

  const nextCursor = hasMore && items.length > 0
    ? items[items.length - 1]!.timestamp.toISOString()
    : null;

  return { items, nextCursor };
}

/**
 * Creates a new post in a tribe.
 * Image URL should already be uploaded client-side via /api/upload.
 */
export async function createTribePost(
  tribeId: string, 
  payload: { title?: string; content: string; imageUrl?: string; imageUrls?: string[] }, 
  authorId: string,
  overrides?: { name?: string; avatar?: string }
): Promise<TribePost> {
  const id = crypto.randomUUID();

  // Access control: verify the author is a member of the tribe
  const memberRows = await db.select().from(tribeMembers)
    .where(and(eq(tribeMembers.tribeId, tribeId), eq(tribeMembers.userId, authorId)))
    .limit(1);
  const member = memberRows[0];
  if (!member) {
    throw new Error('You must be a member of this tribe to create a post.');
  }

  // Fetch author info
  const authorRows = await db.select().from(users).where(eq(users.id, authorId)).limit(1);
  const author = authorRows[0];

  // Resolve identity based on bond preferences
  let { name: resolvedName, avatar: resolvedAvatar } = await resolveDisplayIdentity(
    authorId, 
    tribeId, 
    author?.name ?? 'Unknown User', 
    author?.avatar
  );

  // Apply manual overrides if provided
  if (overrides?.name) resolvedName = overrides.name;
  if (overrides?.avatar) resolvedAvatar = overrides.avatar;

  const resolvedAvatarFallback = resolvedName.substring(0, 2).toUpperCase() || '??';

  const finalImageUrl = payload.imageUrl || null;

  await db.insert(posts).values({
    id,
    tribeId,
    authorId,
    authorName: resolvedName,
    authorAvatar: resolvedAvatar,
    authorAvatarFallback: resolvedAvatarFallback,
    slug: slugify(payload.title || payload.content.substring(0, 60)) || null,
    title: payload.title || null,
    content: payload.content,
    imageUrl: payload.imageUrl || null,
    imageUrls: payload.imageUrls || null,
    imageAlt: (payload.imageUrl || (payload.imageUrls && payload.imageUrls.length > 0)) ? 'User uploaded image' : null,
    dataAiHintImage: (payload.imageUrl || (payload.imageUrls && payload.imageUrls.length > 0)) ? 'user upload' : null,
    vibeCount: 0,
    commentCount: 0,
    isRemoved: false,
    canBeReposted: true,
    createdAt: new Date(),
  });

  const finalRows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  const created = rowToTribePost(finalRows[0]!);

  // Auto-refresh: sharing keeps your tribe bond alive (fire-and-forget)
  import('./bond-service').then(({ touchBondOnActivity, strengthenBondConnection }) => {
    touchBondOnActivity(authorId, tribeId, 'tribe');
    strengthenBondConnection(authorId, tribeId, 2);
  }).catch(() => {});

  // Process @mentions (fire-and-forget)
  import('./mention-service').then(({ processMentions }) =>
    processMentions(payload.content, authorId, 'post', id)
  ).catch(() => {});

  // Notify tribe members about the new post (fire-and-forget)
  import('./realtime-dispatch').then(async ({ notifyTribePost }) => {
    const [tribe] = await db.select({ name: tribes.name, isPublic: tribes.isPublic })
      .from(tribes).where(eq(tribes.id, tribeId)).limit(1);
    const isEncrypted = tribe ? !tribe.isPublic : false;
    notifyTribePost(tribeId, authorId, resolvedName, tribe?.name ?? 'a tribe', id, isEncrypted);
  }).catch(() => {});

  return created;
}

/**
 * Reposts content.
 */
export async function repost(postToRepost: TribePost, editedContent: string): Promise<TribePost> {
  const id = crypto.randomUUID();

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
    slug: (postToRepost.title ? slugify(`Repost: ${postToRepost.title}`) : slugify(`Repost: ${editedContent.substring(0, 60)}`)) || null,
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

  const id = crypto.randomUUID();

  await db.insert(posts).values({
    id,
    tribeId: targetTribeId,
    authorId,
    authorName: displayName,
    authorAvatar: author?.avatar ?? null,
    authorAvatarFallback: displayName.substring(0, 2).toUpperCase(),
    slug: (source.title ? slugify(`Shared: ${source.title}`) : slugify('Shared Post')) || null,
    title: source.title ? `Shared: ${source.title}` : 'Shared Post',
    content: source.content,
    imageUrl: source.imageUrl,
    imageUrls: source.imageUrls,
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
): Promise<{ vibed: boolean; newCount: number; recentVibes: { emoji: string; count: number }[] }> {
  // ── Input validation ──────────────────────────────────────
  if (!targetId || typeof targetId !== 'string') {
    throw new Error('Invalid target ID');
  }
  if (!emoji || typeof emoji !== 'string' || emoji.length > 8) {
    throw new Error('Invalid emoji');
  }

  // Check if ANY vibe already exists from this user on this target
  const existing = await db.select().from(vibes).where(
    and(
      eq(vibes.userId, userId),
      eq(vibes.targetId, targetId),
      eq(vibes.targetType, targetType),
    )
  ).limit(1);

  if (existing.length > 0) {
    const existingVibe = existing[0]!;

    if (existingVibe.emoji === emoji) {
      // Same emoji clicked -> Toggle OFF (remove)
      await db.delete(vibes).where(eq(vibes.id, existingVibe.id));

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

      // Get new count and recent vibes
      const newCount = targetType === 'post'
        ? (await db.select({ c: posts.vibeCount }).from(posts).where(eq(posts.id, targetId)))[0]?.c ?? 0
        : (await db.select({ c: comments.vibeCount }).from(comments).where(eq(comments.id, targetId)))[0]?.c ?? 0;

      const postVibes = await db.select().from(vibes).where(and(eq(vibes.targetId, targetId), eq(vibes.targetType, targetType)));
      const emojiCounts = new Map<string, number>();
      for (const v of postVibes) {
        emojiCounts.set(v.emoji, (emojiCounts.get(v.emoji) ?? 0) + 1);
      }
      const recentVibes = Array.from(emojiCounts.entries())
        .map(([emoji, count]) => ({ emoji, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      return { vibed: false, newCount, recentVibes };
    } else {
      // Different emoji clicked -> REPLACE
      await db.update(vibes).set({ 
        emoji, 
        createdAt: new Date() 
      }).where(eq(vibes.id, existingVibe.id));

      // Count stays the same, so we don't update posts/comments table.
      
      const newCount = targetType === 'post'
        ? (await db.select({ c: posts.vibeCount }).from(posts).where(eq(posts.id, targetId)))[0]?.c ?? 0
        : (await db.select({ c: comments.vibeCount }).from(comments).where(eq(comments.id, targetId)))[0]?.c ?? 0;

      const postVibes = await db.select().from(vibes).where(and(eq(vibes.targetId, targetId), eq(vibes.targetType, targetType)));
      const emojiCounts = new Map<string, number>();
      for (const v of postVibes) {
        emojiCounts.set(v.emoji, (emojiCounts.get(v.emoji) ?? 0) + 1);
      }
      const recentVibes = Array.from(emojiCounts.entries())
        .map(([emoji, count]) => ({ emoji, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      return { vibed: true, newCount, recentVibes };
    }
  } else {
    // No vibe exists -> Add new
    const id = crypto.randomUUID();
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

    const postVibes = await db.select().from(vibes).where(and(eq(vibes.targetId, targetId), eq(vibes.targetType, targetType)));
    const emojiCounts = new Map<string, number>();
    for (const v of postVibes) {
      emojiCounts.set(v.emoji, (emojiCounts.get(v.emoji) ?? 0) + 1);
    }
    const recentVibes = Array.from(emojiCounts.entries())
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // Auto-refresh: vibing keeps your tribe bond alive (fire-and-forget)
    if (targetType === 'post') {
      const [vibePost] = await db.select({ tribeId: posts.tribeId }).from(posts)
        .where(eq(posts.id, targetId)).limit(1);
      if (vibePost?.tribeId) {
        import('./bond-service').then(({ touchBondOnActivity, strengthenBondConnection }) => {
          touchBondOnActivity(userId, vibePost.tribeId!, 'tribe');
          strengthenBondConnection(userId, vibePost.tribeId!, 1);
        }).catch(() => {});
      }
    }

    // Notify the content author about the vibe (fire-and-forget)
    import('./realtime-dispatch').then(async ({ notifyVibe }) => {
      const [author] = await db.select({ name: users.name }).from(users)
        .where(eq(users.id, userId)).limit(1);
      const viberName = author?.name ?? 'Someone';

      if (targetType === 'post') {
        const [vibeTarget] = await db.select({ authorId: posts.authorId, tribeId: posts.tribeId })
          .from(posts).where(eq(posts.id, targetId)).limit(1);
        if (vibeTarget) {
          notifyVibe(vibeTarget.authorId, userId, viberName, emoji, 'post', vibeTarget.tribeId, targetId);
        }
      } else {
        const [vibeTarget] = await db.select({ authorId: comments.authorId, postId: comments.postId })
          .from(comments).where(eq(comments.id, targetId)).limit(1);
        if (vibeTarget) {
          const [parentPost] = await db.select({ tribeId: posts.tribeId })
            .from(posts).where(eq(posts.id, vibeTarget.postId)).limit(1);
          notifyVibe(vibeTarget.authorId, userId, viberName, emoji, 'comment', parentPost?.tribeId ?? null, vibeTarget.postId);
        }
      }
    }).catch(() => {});

    return { vibed: true, newCount, recentVibes };
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
    .orderBy(comments.createdAt);
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
  encryption?: { ciphertext: Buffer; iv: string },
): Promise<DiscussionComment> {
  // Fetch author info
  const [author] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!author) throw new Error('User not found');

  const id = crypto.randomUUID();

  // We need to know the tribeId to resolve identity
  const [parentPost] = await db.select({ tribeId: posts.tribeId }).from(posts)
    .where(eq(posts.id, postId)).limit(1);
    
  const { name: resolvedName, avatar: resolvedAvatar } = await resolveDisplayIdentity(
    userId, 
    parentPost?.tribeId || null, 
    author.name ?? 'Unknown', 
    author.avatar
  );

  const initials = resolvedName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  await db.insert(comments).values({
    id,
    postId,
    parentCommentId: parentCommentId ?? null,
    authorId: userId,
    authorName: resolvedName,
    authorAvatar: resolvedAvatar,
    authorAvatarFallback: initials,
    content: encryption ? '[encrypted]' : content,
    // E2E encryption fields
    ciphertext: encryption?.ciphertext ?? null,
    isEncrypted: !!encryption,
    encryptionIv: encryption?.iv ?? null,
    vibeCount: 0,
    createdAt: new Date(),
  });

  // Increment post comment count
  await db.update(posts).set({
    commentCount: sql`${posts.commentCount} + 1`,
  }).where(eq(posts.id, postId));

  if (parentPost?.tribeId) {
    import('./bond-service').then(({ touchBondOnActivity, strengthenBondConnection }) => {
      touchBondOnActivity(userId, parentPost.tribeId!, 'tribe');
      strengthenBondConnection(userId, parentPost.tribeId!, 1);
    }).catch(() => {});
  }

  // Process @mentions (fire-and-forget)
  import('./mention-service').then(({ processMentions }) =>
    processMentions(content, userId, 'comment', id)
  ).catch(() => {});

  // Notify post author + parent comment author about the new comment (fire-and-forget)
  import('./realtime-dispatch').then(async ({ notifyComment, notifyCommentReply }) => {
    const [post] = await db.select({ authorId: posts.authorId })
      .from(posts).where(eq(posts.id, postId)).limit(1);
    if (post) {
      notifyComment(post.authorId, userId, resolvedName, postId, parentPost?.tribeId ?? null, id);
    }
    // For threaded replies, also notify the parent comment author
    if (parentCommentId) {
      const [parentCmt] = await db.select({ authorId: comments.authorId })
        .from(comments).where(eq(comments.id, parentCommentId)).limit(1);
      if (parentCmt && parentCmt.authorId !== post?.authorId) {
        notifyCommentReply(parentCmt.authorId, userId, resolvedName, postId, parentPost?.tribeId ?? null, id);
      }
    }
  }).catch(() => {});

  return {
    id,
    authorId: userId,
    authorName: resolvedName,
    authorAvatar: resolvedAvatar ?? undefined,
    authorAvatarFallback: initials,
    content,
    vibes: 0,
    timestamp: new Date(),
    replies: [],
    // Pass encryption metadata back to client for immediate display
    isEncrypted: !!encryption,
    ciphertextBase64: encryption ? encryption.ciphertext.toString('base64') : undefined,
    encryptionIv: encryption?.iv,
  };
}

