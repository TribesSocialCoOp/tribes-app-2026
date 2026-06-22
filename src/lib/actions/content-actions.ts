'use server';

import { requireAuth, requireVerifiedEmail, getCurrentUserId, trackContribution } from './shared';
import { withPublicErrors } from './error-utils';
import type { TribePost, MoodStreamPost, ReportedPost, Tribe, StoryTopic, SourceArticle, DiscussionComment, Ring, CommunicationItem, PaginatedResult } from '@/lib/types';
import type { PostFormValues } from '@/components/dialogs/create-post-dialog';
import { postLimiter, commentLimiter, rsvpLimiter, vibeLimiter } from '@/lib/auth/rate-limit';
import { slugify } from '@/lib/utils/slugify';

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

  const [post] = await db.select({ 
    pinnedToWall: posts.pinnedToWall, 
    authorId: posts.authorId,
    isEncrypted: posts.isEncrypted
  })
    .from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) throw new Error('Post not found');
  if (post.authorId !== userId) throw new Error('Not authorized');

  // Guard: Encrypted posts cannot be directly pinned to the public wall.
  // They must go through the clone-to-wall workflow.
  if (post.isEncrypted) {
    throw new Error('Encrypted posts cannot be directly pinned. Please use the clone-to-wall workflow.');
  }

  const newPinned = !post.pinnedToWall;
  await db.update(posts).set({ pinnedToWall: newPinned }).where(eq(posts.id, postId));
  return { pinned: newPinned };
}

/**
 * Server action: Create a plaintext clone of an encrypted post for the public wall.
 */
export async function pinEncryptedPostToWall(
  postId: string, 
  plaintextContent: string, 
  plaintextTitle?: string
): Promise<TribePost> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { posts } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const { rowToTribePost } = await import('@/lib/mappers/post-mapper');

  // 1. Fetch source post to verify authorship and encryption status
  const [sourcePost] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!sourcePost) throw new Error('Source post not found');
  if (sourcePost.authorId !== userId) throw new Error('Not authorized');
  if (!sourcePost.isEncrypted) throw new Error('Post is not encrypted');

  // 2. Guard against duplicate clones
  const { and } = await import('drizzle-orm');
  const [existingClone] = await db.select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.originalPostId, postId), eq(posts.authorId, userId), eq(posts.pinnedToWall, true)))
    .limit(1);
  if (existingClone) throw new Error('This post has already been cloned to your wall');

  // 3. Create the standalone plaintext clone
  const cloneId = crypto.randomUUID();
  await db.insert(posts).values({
    id: cloneId,
    authorId: userId,
    authorName: sourcePost.authorName,
    authorAvatar: sourcePost.authorAvatar,
    authorAvatarFallback: sourcePost.authorAvatarFallback,
    content: plaintextContent,
    title: plaintextTitle || sourcePost.title || null,
    ring: 'journal', // Wall clones live in the journal ring
    pinnedToWall: true,
    isEncrypted: false, // CLONE IS PLAINTEXT
    originalPostId: postId, // Link back to source
    moodTag: sourcePost.moodTag,
    imageUrl: sourcePost.imageUrl,
    imageUrls: sourcePost.imageUrls,
    createdAt: new Date(),
  });

  const [created] = await db.select().from(posts).where(eq(posts.id, cloneId)).limit(1);
  return rowToTribePost(created!);
}

/**
 * Server action: Delete a wall clone (effectively unpinning it).
 */
export async function unpinWallClone(wallPostId: string): Promise<{ success: boolean }> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { posts } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const [post] = await db.select({ authorId: posts.authorId, originalPostId: posts.originalPostId })
    .from(posts).where(eq(posts.id, wallPostId)).limit(1);
  
  if (!post) throw new Error('Clone not found');
  if (post.authorId !== userId) throw new Error('Not authorized');
  if (!post.originalPostId) throw new Error('This is not a wall clone');

  await db.delete(posts).where(eq(posts.id, wallPostId));
  return { success: true };
}


/**
 * Server action: Get routing context for a post (for deep linking redirects).
 * Returns tribe metadata if it's a tribe post, or ring context if it's a personal post.
 */
export async function getPostContext(postId: string): Promise<{
  tribeId: string | null;
  tribeSlug: string | null;
  ring: string;
  authorId: string;
} | null> {
  const { db } = await import('@/db');
  const { posts, tribes } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');

  const [row] = await db.select({
    tribeId: posts.tribeId,
    tribeSlug: tribes.slug,
    ring: posts.ring,
    authorId: posts.authorId,
  })
    .from(posts)
    .leftJoin(tribes, eq(posts.tribeId, tribes.id))
    .where(eq(posts.id, postId))
    .limit(1);

  if (!row) return null;

  return {
    tribeId: row.tribeId,
    tribeSlug: row.tribeSlug,
    ring: row.ring ?? 'tribes',
    authorId: row.authorId,
  };
}

/**
 * Server action: Fetch a single post by ID with full context for the standalone post page.
 * Returns the post, its tribe context, viewer membership, and author's role.
 */
export async function getPostById(postId: string): Promise<{
  post: TribePost;
  tribeName: string | null;
  tribeSlug: string | null;
  tribeId: string | null;
  isPublic: boolean;
  authorRole: 'founder' | 'speaker' | 'member';
  viewerRole: 'founder' | 'speaker' | 'member' | null;
  viewerIsMember: boolean;
} | null> {
  const userId = await getCurrentUserId();
  const { db } = await import('@/db');
  const { posts, tribes, tribeMembers, vibes, comments, users } = await import('@/db/schema');
  const { eq, and, inArray } = await import('drizzle-orm');
  const { rowToTribePost } = await import('@/lib/mappers/post-mapper');

  console.log(`[getPostById] Fetching post ${postId} for user ${userId}`);
  const [row] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!row) {
    console.warn(`[getPostById] Post ${postId} not found in database.`);
    return null;
  }
  if (row.isRemoved) {
    console.warn(`[getPostById] Post ${postId} is marked as removed.`);
    return null;
  }

  // Fetch tribe context
  let tribeName: string | null = null;
  let tribeSlug: string | null = null;
  let isPublic = true;
  let viewerIsMember = false;
  let authorRole: 'founder' | 'speaker' | 'member' = 'member';
  let viewerRole: 'founder' | 'speaker' | 'member' | null = null;

  if (row.tribeId) {
    const [tribe] = await db.select({ name: tribes.name, slug: tribes.slug, isPublic: tribes.isPublic })
      .from(tribes).where(eq(tribes.id, row.tribeId)).limit(1);
    if (tribe) {
      tribeName = tribe.name;
      tribeSlug = tribe.slug;
      isPublic = tribe.isPublic ?? true;
    }

    // Check viewer membership
    if (userId) {
      const [membership] = await db.select({ role: tribeMembers.role })
        .from(tribeMembers)
        .where(and(eq(tribeMembers.tribeId, row.tribeId), eq(tribeMembers.userId, userId)))
        .limit(1);
      viewerIsMember = !!membership;
      if (membership) {
        viewerRole = membership.role as 'founder' | 'speaker' | 'member';
      }
    }

    // Security: private tribe posts are only visible to members
    if (!isPublic && !viewerIsMember) {
      console.warn(`[getPostById] Access denied to private post ${postId} in tribe ${row.tribeId} for user ${userId}`);
      return null;
    }

    // Fetch author role
    const [authorMember] = await db.select({ role: tribeMembers.role })
      .from(tribeMembers)
      .where(and(eq(tribeMembers.tribeId, row.tribeId), eq(tribeMembers.userId, row.authorId)))
      .limit(1);
    if (authorMember) authorRole = authorMember.role as 'founder' | 'speaker' | 'member';
  }

  // Fetch comments
  const { getCommentsForPost: fetchCommentsService } = await import('@/lib/services/post-service');
  const commentsData = await fetchCommentsService(postId, userId ?? undefined, row.authorId);

  // Fetch vibes (join with users to get reactor names)
  const allVibes = await db.select({
    id: vibes.id,
    userId: vibes.userId,
    targetId: vibes.targetId,
    emoji: vibes.emoji,
    userName: users.name,
  })
  .from(vibes)
  .leftJoin(users, eq(vibes.userId, users.id))
  .where(and(eq(vibes.targetId, postId), eq(vibes.targetType, 'post')));

  const hasVibed = userId ? allVibes.some(v => v.userId === userId) : false;
  const selectedVibe = userId
    ? (allVibes.find(v => v.userId === userId)?.emoji ?? null)
    : null;
  const { computeRecentVibes } = await import('@/lib/services/post-service');
  const recentVibes = computeRecentVibes(allVibes);

  // Post author gets vibeDetails (who reacted)
  const isViewerPostAuthor = userId && userId === row.authorId;
  const vibeDetails = isViewerPostAuthor
    ? allVibes.map(v => ({ emoji: v.emoji, userId: v.userId, userName: v.userName ?? 'Someone' }))
    : undefined;

  // Fetch author info for live name/avatar syncing
  const [authorUser] = await db.select({ name: users.name, slug: users.slug, avatar: users.avatar })
    .from(users).where(eq(users.id, row.authorId)).limit(1);

  // Explicit alias detection: check if the author joined the tribe under an alias
  let isAliasPost = false;
  if (row.tribeId) {
    const [memberRow] = await db.select({ joinedAsAlias: tribeMembers.joinedAsAlias })
      .from(tribeMembers)
      .where(and(eq(tribeMembers.tribeId, row.tribeId), eq(tribeMembers.userId, row.authorId)))
      .limit(1);
    isAliasPost = !!(memberRow?.joinedAsAlias && row.authorName === memberRow.joinedAsAlias);
  }

  const liveAvatar = isAliasPost ? undefined : (authorUser?.avatar ?? undefined);
  const liveName = isAliasPost ? null : (authorUser?.name ?? null);
  const post = rowToTribePost(row, commentsData.length > 0 ? commentsData : undefined, liveAvatar, isAliasPost, liveName);
  post.recentVibes = recentVibes;
  post.vibeDetails = vibeDetails;
  post.hasVibed = hasVibed;
  post.selectedVibe = selectedVibe;
  post.authorSlug = authorUser?.slug ?? undefined;

  return {
    post,
    tribeName,
    tribeSlug,
    tribeId: row.tribeId,
    isPublic,
    authorRole,
    viewerRole,
    viewerIsMember,
  };
}

