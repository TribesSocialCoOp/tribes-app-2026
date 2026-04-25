'use server';

import { requireAuth, requireVerifiedEmail, getCurrentUserId, trackContribution } from './shared';
import type { TribePost, MoodStreamPost, ReportedPost, Tribe, StoryTopic, SourceArticle, DiscussionComment, Ring, CommunicationItem } from '@/lib/types';
import type { PostFormValues } from '@/components/dialogs/create-post-dialog';
import { postLimiter, commentLimiter, rsvpLimiter } from '@/lib/auth/rate-limit';

/**
 * Server action: Fetch the unified feed with ring + mood filtering.
 */
export async function getUnifiedFeedAction(
  ringFilter?: Ring | 'all' | 'streams',
  moodSlugs?: string[],
  limit?: number,
  offset?: number,
): Promise<CommunicationItem[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const { getUnifiedFeed } = await import('@/lib/services/feed-service');
  return getUnifiedFeed({ userId, ringFilter, moodSlugs, limit, offset });
}

/**
 * Server action: Toggle pinnedToWall on a post (must be owned by current user).
 */
export async function togglePinToWall(postId: string): Promise<{ pinned: boolean }> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { posts } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const [post] = await db.select({ pinnedToWall: posts.pinnedToWall, authorId: posts.authorId })
    .from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) throw new Error('Post not found');
  if (post.authorId !== userId) throw new Error('Not authorized');

  const newPinned = !post.pinnedToWall;
  await db.update(posts).set({ pinnedToWall: newPinned }).where(eq(posts.id, postId));
  return { pinned: newPinned };
}

/**
 * Server action: Get pinned wall posts for a user (their journal posts where pinnedToWall=true).
 */
export async function getPinnedWallPosts(targetUserId?: string): Promise<TribePost[]> {
  const userId = targetUserId ?? await getCurrentUserId();
  if (!userId) return [];

  const { db } = await import('@/db');
  const { posts } = await import('@/db/schema');
  const { eq, and, desc } = await import('drizzle-orm');
  const { rowToTribePost } = await import('@/lib/mappers/post-mapper');

  const rows = await db.select().from(posts)
    .where(and(
      eq(posts.authorId, userId),
      eq(posts.pinnedToWall, true),
    ))
    .orderBy(desc(posts.createdAt))
    .limit(20);

  return rows.map(row => rowToTribePost(row));
}

/**
 * Server action: Get user's most recent mood tag (from their latest post with a mood).
 */
export async function getCurrentMood(): Promise<{ moodTag: string; postId: string } | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { db } = await import('@/db');
  const { posts } = await import('@/db/schema');
  const { eq, and, isNotNull, desc } = await import('drizzle-orm');

  const [row] = await db.select({ id: posts.id, moodTag: posts.moodTag })
    .from(posts)
    .where(and(eq(posts.authorId, userId), isNotNull(posts.moodTag)))
    .orderBy(desc(posts.createdAt))
    .limit(1);

  if (!row || !row.moodTag) return null;
  return { moodTag: row.moodTag, postId: row.id };
}

/** Serializable payload for creating a tribe post (image already uploaded client-side). */
export interface CreatePostPayload {
  title?: string;
  content: string;
  imageUrl?: string;
}

/** Payload for universal ring-based post creation (Concentric Rings). */
export interface CreateRingPostPayload {
  content: string;
  ring: 'journal' | 'inner_circle' | 'my_people' | 'tribes';
  title?: string;
  imageUrl?: string;
  moodTag?: string;
  tribeIds?: string[]; // Required when ring = 'tribes'
}

/**
 * Universal post creation — routes to the correct ring.
 * This is the primary compose action for the Concentric Rings model.
 */