/**
 * Server action: Fetch a single post by slug (scoped by tribeSlug if provided)
 * with full context for the standalone post page.
 * Supports resolution of old slug redirects.
 */
export async function getPostBySlug(
  postSlug: string,
  tribeSlug?: string,
): Promise<{
  post: TribePost;
  tribeName: string | null;
  tribeSlug: string | null;
  tribeId: string | null;
  isPublic: boolean;
  authorRole: 'founder' | 'speaker' | 'member';
  viewerRole: 'founder' | 'speaker' | 'member' | null;
  viewerIsMember: boolean;
  redirectSlug?: string;
} | null> {
  const { db } = await import('@/db');
  const { posts, tribes, postSlugRedirects } = await import('@/db/schema');
  const { eq, and, isNull } = await import('drizzle-orm');

  let postId: string | null = null;
  let redirectSlug: string | undefined = undefined;

  if (tribeSlug) {
    // 1. Direct compound lookup (post slug + tribe slug)
    const [direct] = await db.select({ id: posts.id })
      .from(posts)
      .innerJoin(tribes, eq(posts.tribeId, tribes.id))
      .where(and(eq(posts.slug, postSlug), eq(tribes.slug, tribeSlug)))
      .limit(1);

    if (direct) {
      postId = direct.id;
    } else {
      // 2. Look up the tribe ID first to scope the redirect search
      const [tribe] = await db.select({ id: tribes.id }).from(tribes).where(eq(tribes.slug, tribeSlug)).limit(1);
      if (tribe) {
        const [redirect] = await db.select({ postId: postSlugRedirects.postId })
          .from(postSlugRedirects)
          .where(and(eq(postSlugRedirects.oldSlug, postSlug), eq(postSlugRedirects.tribeId, tribe.id)))
          .limit(1);

        if (redirect) {
          postId = redirect.postId;
          // Get the current slug for redirection
          const [currentPost] = await db.select({ slug: posts.slug }).from(posts).where(eq(posts.id, postId)).limit(1);
          if (currentPost?.slug) {
            redirectSlug = currentPost.slug;
          }
        }
      }
    }
  } else {
    // Standalone post lookup (where tribeId is null)
    const [direct] = await db.select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.slug, postSlug), isNull(posts.tribeId)))
      .limit(1);

    if (direct) {
      postId = direct.id;
    } else {
      // Look up standalone redirect
      const [redirect] = await db.select({ postId: postSlugRedirects.postId })
        .from(postSlugRedirects)
        .where(and(eq(postSlugRedirects.oldSlug, postSlug), isNull(postSlugRedirects.tribeId)))
        .limit(1);

      if (redirect) {
        postId = redirect.postId;
        const [currentPost] = await db.select({ slug: posts.slug }).from(posts).where(eq(posts.id, postId)).limit(1);
        if (currentPost?.slug) {
          redirectSlug = currentPost.slug;
        }
      }
    }
  }

  if (!postId) return null;

  const result = await getPostById(postId);
  if (!result) return null;

  return {
    ...result,
    redirectSlug,
  };
}

/**
 * Server action: Edit a post's custom URL/slug.
 * Validates permissions (platform admin, tribe leader, or owner if not locked) and uniqueness.
 */
export async function updatePostSlug(postId: string, newSlug: string): Promise<{ success: boolean; newSlug: string; slugEditedBy?: string | null }> {
  const userId = await requireAuth();
  const cleanSlug = slugify(newSlug);
  if (!cleanSlug) throw new Error('Invalid URL format.');
  if (cleanSlug.length < 3) throw new Error('Slug must be at least 3 characters.');

  // Reject slugs that collide with tribe sub-routes (settings, analytics, etc.)
  const RESERVED_POST_SLUGS = new Set([
    'settings', 'analytics', 'manage-members', 'mod-queue',
    'post', 'admin', 'api', 'invite', 'login', 'signup', 'new',
  ]);
  if (RESERVED_POST_SLUGS.has(cleanSlug)) {
    throw new Error(`"${cleanSlug}" is a reserved URL and cannot be used.`);
  }

  const { db } = await import('@/db');
  const { posts, users, tribeMembers, postSlugRedirects } = await import('@/db/schema');
  const { eq, and, isNull } = await import('drizzle-orm');

  // 1. Fetch current post
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) throw new Error('Post not found.');

  // 2. Determine permissions
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  const isPlatformAdmin = user?.role === 'Admin';

  let isTribeLeader = false;
  if (post.tribeId) {
    const [membership] = await db.select({ role: tribeMembers.role })
      .from(tribeMembers)
      .where(and(eq(tribeMembers.tribeId, post.tribeId), eq(tribeMembers.userId, userId)))
      .limit(1);
    isTribeLeader = membership?.role === 'founder' || membership?.role === 'speaker';
  }

  const isAuthor = post.authorId === userId;

  if (isPlatformAdmin) {
    // Platform admin has full access
  } else if (isTribeLeader) {
    // Tribe founder/speaker has full access
  } else if (isAuthor) {
    // Author can only edit if not locked by a tribe leader
    if (post.slugEditedBy) {
      throw new Error('This URL has been locked by a tribe leader.');
    }
  } else {
    throw new Error('Not authorized to edit this URL.');
  }

  // 3. Collision checks (ensure slug is unique in this scope)
  if (cleanSlug !== post.slug) {
    const existingPostQuery = db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.slug, cleanSlug),
          post.tribeId ? eq(posts.tribeId, post.tribeId) : isNull(posts.tribeId)
        )
      )
      .limit(1);

    const [existingPost] = await existingPostQuery;
    if (existingPost) {
      throw new Error('This URL is already taken in this tribe/scope.');
    }

    const activeRedirectQuery = db
      .select({ id: postSlugRedirects.id })
      .from(postSlugRedirects)
      .where(
        and(
          eq(postSlugRedirects.oldSlug, cleanSlug),
          post.tribeId ? eq(postSlugRedirects.tribeId, post.tribeId) : isNull(postSlugRedirects.tribeId)
        )
      )
      .limit(1);

    const [activeRedirect] = await activeRedirectQuery;
    if (activeRedirect) {
      throw new Error('This URL is already taken in this tribe/scope.');
    }

    // 4. Create redirect for old slug
    if (post.slug) {
      const { createPostSlugRedirect } = await import('@/lib/slugify');
      await createPostSlugRedirect(post.slug, postId, post.tribeId);
    }
  }

  // 5. Update slug and potentially lock if edited by leader
  const updateSet: Record<string, unknown> = {
    slug: cleanSlug,
  };
  
  if (isTribeLeader && !isAuthor) {
    updateSet.slugEditedBy = userId;
  }

  await db.update(posts).set(updateSet).where(eq(posts.id, postId));

  return { 
    success: true, 
    newSlug: cleanSlug, 
    slugEditedBy: (updateSet.slugEditedBy as string | null) || post.slugEditedBy 
  };
}

/** Structured payload for editing a post. */
export interface EditPostPayload {
  content: string;
  title?: string | null;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  moodTag?: string | null;
}

/**
 * Server action: Edit a plaintext post.
 * Accepts a full payload so callers can update content, title, images, and mood.
 */
export async function editPost(postId: string, payload: string | EditPostPayload): Promise<void> {
  const userId = await requireAuth();
  await postLimiter.check(userId);

  // Backward-compat: accept a bare string as content-only edit
  const data: EditPostPayload = typeof payload === 'string'
    ? { content: payload }
    : payload;

  if (!data.content.trim()) throw new Error('Post content cannot be empty.');

  const { db } = await import('@/db');
  const { posts } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');

  const [post] = await db.select({
    authorId: posts.authorId,
    isEncrypted: posts.isEncrypted,
    title: posts.title,
  }).from(posts).where(eq(posts.id, postId)).limit(1);

  if (!post) throw new Error('Post not found.');
  if (post.authorId !== userId) throw new Error('You can only edit your own posts.');
  if (post.isEncrypted) throw new Error('Use editEncryptedPost for encrypted content.');

  const updateSet: Record<string, unknown> = {
    content: data.content.trim(),
    editedAt: new Date(),
  };

  // Conditionally update metadata fields when provided (explicit null clears them)
  if (data.title !== undefined) updateSet.title = data.title;
  if (data.imageUrl !== undefined) updateSet.imageUrl = data.imageUrl;
  if (data.imageUrls !== undefined) updateSet.imageUrls = data.imageUrls;
  if (data.moodTag !== undefined) updateSet.moodTag = data.moodTag;

  // Regenerate slug when title or content changes
  // Use the effective title (new if provided, otherwise existing)
  const effectiveTitle = data.title !== undefined ? data.title : post.title;
  updateSet.slug = slugify(effectiveTitle || data.content.substring(0, 60)) || null;

  // Update image alt text based on whether images are present
  if (data.imageUrl !== undefined || data.imageUrls !== undefined) {
    const hasImgs = !!(data.imageUrl || (data.imageUrls && data.imageUrls.length > 0));
    updateSet.imageAlt = hasImgs ? 'User uploaded image' : null;
    updateSet.dataAiHintImage = hasImgs ? 'user upload' : null;
  }

  await db.update(posts).set(updateSet).where(eq(posts.id, postId));

  // Fire-and-forget: re-process @mentions for new content
  import('@/lib/services/mention-service').then(({ processMentions }) =>
    processMentions(data.content, userId, 'post', postId)
  ).catch(() => {});
}

/**
 * Server action: Edit an E2E encrypted post.
 * The server receives a new ciphertext blob + IV from the client.
 * Optional metadata (title, images, mood) can also be updated — these remain unencrypted.
 */