export async function createRingPost(payload: CreateRingPostPayload): Promise<TribePost> {
  const userId = await requireVerifiedEmail();
  await postLimiter.check(userId);

  if (!payload.content.trim()) throw new Error('Post content cannot be empty.');

  const { db } = await import('@/db');
  const { posts, users: usersTable, tribeMembers } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');
  const { rowToTribePost } = await import('@/lib/mappers/post-mapper');

  // Fetch author info
  const [author] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const authorName = author?.name ?? 'Unknown User';
  const initials = (authorName.substring(0, 2)).toUpperCase();

  if (payload.ring === 'tribes') {
    // Tribe ring — reuse existing createTribePost for the first tribe,
    // then cross-post to additional tribes
    if (!payload.tribeIds || payload.tribeIds.length === 0) {
      throw new Error('Select at least one tribe to post to.');
    }

    // Create the primary post in the first tribe
    const { createTribePost: fn } = await import('@/lib/services/post-service');
    const primaryPost = await fn(payload.tribeIds[0]!, {
      title: payload.title,
      content: payload.content.trim(),
      imageUrl: payload.imageUrl,
    }, userId);

    // Update with ring metadata
    await db.update(posts).set({
      ring: 'tribes',
      moodTag: payload.moodTag ?? null,
    }).where(eq(posts.id, primaryPost.id));

    // Cross-post to additional tribes
    if (payload.tribeIds.length > 1) {
      const { sharePostToTribe } = await import('@/lib/services/post-service');
      for (const tribeId of payload.tribeIds.slice(1)) {
        await sharePostToTribe(primaryPost.id, tribeId, userId, 'main_profile');
      }
    }

    trackContribution(userId, 'post', primaryPost.id, `Posted to tribe(s)`);
    return { ...primaryPost, ring: 'tribes', moodTag: payload.moodTag };
  }

  // Non-tribe rings: journal, inner_circle, my_people
  const id = `post-${payload.ring}-${Date.now()}`;
  await db.insert(posts).values({
    id,
    tribeId: null, // No tribe for non-tribe rings
    authorId: userId,
    authorName,
    authorAvatar: author?.avatar ?? null,
    authorAvatarFallback: initials,
    title: payload.title || null,
    content: payload.content.trim(),
    imageUrl: payload.imageUrl || null,
    imageAlt: payload.imageUrl ? 'User uploaded image' : null,
    dataAiHintImage: payload.imageUrl ? 'user upload' : null,
    vibeCount: 0,
    commentCount: 0,
    isRemoved: false,
    canBeReposted: payload.ring !== 'journal', // Journal posts are private, not repostable
    ring: payload.ring,
    moodTag: payload.moodTag ?? null,
    pinnedToWall: false,
    createdAt: new Date(),
  });

  const [created] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  const result = rowToTribePost(created!);

  // Process @mentions for non-journal posts
  if (payload.ring !== 'journal') {
    import('@/lib/services/mention-service').then(({ processMentions }) =>
      processMentions(payload.content, userId, 'post', id)
    ).catch(() => {});
  }

  trackContribution(userId, 'post', id, `Posted to ${payload.ring}`);
  return result;
}

/**
 * Returns a lightweight list of the user's tribes for the compose tribe selector.
 */
export async function getMyTribesList(): Promise<{ id: string; name: string; slug: string | null; description: string | null; cover: string | null; isPublic: boolean; members: number }[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const { db } = await import('@/db');
  const { tribeMembers, tribes } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');

  const memberRows = await db.select({ tribeId: tribeMembers.tribeId })
    .from(tribeMembers)
    .where(eq(tribeMembers.userId, userId));

  const results: { id: string; name: string; slug: string | null; description: string | null; cover: string | null; isPublic: boolean; members: number }[] = [];
  for (const row of memberRows) {
    const [tribe] = await db.select({
      id: tribes.id,
      name: tribes.name,
      slug: tribes.slug,
      description: tribes.description,
      cover: tribes.cover,
      isPublic: tribes.isPublic,
      members: tribes.memberCount,
    })
      .from(tribes)
      .where(eq(tribes.id, row.tribeId))
      .limit(1);
    if (tribe) results.push({ ...tribe, isPublic: tribe.isPublic ?? true, members: tribe.members ?? 0 });
  }
  return results;
}