export async function editEncryptedPost(
  postId: string,
  ciphertextBase64: string,
  iv: string,
  metadata?: {
    title?: string | null;
    imageUrl?: string | null;
    imageUrls?: string[] | null;
    moodTag?: string | null;
  },
): Promise<void> {
  const userId = await requireAuth();
  await postLimiter.check(userId);

  const { db } = await import('@/db');
  const { posts } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');

  const [post] = await db.select({
    authorId: posts.authorId,
    isEncrypted: posts.isEncrypted,
  }).from(posts).where(eq(posts.id, postId)).limit(1);

  if (!post) throw new Error('Post not found.');
  if (post.authorId !== userId) throw new Error('You can only edit your own posts.');
  if (!post.isEncrypted) throw new Error('Post is not encrypted.');

  const updateSet: Record<string, unknown> = {
    ciphertext: Buffer.from(ciphertextBase64, 'base64'),
    encryptionIv: iv,
    editedAt: new Date(),
  };

  // Apply unencrypted metadata updates if provided
  if (metadata) {
    if (metadata.title !== undefined) {
      updateSet.title = metadata.title;
      updateSet.slug = slugify(metadata.title || 'Encrypted post');
    }
    if (metadata.imageUrl !== undefined) updateSet.imageUrl = metadata.imageUrl;
    if (metadata.imageUrls !== undefined) updateSet.imageUrls = metadata.imageUrls;
    if (metadata.moodTag !== undefined) updateSet.moodTag = metadata.moodTag;

    if (metadata.imageUrl !== undefined || metadata.imageUrls !== undefined) {
      const hasImgs = !!(metadata.imageUrl || (metadata.imageUrls && metadata.imageUrls.length > 0));
      updateSet.imageAlt = hasImgs ? 'User uploaded image' : null;
      updateSet.dataAiHintImage = hasImgs ? 'user upload' : null;
    }
  }

  await db.update(posts).set(updateSet).where(eq(posts.id, postId));
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
 * Server action: Get a user's most recent mood tag (from their latest post with a mood).
 */
export async function getCurrentMood(targetUserId?: string): Promise<{ moodTag: string; postId: string } | null> {
  const userId = targetUserId ?? await getCurrentUserId();
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


// ── Private helpers (DRY) ────────────────────────────────────

/** Insert post key grants for encrypted posts. */
async function insertKeyGrants(
  postId: string,
  keyGrants: Array<{ recipientId: string; bondId?: string; wrappedKey: string; wrapIv: string }>,
) {
  if (keyGrants.length === 0) return;
  const { db } = await import('@/db');
  const { postKeyGrants } = await import('@/db/schema');
  await db.insert(postKeyGrants).values(
    keyGrants.map(kg => {
      const bId = (kg.bondId && kg.bondId.trim() !== '') ? kg.bondId : null;
      return {
        // Include bondId in the PK to ensure uniqueness if a recipient has multiple grants (e.g. self-grant + bond grant)
        id: `pkg-${postId}-${kg.recipientId}-${bId || 'self'}`,
        postId,
        recipientId: kg.recipientId,
        bondId: bId,
        wrappedKey: kg.wrappedKey,
        wrapIv: kg.wrapIv,
      };
    })
  );
}

/** Check whether a payload has any images (single or multi). */
function hasImages(p: { imageUrl?: string | null; imageUrls?: string[] | null }): boolean {
  return !!(p.imageUrl || (p.imageUrls && p.imageUrls.length > 0));
}

/** Serializable payload for creating a tribe post (image already uploaded client-side). */
export interface CreatePostPayload {
  title?: string;
  content: string;
  imageUrl?: string;
  imageUrls?: string[];
}

/** Payload for universal ring-based post creation (Concentric Rings). */
export interface CreateRingPostPayload {
  content: string;
  ring: 'journal' | 'inner_circle' | 'my_people' | 'tribes';
  title?: string;
  imageUrl?: string;
  imageUrls?: string[];
  moodTag?: string;
  tribeIds?: string[]; // Required when ring = 'tribes'

  /** Override the author name/avatar for this specific post (must be one of user's valid aliases) */
  overrideName?: string;
  overrideAvatar?: string;

  // E2E encryption (Phase 3) — provided by the client when encrypting
  encryption?: {
    /** Base64-encoded ciphertext (AES-256-GCM encrypted post body) */
    ciphertextBase64: string;
    /** Base64-encoded IV */
    iv: string;
    /** Per-recipient key grants */
    keyGrants: Array<{
      recipientId: string;
      bondId?: string;
      wrappedKey: string;
      wrapIv: string;
    }>;
  };

  // Link preview metadata (unfurled at compose time)
  linkPreview?: {
    url: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    siteName?: string;
  };
}

/**
 * Universal post creation — routes to the correct ring.
 * This is the primary compose action for the Concentric Rings model.
 */
export const createRingPost = withPublicErrors(async (payload: CreateRingPostPayload): Promise<TribePost> => {
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
    // SECURITY: Bound the number of tribes a post can be cross-posted to.
    // Without this limit a single request could trigger O(n) DB writes and
    // S3 operations, enabling a DoS via the authenticated post endpoint.
    const MAX_CROSS_POST_TRIBES = 10;
    if (payload.tribeIds.length > MAX_CROSS_POST_TRIBES) {
      throw new Error(`You can post to at most ${MAX_CROSS_POST_TRIBES} tribes at once.`);
    }

    // SECURITY: Reject unencrypted posts to private tribes (defense-in-depth).
    // The client-side ComposeBox should always encrypt for private tribes, but
    // this guard blocks any API-level bypass (modified client, stale code, etc.).
    const { tribes: tribesTable } = await import('@/db/schema');
    const [targetTribe] = await db.select({ isPublic: tribesTable.isPublic })
      .from(tribesTable).where(eq(tribesTable.id, payload.tribeIds[0]!)).limit(1);

    if (targetTribe && !targetTribe.isPublic && !payload.encryption) {
      throw new Error('Private tribe posts must be encrypted. Please reload and try again.');
    }

    // Create the primary post in the first tribe
    // SECURITY: Never pass plaintext title to the post creator for encrypted posts —
    // it would leak into the slug (URL-visible metadata). Title is encrypted client-side.
    const { createTribePost: fn } = await import('@/lib/services/post-service');
    const primaryPost = await fn(payload.tribeIds[0]!, {
      title: payload.encryption ? undefined : payload.title,
      content: payload.encryption ? '🔒 Encrypted post' : payload.content.trim(),
      // Encrypted images are uploaded as encrypted blobs — the fileIds stored here
      // are opaque identifiers that cannot be resolved without the decryption key.
      // They MUST be persisted so the client can fetch and decrypt them.
      imageUrl: payload.imageUrl,
      imageUrls: payload.imageUrls,
    }, userId, {
      name: payload.overrideName,
      avatar: payload.overrideAvatar
    });

    // Update with ring metadata + encryption if present
    const updateData: Record<string, unknown> = {
      ring: 'tribes',
      moodTag: payload.moodTag ?? null,
    };
    if (payload.encryption) {
      updateData.ciphertext = Buffer.from(payload.encryption.ciphertextBase64, 'base64');
      updateData.isEncrypted = true;
      updateData.encryptionIv = payload.encryption.iv;
      // SECURITY: Null out any slug that may have been generated from masked content.
      // Encrypted posts must never have URL-visible metadata derived from plaintext.
      updateData.slug = null;
      updateData.title = null;
    }
    // Link preview metadata
    if (payload.linkPreview) {
      updateData.linkUrl = payload.linkPreview.url;
      updateData.linkTitle = payload.linkPreview.title ?? null;
      updateData.linkDescription = payload.linkPreview.description ?? null;
      updateData.linkImage = payload.linkPreview.imageUrl ?? null;
      updateData.linkSiteName = payload.linkPreview.siteName ?? null;
    }
    await db.update(posts).set(updateData).where(eq(posts.id, primaryPost.id));

    // Store key grants for encrypted tribe posts
    if (payload.encryption && payload.encryption.keyGrants.length > 0) {
      await insertKeyGrants(primaryPost.id, payload.encryption.keyGrants);
    }

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
  const isEncrypted = !!payload.encryption;

  let uniqueSlug: string | null = null;
  if (!isEncrypted) {
    const { generateUniquePostSlug } = await import('@/lib/slugify');
    uniqueSlug = await generateUniquePostSlug(payload.title || payload.content.substring(0, 60), null);
  }

  await db.insert(posts).values({
    id,
    tribeId: null, // No tribe for non-tribe rings
    authorId: userId,
    authorName: payload.overrideName || authorName,
    authorAvatar: payload.overrideAvatar || author?.avatar || null,
    authorAvatarFallback: (payload.overrideName || authorName).substring(0, 2).toUpperCase() || '??',
    // SECURITY: Encrypted posts must never have slugs — they would leak plaintext in the URL.
    slug: uniqueSlug,
    title: isEncrypted ? null : (payload.title || null),
    content: isEncrypted ? '🔒 Encrypted post' : payload.content.trim(),
    imageUrl: payload.imageUrl || null,
    imageUrls: payload.imageUrls || null,
    imageAlt: hasImages(payload) ? 'User uploaded image' : null,
    dataAiHintImage: hasImages(payload) ? 'user upload' : null,
    vibeCount: 0,
    commentCount: 0,
    isRemoved: false,
    canBeReposted: payload.ring !== 'journal', // Journal posts are private, not repostable
    ring: payload.ring,
    moodTag: payload.moodTag ?? null,
    pinnedToWall: false,
    // Encryption fields
    ciphertext: isEncrypted ? Buffer.from(payload.encryption!.ciphertextBase64, 'base64') : null,
    isEncrypted,
    encryptionIv: isEncrypted ? payload.encryption!.iv : null,
    // Link preview metadata
    linkUrl: payload.linkPreview?.url ?? null,
    linkTitle: payload.linkPreview?.title ?? null,
    linkDescription: payload.linkPreview?.description ?? null,
    linkImage: payload.linkPreview?.imageUrl ?? null,
    linkSiteName: payload.linkPreview?.siteName ?? null,
    createdAt: new Date(),
  });

  // Store key grants for encrypted posts
  if (isEncrypted && payload.encryption!.keyGrants.length > 0) {
    await insertKeyGrants(id, payload.encryption!.keyGrants);
  }

  const [created] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  const result = rowToTribePost(created!);

  // Process @mentions for non-journal posts
  if (payload.ring !== 'journal') {
    import('@/lib/services/mention-service').then(({ processMentions }) =>
      processMentions(payload.content, userId, 'post', id)
    ).catch(() => { });
  }

  trackContribution(userId, 'post', id, `Posted to ${payload.ring}`);
  return result;
});

/**
 * Fetches the current user's key grants for a batch of encrypted post IDs.
 * Used by the feed to decrypt posts client-side.
 */
export async function getPostKeyGrants(postIds: string[]): Promise<Record<string, {
  wrappedKey: string;
  wrapIv: string;
  bondId: string | null;
}>> {
  if (postIds.length === 0) return {};
  // SECURITY: Bound the batch size to prevent a single request from issuing
  // an unbounded IN(...) query that could degrade DB performance.
  const MAX_BATCH = 100;
  if (postIds.length > MAX_BATCH) {
    throw new Error(`getPostKeyGrants: batch size ${postIds.length} exceeds limit of ${MAX_BATCH}`);
  }
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { postKeyGrants } = await import('@/db/schema');
  const { and, eq, inArray } = await import('drizzle-orm');

  const grants = await db.select({
    postId: postKeyGrants.postId,
    wrappedKey: postKeyGrants.wrappedKey,
    wrapIv: postKeyGrants.wrapIv,
    bondId: postKeyGrants.bondId, // This is the AUTHOR'S bond ID
  }).from(postKeyGrants)
    .where(and(
      inArray(postKeyGrants.postId, postIds),
      eq(postKeyGrants.recipientId, userId),
    ));

  // Map the author's bond ID to the recipient's bond ID
  const { bonds } = await import('@/db/schema');
  const authorBondIds = [...new Set(grants.map(g => g.bondId).filter(Boolean))] as string[];

  // Map: authorBondId -> recipientBondId
  const bondIdMap = new Map<string, string>();

  if (authorBondIds.length > 0) {
    // 1. Fetch the author bonds to get the author's user ID (who is the target for the recipient)
    const authorBonds = await db.select({
      id: bonds.id,
      userId: bonds.userId, // This is the author
    }).from(bonds).where(inArray(bonds.id, authorBondIds));

    const authorIds = [...new Set(authorBonds.map(b => b.userId))];

    if (authorIds.length > 0) {
      // 2. Fetch the recipient's corresponding bonds
      const recipientBonds = await db.select({
        id: bonds.id,
        targetId: bonds.targetId,
        bondType: bonds.bondType,
        targetType: bonds.targetType,
        expiresAt: bonds.expiresAt,
      }).from(bonds).where(and(
        eq(bonds.userId, userId),
        inArray(bonds.targetId, authorIds)
      ));

      const { computePasskeyStatus } = await import('@/lib/crypto/passkey-lifecycle');

      // Filter to active/fading recipient bonds and create targetId -> recipientBondId map
      const activeRecipientBonds = new Map<string, string>();
      for (const rb of recipientBonds) {
        if (!rb.expiresAt) {
          activeRecipientBonds.set(rb.targetId, rb.id);
          continue;
        }
        const status = computePasskeyStatus({ expiresAt: rb.expiresAt }, rb.bondType ?? 'person', rb.targetType ?? 'user');
        if (status === 'active' || status === 'fading') {
          activeRecipientBonds.set(rb.targetId, rb.id);
        }
      }

      // 3. Map authorBondId -> recipientBondId
      for (const ab of authorBonds) {
        const recipientBondId = activeRecipientBonds.get(ab.userId);
        if (recipientBondId) {
          bondIdMap.set(ab.id, recipientBondId);
        }
      }
    }
  }

  const result: Record<string, { wrappedKey: string; wrapIv: string; bondId: string | null }> = {};
  for (const g of grants) {
    if (!g.bondId) {
      // Self-grant (author decrypting their own post)
      result[g.postId] = { wrappedKey: g.wrappedKey, wrapIv: g.wrapIv, bondId: null };
    } else {
      const recipientBondId = bondIdMap.get(g.bondId);
      // Only include the grant if we successfully resolved an active recipient bond
      if (recipientBondId) {
        result[g.postId] = { wrappedKey: g.wrappedKey, wrapIv: g.wrapIv, bondId: recipientBondId };
      }
    }
  }
  return result;
}

/**
 * Returns the list of encryption recipients for a given ring or tribe.
 * Each recipient includes their userId and bondId (for shared secret lookup).
 * Used by the compose box to encrypt posts for the correct audience.
 *
 * NOTE: The tribe branch of this function is no longer used by ComposeBox for
 * the encrypt/skip decision. ComposeBox now checks `tribe.isPublic` directly
 * to avoid the bug where a solo founder (no other members) would get an empty
 * recipients list and skip encryption. The tribe branch is retained for
 * potential future use (e.g. analytics, audit).
 */
export async function getEncryptionRecipients(
  ring: 'inner_circle' | 'my_people' | 'tribes',
  tribeIds?: string[],
): Promise<Array<{ userId: string; bondId: string }>> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { bonds, tribeMembers } = await import('@/db/schema');
  const { eq, and, ne, inArray } = await import('drizzle-orm');

  if (ring === 'tribes') {
    // The ComposeBox handles tribe encryption using getActiveTribeKey directly.
    // This branch is no longer used for encryption distribution, but kept
    // returning empty array to satisfy the type signature if mistakenly called.
    return [];
  }

  // For inner_circle and my_people: use the user's bonds
  const ringBonds = await db.select({
    id: bonds.id,
    targetId: bonds.targetId,
    innerCircle: bonds.innerCircle,
    bondType: bonds.bondType,
    expiresAt: bonds.expiresAt,
  }).from(bonds)
    .where(and(
      eq(bonds.userId, userId),
      eq(bonds.targetType, 'user'),
    ));

  // Filter to active/fading bonds only
  const { computePasskeyStatus: computeStatus } = await import('@/lib/crypto/passkey-lifecycle');

  return ringBonds
    .filter(b => {
      // Enforce bond status boundary
      if (b.expiresAt) {
        const status = computeStatus({ expiresAt: b.expiresAt }, b.bondType ?? 'person', 'user');
        if (status === 'dormant' || status === 'expired') return false;
      }
      if (ring === 'inner_circle') return b.innerCircle;
      return true; // my_people = all active bonds
    })
    .map(b => ({
      userId: b.targetId,
      bondId: b.id,
    }));
}

/**
 * Returns a lightweight list of the user's tribes for the compose tribe selector.
 */
export async function getMyTribesList(): Promise<{ id: string; name: string; slug: string | null; description: string | null; cover: string | null; isPublic: boolean; members: number; brandColor: string | null; joinedAsAlias: string | null; joinedAsAvatar: string | null; moods: string[] }[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const { db } = await import('@/db');
  const { tribeMembers, tribes, tribeMoodTags } = await import('@/db/schema');
  const { eq, inArray } = await import('drizzle-orm');

  // Single query: get tribe IDs the user belongs to, including alias info
  const memberRows = await db.select({ 
    tribeId: tribeMembers.tribeId,
    joinedAsAlias: tribeMembers.joinedAsAlias,
    joinedAsAvatar: tribeMembers.joinedAsAvatar
  })
    .from(tribeMembers)
    .where(eq(tribeMembers.userId, userId));

  if (memberRows.length === 0) return [];

  const tribeIds = memberRows.map(r => r.tribeId);

  // Batch fetch all tribes in one query (fixes N+1)
  const tribeRows = await db.select({
    id: tribes.id,
    name: tribes.name,
    slug: tribes.slug,
    description: tribes.description,
    cover: tribes.cover,
    isPublic: tribes.isPublic,
    members: tribes.memberCount,
    brandColor: tribes.brandColor,
  })
    .from(tribes)
    .where(inArray(tribes.id, tribeIds));
    
  // Batch fetch moods for these tribes
  const moodRows = await db.select({
    tribeId: tribeMoodTags.tribeId,
    moodSlug: tribeMoodTags.moodSlug,
  })
    .from(tribeMoodTags)
    .where(inArray(tribeMoodTags.tribeId, tribeIds));
    
  const moodMap = new Map<string, string[]>();
  for (const m of moodRows) {
    const arr = moodMap.get(m.tribeId) ?? [];
    arr.push(m.moodSlug);
    moodMap.set(m.tribeId, arr);
  }

  const memberMap = new Map(memberRows.map(r => [r.tribeId, r]));

  return tribeRows.map(t => {
    const mem = memberMap.get(t.id);
    return {
      ...t,
      isPublic: t.isPublic ?? true,
      members: t.members ?? 0,
      brandColor: t.brandColor ?? null,
      joinedAsAlias: mem?.joinedAsAlias ?? null,
      joinedAsAvatar: mem?.joinedAsAvatar ?? null,
      moods: moodMap.get(t.id) ?? [],
    };
  });
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
export async function getPostsForTribe(
  tribeId: string,
  options?: { cursor?: string; limit?: number },
): Promise<PaginatedResult<TribePost>> {
  const userId = await getCurrentUserId();

  // SECURITY: Gate private tribe content to members only
  const { getTribeById: fetchTribe } = await import('@/lib/data-access/tribes');
  const tribe = await fetchTribe(tribeId, userId); // respects visibility
  if (!tribe) {
    // Either doesn't exist or the viewer has no access to this private tribe
    throw new Error('Tribe not found or access denied.');
  }

  // SECURITY: NSFW tribes require high-assurance 18+ verification to VIEW content
  // (issue #32), enforced at the content boundary — independent of membership. This
  // closes the gap where a tribe flipped to NSFW, a public NSFW tribe, or any
  // un-gated membership path would otherwise serve NSFW content to an unverified
  // user. Throws AGE_VERIFICATION_REQUIRED so the client launches the verify flow.
  if (tribe.isNsfw) {
    const { requireAgeVerified } = await import('./shared');
    await requireAgeVerified();
  }

  // SECURITY: A private tribe may now be publicly LISTED (e.g. NSFW tribes opt in to
  // discovery), so getTribeById returns its metadata to non-members. Post content must
  // still be members-only — enforce membership independently here (policy §2: zero
  // content leaks to non-members).
  if (!tribe.isPublic) {
    if (!userId) throw new Error('Tribe not found or access denied.');
    const { getTribeAccessLevel } = await import('@/lib/services/tribe-auth');
    const level = await getTribeAccessLevel(userId, tribeId);
    if (level === 'guest') {
      throw new Error('Tribe not found or access denied.');
    }
  }

  const { getPostsForTribe: fn } = await import('@/lib/services/post-service');
  return fn(tribeId, userId ?? undefined, options);
}

export async function getMoodStreamPosts(
  options?: { cursor?: string; limit?: number },
): Promise<PaginatedResult<MoodStreamPost>> {
  const userId = await getCurrentUserId();
  const { getMoodStreamPosts: fn } = await import('@/lib/services/post-service');
  return fn(userId ?? undefined, options);
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
  await vibeLimiter.check(userId);
  const { toggleVibe: fn } = await import('@/lib/services/post-service');
  const result = await fn(userId, targetId, targetType, emoji);
  // Track vibe contribution (only when adding, not removing)
  if (result.vibed) {
    trackContribution(userId, 'vibe_given', targetId, `Vibed on ${targetType}`);
  }
  return result;
}

// ======== COMMENTS ========
export const createComment = withPublicErrors(async (
  postId: string,
  content: string,
  parentCommentId?: string,
  encryptionPayload?: { ciphertextBase64: string; iv: string },
) => {
  const userId = await requireVerifiedEmail();
  await commentLimiter.check(userId);
  if (!content.trim() && !encryptionPayload) throw new Error('Comment cannot be empty');

  // Server-side guard: reject unencrypted comments in private tribes
  const { db } = await import('@/db');
  const { posts: postsTable, tribes: tribesTable } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [postRow] = await db.select({ tribeId: postsTable.tribeId }).from(postsTable)
    .where(eq(postsTable.id, postId)).limit(1);
  if (postRow?.tribeId) {
    const [tribe] = await db.select({ isPublic: tribesTable.isPublic }).from(tribesTable)
      .where(eq(tribesTable.id, postRow.tribeId)).limit(1);
    if (tribe && !tribe.isPublic && !encryptionPayload) {
      throw new Error('Comments in private tribes must be encrypted.');
    }
  }

  // Convert base64 ciphertext to Buffer for storage
  let encryption: { ciphertext: Buffer; iv: string } | undefined;
  if (encryptionPayload) {
    encryption = {
      ciphertext: Buffer.from(encryptionPayload.ciphertextBase64, 'base64'),
      iv: encryptionPayload.iv,
    };
  }

  const { createComment: fn } = await import('@/lib/services/post-service');
  const comment = await fn(postId, userId, content.trim(), parentCommentId, encryption);
  // Fire-and-forget contribution tracking (comment type, not post)
  trackContribution(userId, 'comment', comment.id, `Commented on post ${postId}`);

  // Fire-and-forget: process @mentions in the comment (skip encrypted comments)
  if (!encryptionPayload) {
    import('@/lib/services/mention-service').then(({ processMentions }) =>
      processMentions(content.trim(), userId, 'comment', comment.id)
    ).catch(() => {});
  }

  return comment;
});

/**
 * Server action: Backfill-encrypt a legacy plaintext comment.
 * Called by the client when it detects an unencrypted comment in a private tribe.
 * The client encrypts locally and sends the ciphertext to be stored.
 */
export async function backfillEncryptComment(
  commentId: string,
  ciphertextBase64: string,
  iv: string,
): Promise<void> {
  await requireAuth();

  const { db } = await import('@/db');
  const { comments } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  // Only backfill comments that are NOT already encrypted
  const [comment] = await db.select({ id: comments.id, isEncrypted: comments.isEncrypted })
    .from(comments).where(and(eq(comments.id, commentId), eq(comments.isEncrypted, false))).limit(1);

  if (!comment) return; // Already encrypted or doesn't exist — skip silently

  const ciphertext = Buffer.from(ciphertextBase64, 'base64');

  await db.update(comments).set({
    ciphertext,
    encryptionIv: iv,
    isEncrypted: true,
    content: '[encrypted]', // Redact plaintext
  }).where(eq(comments.id, commentId));
}

/**
 * Server action: Edit an existing comment (own comments only).
 */
export async function editComment(commentId: string, newContent: string): Promise<void> {
  const userId = await requireAuth();
  if (!newContent.trim()) throw new Error('Comment cannot be empty');

  const { db } = await import('@/db');
  const { comments } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');

  const [comment] = await db.select({ authorId: comments.authorId })
    .from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!comment) throw new Error('Comment not found');
  if (comment.authorId !== userId) throw new Error('You can only edit your own comments');

  await db.update(comments)
    .set({ content: newContent.trim() })
    .where(eq(comments.id, commentId));

  // Fire-and-forget: re-process @mentions for edited content
  import('@/lib/services/mention-service').then(({ processMentions }) =>
    processMentions(newContent.trim(), userId, 'comment', commentId)
  ).catch(() => {});
}

export async function getCommentsForPost(postId: string) {
  const userId = await getCurrentUserId();

  // SECURITY: Resolve the parent post's tribe and gate on private tribe membership
  const { db } = await import('@/db');
  const { posts } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [post] = await db.select({ tribeId: posts.tribeId, authorId: posts.authorId }).from(posts).where(eq(posts.id, postId)).limit(1);
  if (post) {
    if (post.tribeId) {
      const { getTribeById: fetchTribe } = await import('@/lib/data-access/tribes');
      const tribe = await fetchTribe(post.tribeId, userId);
      if (!tribe) throw new Error('Tribe not found or access denied.');
    }
  }

  const { getCommentsForPost: fn } = await import('@/lib/services/post-service');
  return fn(postId, userId ?? undefined, post?.authorId ?? undefined);
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

/**
 * Admin-only: Permanently delete any post and cascade-delete all related data.
 * Requires global Admin role. Associated media files are soft-deleted so they
 * enter the 30-day GC pipeline (recoverable for non-encrypted content).
 */
export async function adminDeletePost(postId: string): Promise<void> {
  const { requireAdmin } = await import('./shared');
  await requireAdmin();

  const { db } = await import('@/db');
  const { posts, comments, vibes, reports, postKeyGrants, mediaFiles } = await import('@/db/schema');
  const { eq, inArray } = await import('drizzle-orm');

  // Verify the post exists
  const [post] = await db.select({ id: posts.id, imageUrls: posts.imageUrls, imageUrl: posts.imageUrl })
    .from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) throw new Error('Post not found.');

  // 1. Soft-delete associated media files (enters 30-day GC pipeline)
  const allImageRefs = [
    ...(post.imageUrls || []),
    ...(post.imageUrl ? [post.imageUrl] : []),
  ].filter(Boolean);

  if (allImageRefs.length > 0) {
    // File IDs (encrypted) or URLs (public) — soft-delete by matching fileId
    for (const ref of allImageRefs) {
      // Encrypted images use fileId directly; public images use URLs
      // Try to match as fileId first
      try {
        await db.update(mediaFiles)
          .set({ deletedAt: new Date() })
          .where(eq(mediaFiles.id, ref));
      } catch { /* best-effort — ref may be a URL, not a fileId */ }
    }
  }

  // 2. Delete comment vibes (vibes targeting comments on this post)
  const postComments = await db.select({ id: comments.id }).from(comments).where(eq(comments.postId, postId));
  const commentIds = postComments.map(c => c.id);
  if (commentIds.length > 0) {
    await db.delete(vibes).where(inArray(vibes.targetId, commentIds));
  }

  // 3. Delete comments
  await db.delete(comments).where(eq(comments.postId, postId));

  // 4. Delete post vibes
  await db.delete(vibes).where(eq(vibes.targetId, postId));

  // 5. Delete reports
  await db.delete(reports).where(eq(reports.postId, postId));

  // 6. Delete key grants (encrypted posts)
  await db.delete(postKeyGrants).where(eq(postKeyGrants.postId, postId));

  // 7. Delete the post itself
  await db.delete(posts).where(eq(posts.id, postId));
}


/**
 * Toggles the pinned status of a post in a tribe.
 * Requires Tribe Speaker or Founder permission.
 */
export async function togglePinTribePost(postId: string): Promise<{ pinned: boolean }> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { posts } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');

  const [post] = await db.select({
    tribeId: posts.tribeId,
    isPinned: posts.isPinned
  }).from(posts).where(eq(posts.id, postId)).limit(1);

  if (!post) throw new Error('Post not found.');
  if (!post.tribeId) throw new Error('This post is not in a tribe.');

  const { requireTribeSpeaker } = await import('@/lib/services/tribe-auth');
  await requireTribeSpeaker(userId, post.tribeId);

  const newPinned = !post.isPinned;
  await db.update(posts).set({ isPinned: newPinned }).where(eq(posts.id, postId));

  return { pinned: newPinned };
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
  // Get current user for block filtering (optional — unauthenticated users still get results)
  let currentUserId: string | undefined;
  try {
    currentUserId = await requireAuth();
  } catch {
    // Not logged in — no block filtering
  }
  const { searchAll: fn } = await import('@/lib/services/search-service');
  return fn(query.trim(), 5, currentUserId);
}

// ======== MESSAGING ========
export async function sendMessage(
  bondId: string,
  ciphertextBase64: string,
  attachment?: { fileId: string; fileName: string; fileType: string; fileSize: number; encryptionMeta: string },
  replyToId?: string,
) {
  const userId = await requireAuth();
  await postLimiter.check(userId);

  // Enforce bond status — reject messages on dormant/expired bonds
  const { db } = await import('@/db');
  const { bonds } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');
  const { computePasskeyStatus } = await import('@/lib/crypto/passkey-lifecycle');

  const [bond] = await db.select({
    bondType: bonds.bondType,
    targetType: bonds.targetType,
    expiresAt: bonds.expiresAt,
  }).from(bonds)
    .where(and(eq(bonds.id, bondId), eq(bonds.userId, userId)))
    .limit(1);

  if (!bond) throw new Error('Bond not found.');
  if (bond.expiresAt) {
    const status = computePasskeyStatus({ expiresAt: bond.expiresAt }, bond.bondType ?? 'person', bond.targetType ?? 'user');
    if (status === 'dormant' || status === 'expired') {
      throw new Error(`Cannot send messages on a ${status} bond.`);
    }
  }

  const { sendMessage: fn } = await import('@/lib/services/message-service');
  const row = await fn(bondId, userId, ciphertextBase64, attachment, replyToId);
  return {
    ...row,
    ciphertext: row.ciphertext ? Buffer.from(row.ciphertext).toString('base64') : null,
  };
}