// ======== STORIES ========
export async function getStoryTopics(): Promise<StoryTopic[]> {
  const { getStoryTopics: fn } = await import('@/lib/data-access/stories');
  return fn();
}

export async function getStoryTopicById(storyId: string): Promise<StoryTopic | null> {
  const { getStoryTopicById: fn } = await import('@/lib/data-access/stories');
  return fn(storyId);
}

export async function getArticlesForStory(storyId: string): Promise<SourceArticle[]> {
  const { getArticlesForStory: fn } = await import('@/lib/data-access/stories');
  return fn(storyId);
}

export async function getCommentsForStory(storyId: string): Promise<DiscussionComment[]> {
  const { getCommentsForStory: fn } = await import('@/lib/data-access/stories');
  return fn(storyId);
}

// ======== POST SERVICE ========
export async function getPostsForTribe(tribeId: string): Promise<TribePost[]> {
  const userId = await getCurrentUserId();

  // SECURITY: Gate private tribe content to members only
  const { getTribeById: fetchTribe } = await import('@/lib/data-access/tribes');
  const tribe = await fetchTribe(tribeId, userId); // respects visibility
  if (!tribe) {
    // Either doesn't exist or the viewer has no access to this private tribe
    throw new Error('Tribe not found or access denied.');
  }

  const { getPostsForTribe: fn } = await import('@/lib/services/post-service');
  return fn(tribeId, userId ?? undefined);
}

export async function getMoodStreamPosts(): Promise<MoodStreamPost[]> {
  const userId = await getCurrentUserId();
  const { getMoodStreamPosts: fn } = await import('@/lib/services/post-service');
  return fn(userId ?? undefined);
}

export async function createTribePost(tribeId: string, payload: CreatePostPayload): Promise<TribePost> {
  const userId = await requireVerifiedEmail();
  await postLimiter.check(userId);
  const { createTribePost: fn } = await import('@/lib/services/post-service');
  const result = await fn(tribeId, payload, userId);
  trackContribution(userId, 'post', result.id, `Posted in tribe`);
  return result;
}

export async function repost(postToRepost: TribePost, editedContent: string): Promise<TribePost> {
  const userId = await requireAuth();
  await postLimiter.check(userId);
  const { repost: fn } = await import('@/lib/services/post-service');
  return fn(postToRepost, editedContent);
}

export async function promotePostToMoods(postId: string, moodSlugs: string[]): Promise<void> {
  const userId = await requireAuth();
  const { promotePostToMoods: fn } = await import('@/lib/services/post-service');
  return fn(postId, moodSlugs, userId);
}

// ======== VIBES ========
export async function toggleVibe(targetId: string, targetType: 'post' | 'comment', emoji: string = '❤️') {
  const userId = await requireAuth();
  await rsvpLimiter.check(userId);
  const { toggleVibe: fn } = await import('@/lib/services/post-service');
  const result = await fn(userId, targetId, targetType, emoji);
  // Track vibe contribution (only when adding, not removing)
  if (result.vibed) {
    trackContribution(userId, 'vibe_given', targetId, `Vibed on ${targetType}`);
  }
  return result;
}

// ======== COMMENTS ========
export async function createComment(postId: string, content: string, parentCommentId?: string) {
  const userId = await requireVerifiedEmail();
  await commentLimiter.check(userId);
  if (!content.trim()) throw new Error('Comment cannot be empty');
  const { createComment: fn } = await import('@/lib/services/post-service');
  const comment = await fn(postId, userId, content.trim(), parentCommentId);
  // Fire-and-forget contribution tracking (comment type, not post)
  trackContribution(userId, 'comment', comment.id, `Commented on post ${postId}`);
  return comment;
}