export async function getMessagesForBond(bondId: string, limit?: number, beforeTimestamp?: Date) {
  const userId = await requireAuth();
  const { getMessages: fn } = await import('@/lib/services/message-service');
  const rows = await fn(bondId, userId, limit, beforeTimestamp);
  // Serialize Buffer → base64 string for the RSC boundary
  // (Next.js can't pass Uint8Array/Buffer to Client Components)
  return rows.map(r => ({
    ...r,
    ciphertext: r.ciphertext ? Buffer.from(r.ciphertext).toString('base64') : null,
  }));
}

export async function markMessagesRead(bondId: string) {
  const userId = await requireAuth();
  // Whether to expose the read receipt to the sender is decided server-side
  // from the user's stored preference — it can't be spoofed by the client.
  const { getPreferences } = await import('@/lib/services/notification-service');
  const prefs = await getPreferences(userId);
  const { markRead: fn } = await import('@/lib/services/message-service');
  return fn(bondId, userId, prefs.readReceiptsEnabled);
}

export async function editMessage(messageId: string, ciphertextBase64: string) {
  const userId = await requireAuth();
  await postLimiter.check(userId);
  const { editMessage: fn } = await import('@/lib/services/message-service');
  return fn(messageId, userId, ciphertextBase64);
}

export async function deleteMessage(messageId: string) {
  const userId = await requireAuth();
  const { deleteMessage: fn } = await import('@/lib/services/message-service');
  return fn(messageId, userId);
}

export async function getUnreadMessageCount() {
  const userId = await getCurrentUserId();
  if (!userId) return 0;
  const { getUnreadCount: fn } = await import('@/lib/services/message-service');
  return fn(userId);
}

/**
 * Returns the user's recent conversations for the chat preview strip.
 * Only includes user bonds (not tribe bonds) with at least one message.
 */
export async function getRecentConversations(limit = 50): Promise<Array<{
  bondId: string;
  targetName: string;
  targetInitials: string;
  lastMessage: string;
  lastMessageAt: Date;
  isEncrypted: boolean;
  unreadCount: number;
}>> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { db } = await import('@/db');
  const { bonds, messages } = await import('@/db/schema');
  const { eq, and, or, desc, sql } = await import('drizzle-orm');

  // Get user bonds (person-to-person only)
  const userBonds = await db.select({
    id: bonds.id,
    targetId: bonds.targetId,
    targetName: bonds.targetName,
    targetType: bonds.targetType,
  }).from(bonds)
    .where(and(eq(bonds.userId, userId), eq(bonds.targetType, 'user')));

  if (userBonds.length === 0) return [];

  // For each bond, get the latest message (checking both bond IDs)
  const conversations: Array<{
    bondId: string;
    targetName: string;
    targetInitials: string;
    lastMessage: string;
    lastMessageAt: Date;
    isEncrypted: boolean;
    unreadCount: number;
  }> = [];

  for (const bond of userBonds) {
    // Resolve peer's bond ID so we see messages they sent under their bond row
    const [peerBond] = await db.select({ id: bonds.id })
      .from(bonds)
      .where(and(eq(bonds.userId, bond.targetId), eq(bonds.targetId, userId)))
      .limit(1);

    const bondFilter = peerBond
      ? or(eq(messages.bondId, bond.id), eq(messages.bondId, peerBond.id))!
      : eq(messages.bondId, bond.id);

    const [latestMsg] = await db.select({
      plaintext: messages.plaintext,
      ciphertext: messages.ciphertext,
      sentAt: messages.sentAt,
    }).from(messages)
      .where(bondFilter)
      .orderBy(desc(messages.sentAt))
      .limit(1);

    if (latestMsg && latestMsg.sentAt) {
      const initials = bond.targetName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      const isEnc = !!latestMsg.ciphertext;

      // Count unread messages (sent by others, not yet seen). Uses seenAt
      // (local view), not readAt (shared receipt), so the badge clears even
      // when the user has read receipts disabled.
      const { isNull, ne } = await import('drizzle-orm');
      const [unreadRow] = await db.select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(and(bondFilter, ne(messages.senderId, userId), isNull(messages.seenAt))!);
      const unreadCount = unreadRow?.count ?? 0;

      conversations.push({
        bondId: bond.id,
        targetName: bond.targetName,
        targetInitials: initials,
        lastMessage: isEnc ? '🔒 Encrypted message' : (latestMsg.plaintext ?? ''),
        lastMessageAt: latestMsg.sentAt,
        isEncrypted: isEnc,
        unreadCount,
      });
    }
  }

  // Sort by most recent and limit
  conversations.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  return conversations.slice(0, limit);
}

/**
 * Returns active person bonds where chat can be initiated but no messages exist yet.
 * Used by the "New Chat" picker on the /chat page.
 */
export async function getChatEligibleBonds(): Promise<Array<{
  bondId: string;
  targetName: string;
  targetInitials: string;
}>> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { db } = await import('@/db');
  const { bonds } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  // "New Chat" is a contact picker: list every active person bond so the user
  // can open a thread (new OR existing) with one tap.
  //
  // NOTE: we intentionally do NOT gate on `allowChatInitiation`. That column
  // defaults to false, is never set true anywhere, and gates nothing about
  // actual messaging (sending a message doesn't check it) — gating the picker
  // on it just made this list permanently empty. We also no longer exclude
  // bonds that already have messages: tapping one simply opens its thread,
  // which is standard compose-picker behavior and avoids an empty dialog when
  // all of a user's bonds already have conversations.
  const userBonds = await db.select({
    id: bonds.id,
    targetName: bonds.targetName,
    passkeyStatus: bonds.passkeyStatus,
  }).from(bonds)
    .where(and(
      eq(bonds.userId, userId),
      eq(bonds.targetType, 'user'),
    ));

  return userBonds
    .filter(b => b.passkeyStatus !== 'dormant' && b.passkeyStatus !== 'expired')
    .map(bond => ({
      bondId: bond.id,
      targetName: bond.targetName,
      targetInitials: bond.targetName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase(),
    }));
}

export async function getLatestMessagePreview(bondId: string) {
  // SECURITY: Require authentication — this function is called in a loop over
  // the caller's bonds, but without an auth check a server action could be
  // invoked directly to read the latest message metadata for any bondId.
  // The message-service verifies bond membership internally via resolveBondPair.
  await requireAuth();
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

export async function markActivityViewed() {
  const userId = await getCurrentUserId();
  if (!userId) return;
  const { markActivityViewed: fn } = await import('@/lib/services/notification-service');
  await fn(userId);
}

/**
 * Server action: Mark a single activity item as read (cross-device).
 */
export async function markSingleActivityRead(activityId: string) {
  const userId = await getCurrentUserId();
  if (!userId) return;
  const { markSingleActivityRead: fn } = await import('@/lib/services/notification-service');
  await fn(userId, activityId);
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
  governanceEnabled?: boolean;
  readReceiptsEnabled?: boolean;
  typingIndicatorsEnabled?: boolean;
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
import { z } from 'zod';

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048).or(z.literal('local-dev-simulator')).or(z.string().min(1).max(512)), // Allows URL (web) or raw token (native)
  keys: z.object({
    p256dh: z.string().max(512).optional(),
    auth: z.string().max(512).optional(),
  }).optional(),
  platform: z.enum(['web', 'ios', 'android']).optional(),
  // ⚠️ APNs sandbox flag — see push-service.ts for why this must NOT be removed.
  apnsSandbox: z.boolean().optional(),
});

export async function registerPushSubscriptionAction(subscription: {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
  platform?: 'web' | 'ios' | 'android';
  apnsSandbox?: boolean;
}) {
  const userId = await requireAuth();
  
  // Validate input
  const parsed = pushSubscriptionSchema.parse(subscription);

  const { registerPushSubscription: fn } = await import('@/lib/services/push-service');
  return fn(userId, parsed);
}

export async function removePushSubscriptionAction(platform?: 'web' | 'ios' | 'android') {
  const userId = await requireAuth();
  const { removePushSubscription: fn } = await import('@/lib/services/push-service');
  return fn(userId, platform);
}

export async function hasPushSubscription() {
  const userId = await getCurrentUserId();
  if (!userId) return false;
  const { hasActivePushSubscription: fn } = await import('@/lib/services/push-service');
  return fn(userId);
}

/**
 * Server action: Get post data for Open Graph previews.
 * Returns post title, truncated content, and image if and ONLY if:
 * 1. The post belongs to a public tribe.
 * 2. The post is not encrypted.
 */
export async function getPostForOg(postId: string): Promise<{
  title: string | null;
  content: string;
  imageUrl: string | null;
  tribeName: string | null;
  tribeSlug: string | null;
  postSlug: string | null;
} | null> {
  const { db } = await import('@/db');
  const { posts, tribes } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const [row] = await db.select({
    title: posts.title,
    content: posts.content,
    imageUrl: posts.imageUrl,
    imageUrls: posts.imageUrls,
    isEncrypted: posts.isEncrypted,
    postSlug: posts.slug,
    tribeName: tribes.name,
    tribeSlug: tribes.slug,
    isPublic: tribes.isPublic,
  })
    .from(posts)
    .leftJoin(tribes, eq(posts.tribeId, tribes.id))
    .where(eq(posts.id, postId))
    .limit(1);

  if (!row) return null;

  // Security gate: only unfurl for public, non-encrypted content
  if (!row.isPublic || row.isEncrypted) {
    return {
      title: null,
      content: "A private post on Tribes.",
      imageUrl: null,
      tribeName: row.tribeName || "a private tribe",
      tribeSlug: row.tribeSlug || null,
      postSlug: row.postSlug || null,
    };
  }

  // Determine the best image to show
  const displayImage = row.imageUrl || (row.imageUrls && row.imageUrls.length > 0 ? row.imageUrls[0] : null);

  return {
    title: row.title,
    content: row.content.substring(0, 200) + (row.content.length > 200 ? '...' : ''),
    imageUrl: displayImage,
    tribeName: row.tribeName,
    tribeSlug: row.tribeSlug,
    postSlug: row.postSlug,
  };
}