export async function getCommentsForPost(postId: string) {
  const userId = await getCurrentUserId();

  // SECURITY: Resolve the parent post's tribe and gate on private tribe membership
  const { db } = await import('@/db');
  const { posts } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [post] = await db.select({ tribeId: posts.tribeId }).from(posts).where(eq(posts.id, postId)).limit(1);
  if (post) {
    if (post.tribeId) {
      const { getTribeById: fetchTribe } = await import('@/lib/data-access/tribes');
      const tribe = await fetchTribe(post.tribeId, userId);
      if (!tribe) throw new Error('Tribe not found or access denied.');
    }
  }

  const { getCommentsForPost: fn } = await import('@/lib/services/post-service');
  return fn(postId);
}

// ======== MODERATION SERVICE ========
export async function reportPost(payload: { postId: string; postTitle?: string; reporterName: string; reason: string }): Promise<ReportedPost> {
  const userId = await requireAuth();
  const { reportPost: fn } = await import('@/lib/services/moderation-service');
  const result = await fn(payload, userId);
  // NOTE: Moderation points are NOT awarded here.
  // Points are awarded only when the report is upheld (via awardModerationPoints).
  return result;
}

export async function reportComment(payload: { commentId: string; commentAuthor: string; reason: string }): Promise<void> {
  const userId = await requireAuth();
  const { reportComment: fn } = await import('@/lib/services/moderation-service');
  await fn(payload, userId);
  // NOTE: Moderation points are NOT awarded here.
  // Points are awarded only when the report is upheld (via awardModerationPoints).
}

export async function dismissReport(postId: string): Promise<void> {
  const userId = await requireAuth();
  // Look up the post's tribe to verify moderation access
  const { db } = await import('@/db');
  const { posts } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [post] = await db.select({ tribeId: posts.tribeId }).from(posts).where(eq(posts.id, postId)).limit(1);
  if (post) {
    if (post.tribeId) {
      const { requireTribeSpeaker } = await import('@/lib/services/tribe-auth');
      await requireTribeSpeaker(userId, post.tribeId);
    }
  }
  const { dismissReport: fn } = await import('@/lib/services/moderation-service');
  return fn(postId);
}

export async function escalateReport(postId: string): Promise<void> {
  // SECURITY: Only platform admins may escalate reports globally
  const { requireAdmin } = await import('./shared');
  await requireAdmin();
  const { escalateReport: fn } = await import('@/lib/services/moderation-service');
  return fn(postId);
}

export async function removePost(payload: { postId: string; reason: string; preventRepost: boolean }): Promise<void> {
  const userId = await requireAuth();
  // Look up the post's tribe to verify moderation access
  const { db } = await import('@/db');
  const { posts } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [post] = await db.select({ tribeId: posts.tribeId }).from(posts).where(eq(posts.id, payload.postId)).limit(1);
  if (post) {
    if (post.tribeId) {
      const { requireTribeSpeaker } = await import('@/lib/services/tribe-auth');
      await requireTribeSpeaker(userId, post.tribeId);
    }
  }
  const { removePost: fn } = await import('@/lib/services/moderation-service');
  await fn(payload);

  // Award moderation points to whoever reported this post (report upheld!)
  try {
    const { getReportForPost } = await import('@/lib/services/moderation-service');
    const report = await getReportForPost(payload.postId);
    if (report?.reportedBy && report.reportedBy !== userId) {
      const { awardModerationPoints } = await import('@/lib/services/contribution-service');
      await awardModerationPoints(report.reportedBy, payload.postId);
    }
  } catch { /* best-effort */ }
}

/**
 * Allows a post author to delete their own post.
 * This is a permanent deletion, not a moderation action.
 */
export async function deleteOwnPost(postId: string): Promise<void> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { posts } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [post] = await db.select({ authorId: posts.authorId }).from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) throw new Error('Post not found.');
  if (post.authorId !== userId) throw new Error('You can only delete your own posts.');
  await db.delete(posts).where(eq(posts.id, postId));
}

export async function sharePost(payload: {
  postId: string;
  tribeShares: Record<string, string>; // { tribeName: persona }
}): Promise<void> {
  const userId = await requireAuth();
  const { getMyTribes } = await import('./tribe-actions');
  const myTribes = await getMyTribes();

  // Resolve tribe names to IDs and share to each
  for (const [tribeName, persona] of Object.entries(payload.tribeShares)) {
    const tribe = myTribes.find(t => t.name === tribeName);
    if (!tribe) continue; // Skip tribes we're not a member of
    const { sharePostToTribe } = await import('@/lib/services/post-service');
    await sharePostToTribe(payload.postId, tribe.id, userId, persona);
  }
}

export async function banMemberFromTribe(payload: { tribeId: string; memberId: string; reason: string; duration: string }): Promise<void> {
  const userId = await requireAuth();
  // Only founders (and platform admins) can ban members
  const { requireTribeFounder } = await import('@/lib/services/tribe-auth');
  await requireTribeFounder(userId, payload.tribeId);
  const { banMemberFromTribe: fn } = await import('@/lib/services/moderation-service');
  return fn(payload);
}

export async function banUser(payload: {
  userId: string;
  reason?: string;
  duration: '1_day' | '7_days' | '30_days' | 'permanent';
  relatedPostId?: string;
  forceLogout?: boolean;
}): Promise<void> {
  const { requireAdmin } = await import('./shared');
  const adminId = await requireAdmin();
  const { banUser: fn } = await import('@/lib/services/moderation-service');
  return fn(adminId, payload);
}

export async function getActiveReportedPostIds(): Promise<Set<string>> {
  const { getActiveReportedPostIds: fn } = await import('@/lib/services/moderation-service');
  return fn();
}

export async function getActiveReportsForTribe(tribeId: string): Promise<{ tribe: Tribe | null; reports: ReportedPost[]; posts: TribePost[] }> {
  // SECURITY: Must be at least a tribe speaker to view reports for a tribe
  const userId = await requireAuth();
  const { requireTribeSpeaker } = await import('@/lib/services/tribe-auth');
  await requireTribeSpeaker(userId, tribeId);
  const { getActiveReportsForTribe: fn } = await import('@/lib/services/moderation-service');
  return fn(tribeId);
}

export async function getActiveGlobalReports(): Promise<{ reports: ReportedPost[]; posts: TribePost[]; tribes: Tribe[] }> {
  // SECURITY: Only platform admins may view the global moderation queue
  const { requireAdmin } = await import('./shared');
  await requireAdmin();
  const { getActiveGlobalReports: fn } = await import('@/lib/services/moderation-service');
  return fn();
}

// ======== SEARCH ========
export async function searchAll(query: string) {
  if (!query || query.trim().length < 2) return { tribes: [], events: [], users: [] };
  const { searchAll: fn } = await import('@/lib/services/search-service');
  return fn(query.trim());
}

// ======== MESSAGING ========
export async function sendMessage(bondId: string, ciphertextBase64: string) {
  const userId = await requireAuth();
  await postLimiter.check(userId);
  const { sendMessage: fn } = await import('@/lib/services/message-service');
  return fn(bondId, userId, ciphertextBase64);
}

export async function getMessagesForBond(bondId: string, limit?: number, beforeTimestamp?: Date) {
  const userId = await requireAuth();
  const { getMessages: fn } = await import('@/lib/services/message-service');
  return fn(bondId, userId, limit, beforeTimestamp);
}

export async function markMessagesRead(bondId: string) {
  const userId = await requireAuth();
  const { markRead: fn } = await import('@/lib/services/message-service');
  return fn(bondId, userId);
}

export async function getUnreadMessageCount() {
  const userId = await getCurrentUserId();
  if (!userId) return 0;
  const { getUnreadCount: fn } = await import('@/lib/services/message-service');
  return fn(userId);
}

export async function getLatestMessagePreview(bondId: string) {
  const { getLatestMessage: fn } = await import('@/lib/services/message-service');
  return fn(bondId);
}

export async function getMessagesByDateRange(bondId: string, startDate: Date, endDate: Date, limit?: number) {
  const userId = await requireAuth();
  const { getMessagesByDateRange: fn } = await import('@/lib/services/message-service');
  return fn(bondId, userId, startDate, endDate, limit);
}