// ======== NCII COMPLIANCE ACTIONS ========

/**
 * Fetch all NCII reports for admin review, sorted by SLA deadline.
 * Global admin only.
 */
export async function getActiveNciiReportsAction() {
  const { requireAdmin } = await import('./shared');
  await requireAdmin();

  const { getActiveNciiReports } = await import('@/lib/services/ncii-service');
  return await getActiveNciiReports();
}

/**
 * Resolve an NCII report with administrative action.
 * Global admin only.
 */
export async function resolveNciiReportAction(
  reportId: string,
  action: 'content_removed' | 'content_not_found' | 'insufficient_info' | 'not_ncii',
  actionNotes?: string
) {
  const { requireAdmin } = await import('./shared');
  const adminId = await requireAdmin();

  const { resolveNciiReport } = await import('@/lib/services/ncii-service');
  await resolveNciiReport(reportId, adminId, action, actionNotes);
}

/**
 * Server action: Fuzzy search usernames/names for NCII admin assistance.
 * Global admin only.
 */
export async function fuzzySearchUsername(query: string) {
  const { requireAdmin } = await import('./shared');
  await requireAdmin();

  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return [];
  // Cap length to prevent oversized LIKE patterns
  if (trimmed.length > 100) return [];

  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { or, ilike } = await import('drizzle-orm');

  // Escape SQL LIKE wildcards to prevent wildcard injection
  // (e.g., input "%" matching every user in the database)
  const escaped = trimmed.replace(/[%_]/g, '\\$&');

  return await db.select({
    id: users.id,
    username: users.username,
    name: users.name,
    avatar: users.avatar,
    slug: users.slug,
  })
    .from(users)
    .where(or(
      ilike(users.username, `%${escaped}%`),
      ilike(users.name, `%${escaped}%`)
    ))
    .limit(10);
}

/**
 * Allows a comment author to delete their own comment, cascading down to all replies, reactions, and decrementing the post comment count.
 */
export async function deleteOwnComment(commentId: string): Promise<void> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { comments, vibes, mentions, posts } = await import('@/db/schema');
  const { eq, inArray, and, sql } = await import('drizzle-orm');

  // Verify the comment exists and author is userId
  const [comment] = await db
    .select({
      id: comments.id,
      authorId: comments.authorId,
      postId: comments.postId,
    })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);

  if (!comment) throw new Error('Comment not found.');
  if (comment.authorId !== userId) {
    throw new Error('You can only delete your own comments.');
  }

  // Find all comments for this post to build an in-memory subtree
  const postComments = await db
    .select({ id: comments.id, parentCommentId: comments.parentCommentId })
    .from(comments)
    .where(eq(comments.postId, comment.postId));

  // Build child map
  const childMap: Record<string, string[]> = {};
  for (const c of postComments) {
    if (c.parentCommentId) {
      if (!childMap[c.parentCommentId]) {
        childMap[c.parentCommentId] = [];
      }
      childMap[c.parentCommentId].push(c.id);
    }
  }

  // Collect the comment's subtree IDs using BFS
  const allDeletedIds: string[] = [];
  const queue = [commentId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    allDeletedIds.push(currentId);
    const children = childMap[currentId];
    if (children) {
      queue.push(...children);
    }
  }

  // All deletes in a single transaction — if any step fails, everything rolls back
  // so we never leave orphaned vibes/mentions rows as garbage.
  await db.transaction(async (tx) => {
    // 1. Delete associated vibes (reactions)
    if (allDeletedIds.length > 0) {
      await tx.delete(vibes).where(inArray(vibes.targetId, allDeletedIds));
    }

    // 2. Delete associated mentions
    if (allDeletedIds.length > 0) {
      await tx
        .delete(mentions)
        .where(
          and(
            eq(mentions.sourceType, 'comment'),
            inArray(mentions.sourceId, allDeletedIds)
          )
        );
    }

    // 3. Delete comments themselves
    if (allDeletedIds.length > 0) {
      await tx.delete(comments).where(inArray(comments.id, allDeletedIds));
    }

    // 4. Decrement post's commentCount
    await tx
      .update(posts)
      .set({
        commentCount: sql`GREATEST(${posts.commentCount} - ${allDeletedIds.length}, 0)`,
      })
      .where(eq(posts.id, comment.postId));
  });
}

/**
 * Searches for users to @mention by matching reservedAlias, name, or alias in userAliases.
 */
export async function searchMentionableUsers(query: string): Promise<Array<{
  id: string;
  name: string;
  alias: string;
  avatar?: string;
}>> {
  const userId = await requireAuth();
  if (!query || query.trim().length < 1) return [];

  const escaped = query.trim().replace(/[%_\\]/g, '\\$&');
  const pattern = `%${escaped}%`;

  const { db } = await import('@/db');
  const { users, userAliases, blockedUsers } = await import('@/db/schema');
  const { sql, and, or, ilike, ne, eq } = await import('drizzle-orm');

  const blockedIdsSql = sql`(
    SELECT ${blockedUsers.blockedUserId} FROM ${blockedUsers} WHERE ${blockedUsers.userId} = ${userId}
    UNION
    SELECT ${blockedUsers.userId} FROM ${blockedUsers} WHERE ${blockedUsers.blockedUserId} = ${userId}
  )`;

  // Select matching users with left join to userAliases
  const matches = await db.select({
    id: users.id,
    name: users.name,
    reservedAlias: users.reservedAlias,
    reservedAliasAvatar: users.reservedAliasAvatar,
    userAvatar: users.avatar,
    alias: userAliases.alias,
    aliasAvatar: userAliases.avatar,
  })
  .from(users)
  .leftJoin(userAliases, eq(users.id, userAliases.userId))
  .where(and(
    ne(users.id, userId),
    sql`${users.id} NOT IN ${blockedIdsSql}`,
    or(
      ilike(users.reservedAlias, pattern),
      ilike(users.name, pattern),
      ilike(userAliases.alias, pattern)
    )
  ))
  .limit(30);

  const result: Array<{ id: string, name: string, alias: string, avatar?: string }> = [];
  const seenUserIds = new Set<string>();

  for (const m of matches) {
    if (seenUserIds.has(m.id)) continue;
    seenUserIds.add(m.id);

    const alias = (m.reservedAlias || m.alias || m.name.toLowerCase().replace(/\s+/g, '-')).replace(/^@+/, '');
    const avatar = m.reservedAliasAvatar || m.aliasAvatar || m.userAvatar || undefined;

    result.push({
      id: m.id,
      name: m.name,
      alias,
      avatar,
    });

    if (result.length >= 6) break;
  }

  return result;
}

export async function reconcileVibeCounts(): Promise<{ postsReconciled: number; commentsReconciled: number }> {
  const { requireAdmin } = await import('./shared');
  await requireAdmin();
  const { db } = await import('@/db');
  const { sql } = await import('drizzle-orm');
  
  const postRes = await db.execute(sql`
    WITH post_counts AS (
      SELECT p.id, COALESCE(COUNT(v.id), 0)::int as actual_count
      FROM posts p
      LEFT JOIN vibes v ON v.target_id = p.id AND v.target_type = 'post'
      GROUP BY p.id
    )
    UPDATE posts p
    SET vibe_count = pc.actual_count
    FROM post_counts pc
    WHERE p.id = pc.id AND p.vibe_count != pc.actual_count
  `);
  
  const commentRes = await db.execute(sql`
    WITH comment_counts AS (
      SELECT c.id, COALESCE(COUNT(v.id), 0)::int as actual_count
      FROM comments c
      LEFT JOIN vibes v ON v.target_id = c.id AND v.target_type = 'comment'
      GROUP BY c.id
    )
    UPDATE comments c
    SET vibe_count = cc.actual_count
    FROM comment_counts cc
    WHERE c.id = cc.id AND c.vibe_count != cc.actual_count
  `);

  return {
    postsReconciled: postRes.rowCount ?? 0,
    commentsReconciled: commentRes.rowCount ?? 0,
  };
}