// ======== NOTIFICATIONS ========
export async function getActivityFeed() {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const { getActivityFeed: fn } = await import('@/lib/services/notification-service');
  return fn(userId);
}

export async function getUnreadActivityCount() {
  const userId = await getCurrentUserId();
  if (!userId) return 0;
  const { getUnreadActivityCount: fn } = await import('@/lib/services/notification-service');
  return fn(userId);
}

export async function getNotificationPreferences() {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const { getPreferences: fn } = await import('@/lib/services/notification-service');
  return fn(userId);
}

export async function saveNotificationPreferences(prefs: {
  pushEnabled?: boolean;
  emailEnabled?: boolean;
  mentionsEnabled?: boolean;
  bondMessagesEnabled?: boolean;
  tribeActivityEnabled?: boolean;
  eventRemindersEnabled?: boolean;
}) {
  const userId = await requireAuth();
  const { savePreferences: fn } = await import('@/lib/services/notification-service');
  return fn(userId, prefs);
}

// ======== STORY CREATION ========
export async function createStoryTopicAction(data: {
  title: string;
  summary: string;
  category: 'local' | 'national' | 'global';
  coverImage?: string;
}): Promise<{ id: string }> {
  const userId = await requireAuth();
  await postLimiter.check(userId);

  // Require Active reputation or higher to create stories
  const { meetsReputationGate } = await import('@/lib/constants');
  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [user] = await db.select({ reputationStatus: users.reputationStatus })
    .from(users).where(eq(users.id, userId)).limit(1);

  if (!meetsReputationGate(user?.reputationStatus, 'Active')) {
    throw new Error('You need Active reputation status or higher to create a story topic.');
  }

  if (!data.title?.trim() || !data.summary?.trim()) {
    throw new Error('Title and summary are required.');
  }

  const { createStoryTopic: fn } = await import('@/lib/services/story-service');
  const result = await fn(userId, {
    title: data.title.trim(),
    summary: data.summary.trim(),
    category: data.category,
    coverImage: data.coverImage,
  });

  trackContribution(userId, 'post', result.id, `Created story: ${data.title}`);
  return result;
}

export async function addSourceArticleAction(storyId: string, data: {
  title: string;
  url: string;
  sourceName: string;
  summarySnippet?: string;
}): Promise<{ id: string }> {
  const userId = await requireAuth();
  await postLimiter.check(userId);

  if (!data.title?.trim() || !data.url?.trim() || !data.sourceName?.trim()) {
    throw new Error('Title, URL, and source name are required.');
  }

  const { addSourceArticle: fn } = await import('@/lib/services/story-service');
  return fn(storyId, {
    title: data.title.trim(),
    url: data.url.trim(),
    sourceName: data.sourceName.trim(),
    summarySnippet: data.summarySnippet?.trim(),
  });
}

// ======== STORY COMMENTS ========
export async function createStoryComment(storyId: string, content: string, parentCommentId?: string) {
  const userId = await requireAuth();
  await commentLimiter.check(userId);
  if (!content.trim()) throw new Error('Comment cannot be empty');
  const { createStoryComment: fn } = await import('@/lib/services/story-service');
  return fn(storyId, userId, content.trim(), parentCommentId);
}

// ======== PUSH NOTIFICATIONS ========
export async function registerPushSubscriptionAction(subscription: {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
}) {
  const userId = await requireAuth();
  const { registerPushSubscription: fn } = await import('@/lib/services/push-service');
  return fn(userId, subscription);
}

export async function removePushSubscriptionAction() {
  const userId = await requireAuth();
  const { removePushSubscription: fn } = await import('@/lib/services/push-service');
  return fn(userId);
}

export async function hasPushSubscription() {
  const userId = await getCurrentUserId();
  if (!userId) return false;
  const { hasActivePushSubscription: fn } = await import('@/lib/services/push-service');
  return fn(userId);
}
