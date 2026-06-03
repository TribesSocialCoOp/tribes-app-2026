/**
 * @fileoverview Unified feed service for the Concentric Rings model.
 * Task 2.1 + 2.5: Fetches all content types (ring posts, bond messages, mood stream posts,
 * pinned wall updates) into a single unified feed, with ring and mood filtering.
 */
import { db } from '@/db';
import { posts, bonds, postMoodTags, blockedUsers, tribeMembers, tribes, users, vibes } from '@/db/schema';
import { eq, desc, and, or, inArray } from 'drizzle-orm';
import { getBlockedAuthorIds, getUserTribeIds, getUserTribeRoles } from './query-helpers';
import type { CommunicationItem, Ring } from '@/lib/types';
import { rowToTribePost } from '@/lib/mappers/post-mapper';
import { moodsData } from '@/lib/moods-data';
import { computePasskeyStatus } from '@/lib/crypto/passkey-lifecycle';

/**
 * Helper: Batch-fetch live avatars and names for a set of user IDs.
 * Returns { avatar, name } so callers can skip the live avatar override
 * when a post was authored under an alias (authorName ≠ user.name).
 */
async function batchFetchLiveAvatarInfo(userIds: string[]): Promise<Map<string, { avatar: string | null; name: string; slug: string | null }>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const rows = await db.select({ id: users.id, avatar: users.avatar, name: users.name, slug: users.slug })
    .from(users)
    .where(inArray(users.id, uniqueIds));
  return new Map(rows.map(r => [r.id, { avatar: r.avatar, name: r.name, slug: r.slug }]));
}

/**
 * Helper: Batch-fetch vibes data (top 3 + hasVibed) for post IDs.
 */
async function batchFetchVibesData(postIds: string[], viewerUserId: string): Promise<{
  vibesByPost: Map<string, { emoji: string; count: number }[]>;
  hasVibedByPost: Map<string, boolean>;
  vibeDetailsByPost: Map<string, { emoji: string; userId: string; userName: string }[]>;
}> {
  if (postIds.length === 0) {
    return { vibesByPost: new Map(), hasVibedByPost: new Map(), vibeDetailsByPost: new Map() };
  }
  
  const allVibes = await db.select({
      id: vibes.id,
      userId: vibes.userId,
      targetId: vibes.targetId,
      emoji: vibes.emoji,
      userName: users.name,
    })
    .from(vibes)
    .leftJoin(users, eq(vibes.userId, users.id))
    .where(and(inArray(vibes.targetId, postIds), eq(vibes.targetType, 'post')));
    
  const vibesByPost = new Map<string, { emoji: string; count: number }[]>();
  const hasVibedByPost = new Map<string, boolean>();
  const vibeDetailsByPost = new Map<string, { emoji: string; userId: string; userName: string }[]>();
  
  const rawVibesByPost = new Map<string, typeof allVibes>();
  for (const v of allVibes) {
    if (!rawVibesByPost.has(v.targetId)) rawVibesByPost.set(v.targetId, []);
    rawVibesByPost.get(v.targetId)!.push(v);
  }
  
  for (const postId of postIds) {
    const postVibes = rawVibesByPost.get(postId) ?? [];
    hasVibedByPost.set(postId, postVibes.some(v => v.userId === viewerUserId));
    
    const emojiCounts = new Map<string, number>();
    for (const v of postVibes) {
      emojiCounts.set(v.emoji, (emojiCounts.get(v.emoji) ?? 0) + 1);
    }
    const recentVibes = Array.from(emojiCounts.entries())
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    vibesByPost.set(postId, recentVibes);

    const details = postVibes.map(v => ({
      emoji: v.emoji,
      userId: v.userId,
      userName: v.userName ?? 'Someone',
    }));
    vibeDetailsByPost.set(postId, details);
  }
  
  return { vibesByPost, hasVibedByPost, vibeDetailsByPost };
}

/**
 * Helper: Batch-fetch author roles in their respective tribes.
 * Takes a list of { tribeId, userId } pairs.
 */
async function batchFetchAuthorTribeRoles(pairs: { tribeId: string; userId: string }[]): Promise<Map<string, 'founder' | 'speaker' | 'member'>> {
  if (pairs.length === 0) return new Map();
  
  // Group by tribe to minimize queries
  const tribeToUsers = new Map<string, string[]>();
  for (const { tribeId, userId } of pairs) {
    if (!tribeToUsers.has(tribeId)) tribeToUsers.set(tribeId, []);
    tribeToUsers.get(tribeId)!.push(userId);
  }

  const roleMap = new Map<string, 'founder' | 'speaker' | 'member'>();
  
  await Promise.all(Array.from(tribeToUsers.entries()).map(async ([tribeId, userIds]) => {
    const rows = await db.select({ userId: tribeMembers.userId, role: tribeMembers.role })
      .from(tribeMembers)
      .where(and(eq(tribeMembers.tribeId, tribeId), inArray(tribeMembers.userId, userIds)));
    
    for (const r of rows) {
      roleMap.set(`${tribeId}:${r.userId}`, r.role as 'founder' | 'speaker' | 'member' || 'member');
    }
  }));

  return roleMap;
}

interface UnifiedFeedParams {
  userId: string;
  ringFilter?: Ring | 'all' | 'streams';
  moodSlugs?: string[];
  limit?: number;
  offset?: number;
}

/**
 * Returns a unified feed of CommunicationItems sorted by timestamp.
 *
 * Filtering rules:
 *  - all:          bond messages + ring posts + mood streams
 *  - journal:      only the user's own journal posts
 *  - inner_circle: posts from inner-circle bonds + user's own inner_circle posts
 *  - my_people:    posts from all bonded users + user's own my_people posts
 *  - tribes:       posts from tribes the user belongs to
 *  - streams:      mood-stream promoted posts only
 *
 * Mood filter further narrows when specified.
 */
export async function getUnifiedFeed(params: UnifiedFeedParams): Promise<CommunicationItem[]> {
  const { userId, ringFilter = 'all', moodSlugs = [], limit = 50, offset = 0 } = params;

  // Pre-fetch common lookups
  const [blockedIds, userBonds, userTribeIds, userTribeRoles] = await Promise.all([
    getBlockedAuthorIds(userId),
    getUserBonds(userId),
    getUserTribeIds(userId),
    getUserTribeRoles(userId),
  ]);

  const tribeRows = userTribeIds.length > 0 
    ? await db.select({ id: tribes.id, name: tribes.name, slug: tribes.slug }).from(tribes).where(inArray(tribes.id, userTribeIds))
    : [];
  const tribeNameMap = new Map(tribeRows.map(t => [t.id, t.name]));
  const tribeSlugMap = new Map(tribeRows.map(t => [t.id, t.slug]));

  const items: CommunicationItem[] = [];

  // NOTE: Bond messages (chat) are intentionally excluded from the feed.
  // Chat notifications are routed exclusively through the Activity tab,
  // which aggregates unread messages per-thread and links to /bonds/{bondId}.
  // See notification-service.ts getActivityFeed() for the unread_message type.

  // ── Ring-based Posts ──────────────────────────────────────────────────────
  const ringPosts = await fetchRingPosts(userId, ringFilter, userBonds, userTribeIds, blockedIds, moodSlugs, userTribeRoles, tribeNameMap, tribeSlugMap);
  items.push(...ringPosts);

  // ── Mood Stream Posts (promoted posts) ────────────────────────────────────
  if (ringFilter === 'all' || ringFilter === 'streams') {
    const streamPosts = await fetchMoodStreamPosts(userId, blockedIds, moodSlugs, userTribeRoles);
    items.push(...streamPosts);
  }

  // ── Inner Circle Wall Updates (Task 2.5) ──────────────────────────────────
  if (ringFilter === 'all' || ringFilter === 'inner_circle') {
    const wallUpdates = await fetchInnerCircleWallPosts(userId, userBonds, blockedIds);
    items.push(...wallUpdates);
  }

  // Deduplicate (a post can appear as ring-post AND mood-stream)
  const seen = new Set<string>();
  const deduped = items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  // ── Enrichment (Task 2.1 + Emote View Fix) ────────────────────────────────
  const postItems = deduped.filter(i => i.type === 'ring-post' || i.type === 'mood-stream');
  const postIds = postItems.map(i => i.id);
  const authorIds = deduped.map(i => i.authorId || i.bondTargetId).filter(Boolean) as string[];

  const tribeAuthorPairs = deduped
    .filter(i => i.tribeId && i.authorId)
    .map(i => ({ tribeId: i.tribeId!, userId: i.authorId! }));

  const [liveAvatarInfo, vibesData, authorRoles] = await Promise.all([
    batchFetchLiveAvatarInfo(authorIds),
    batchFetchVibesData(postIds, userId),
    batchFetchAuthorTribeRoles(tribeAuthorPairs),
  ]);

  // Batch-fetch tribe membership aliases so we can distinguish real alias posts
  // from simple name-change mismatches in the enrichment loop.
  const tribeAuthorLookups = deduped
    .filter(i => i.tribeId && i.authorId)
    .map(i => ({ tribeId: i.tribeId!, userId: i.authorId! }));
  
  const memberAliasMap = new Map<string, string | null>();
  if (tribeAuthorLookups.length > 0) {
    const uniqueTribeIds = [...new Set(tribeAuthorLookups.map(l => l.tribeId))];
    const uniqueUserIds = [...new Set(tribeAuthorLookups.map(l => l.userId))];
    const aliasRows = await db.select({
      tribeId: tribeMembers.tribeId,
      userId: tribeMembers.userId,
      joinedAsAlias: tribeMembers.joinedAsAlias,
    }).from(tribeMembers)
      .where(and(
        inArray(tribeMembers.tribeId, uniqueTribeIds),
        inArray(tribeMembers.userId, uniqueUserIds),
      ));
    for (const r of aliasRows) {
      memberAliasMap.set(`${r.tribeId}:${r.userId}`, r.joinedAsAlias);
    }
  }

  for (const item of deduped) {
    // 1. Live Avatar + Name — only override if the post was NOT authored under an alias
    const userIdForAvatar = item.authorId || item.bondTargetId;
    if (userIdForAvatar) {
      const info = liveAvatarInfo.get(userIdForAvatar);
      if (info) {
        // A post is an alias post only when the author explicitly joined the tribe
        // under an alias AND the stored sender matches that alias.
        const memberAlias = (item.tribeId && item.authorId)
          ? memberAliasMap.get(`${item.tribeId}:${item.authorId}`)
          : null;
        const isAliasPost = !!(memberAlias && item.sender === memberAlias);
        
        if (!isAliasPost) {
          if (info.avatar) item.avatarSrc = info.avatar;
          // Sync the live name so posts reflect current display name
          if (info.name) item.sender = info.name;
        }
        item.authorIsAlias = isAliasPost;
      }
      // Set authorSlug for direct profile linking
      item.authorSlug = info?.slug ?? undefined;
    }
    // 2. Vibes Enrichment
    if (vibesData.vibesByPost.has(item.id)) {
      item.recentVibes = vibesData.vibesByPost.get(item.id);
      item.hasVibed = vibesData.hasVibedByPost.get(item.id);
      
      // vibeDetails: only populate for the post author
      if (userId === item.authorId && vibesData.vibeDetailsByPost.has(item.id)) {
        item.vibeDetails = vibesData.vibeDetailsByPost.get(item.id);
      }
    }
    // 3. Author Role Enrichment
    if (item.tribeId && item.authorId) {
      item.authorTribeRole = authorRoles.get(`${item.tribeId}:${item.authorId}`);
    }
  }

  // Sort by timestamp descending and apply pagination
  deduped.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return deduped.slice(offset, offset + limit);
}

// ─── Internal Helpers ───────────────────────────────────────────────────────


interface BondInfo {
  id: string;
  targetId: string | null;
  targetName: string;
  targetType: string;
  bondType: string;
  innerCircle: boolean;
  lastRefreshedAt: Date | null;
  expiresAt: Date | null;
}

/**
 * Returns true if the bond is active or fading (not dormant/expired).
 * This is the trust boundary: dormant/expired bonds lose content access.
 */
function isActiveBond(bond: BondInfo): boolean {
  if (!bond.expiresAt) return true; // Legacy bonds without expiry are treated as active
  const status = computePasskeyStatus(
    { expiresAt: bond.expiresAt },
    bond.bondType,
    bond.targetType,
  );
  return status === 'active' || status === 'fading';
}

async function getUserBonds(userId: string): Promise<BondInfo[]> {
  const rows = await db.select({
    id: bonds.id,
    targetId: bonds.targetId,
    targetName: bonds.targetName,
    targetType: bonds.targetType,
    bondType: bonds.bondType,
    innerCircle: bonds.innerCircle,
    lastRefreshedAt: bonds.lastRefreshedAt,
    expiresAt: bonds.expiresAt,
  }).from(bonds).where(eq(bonds.userId, userId));

  return rows.map(r => ({
    ...r,
    innerCircle: r.innerCircle ?? false,
    lastRefreshedAt: r.lastRefreshedAt ?? null,
    expiresAt: r.expiresAt ?? null,
  }));
}


/**
 * Fetches ring-based posts (journal, inner_circle, my_people, tribes).
 */
async function fetchRingPosts(
  userId: string,
  ringFilter: string,
  userBonds: BondInfo[],
  userTribeIds: string[],
  blockedIds: string[],
  moodSlugs: string[],
  userTribeRoles: Record<string, string>,
  tribeNameMap: Map<string, string>,
  tribeSlugMap: Map<string, string | null>,
): Promise<CommunicationItem[]> {
  const items: CommunicationItem[] = [];

  // Journal posts (own posts only)
  if (ringFilter === 'all' || ringFilter === 'journal') {
    const journalRows = await db.select().from(posts)
      .where(and(eq(posts.authorId, userId), eq(posts.ring, 'journal')))
      .orderBy(desc(posts.createdAt))
      .limit(20);

    for (const row of journalRows) {
      if (moodSlugs.length > 0 && (!row.moodTag || !moodSlugs.includes(row.moodTag))) continue;
      const tribeName = row.tribeId ? tribeNameMap.get(row.tribeId) : undefined;
      const tribeSlug = row.tribeId ? tribeSlugMap.get(row.tribeId) : undefined;
      const role = row.tribeId ? userTribeRoles[row.tribeId] : undefined;
      items.push(postRowToFeedItem(row, 'journal', false, tribeName, role, tribeSlug));
    }
  }

  // Inner Circle posts
  if (ringFilter === 'all' || ringFilter === 'inner_circle') {
    const innerCircleBondTargetIds = userBonds
      .filter(b => b.innerCircle && b.targetType === 'user' && b.targetId)
      .filter(b => isActiveBond(b)) // Enforce bond status boundary
      .map(b => b.targetId!)
      .filter(id => !blockedIds.includes(id));

    if (innerCircleBondTargetIds.length > 0) {
      const icRows = await db.select().from(posts)
        .where(and(eq(posts.ring, 'inner_circle'), inArray(posts.authorId, innerCircleBondTargetIds)))
        .orderBy(desc(posts.createdAt))
        .limit(20);

      for (const row of icRows) {
        if (moodSlugs.length > 0 && (!row.moodTag || !moodSlugs.includes(row.moodTag))) continue;
        const tribeName = row.tribeId ? tribeNameMap.get(row.tribeId) : undefined;
        const tribeSlug = row.tribeId ? tribeSlugMap.get(row.tribeId) : undefined;
        const role = row.tribeId ? userTribeRoles[row.tribeId] : undefined;
        items.push(postRowToFeedItem(row, 'inner_circle', false, tribeName, role, tribeSlug));
      }
    }

    // Also include user's own inner_circle posts
    const ownIcRows = await db.select().from(posts)
      .where(and(eq(posts.authorId, userId), eq(posts.ring, 'inner_circle')))
      .orderBy(desc(posts.createdAt))
      .limit(10);
    for (const row of ownIcRows) {
      if (moodSlugs.length > 0 && (!row.moodTag || !moodSlugs.includes(row.moodTag))) continue;
      const tribeName = row.tribeId ? tribeNameMap.get(row.tribeId) : undefined;
      const tribeSlug = row.tribeId ? tribeSlugMap.get(row.tribeId) : undefined;
      const role = row.tribeId ? userTribeRoles[row.tribeId] : undefined;
      items.push(postRowToFeedItem(row, 'inner_circle', false, tribeName, role, tribeSlug));
    }
  }

  // My People posts
  if (ringFilter === 'all' || ringFilter === 'my_people') {
    const allBondTargetIds = userBonds
      .filter(b => b.targetType === 'user' && b.targetId)
      .filter(b => isActiveBond(b)) // Enforce bond status boundary
      .map(b => b.targetId!)
      .filter(id => !blockedIds.includes(id));

    if (allBondTargetIds.length > 0) {
      const mpRows = await db.select().from(posts)
        .where(and(eq(posts.ring, 'my_people'), inArray(posts.authorId, allBondTargetIds)))
        .orderBy(desc(posts.createdAt))
        .limit(20);

      for (const row of mpRows) {
        if (moodSlugs.length > 0 && (!row.moodTag || !moodSlugs.includes(row.moodTag))) continue;
        const tribeName = row.tribeId ? tribeNameMap.get(row.tribeId) : undefined;
        const tribeSlug = row.tribeId ? tribeSlugMap.get(row.tribeId) : undefined;
        const role = row.tribeId ? userTribeRoles[row.tribeId] : undefined;
        items.push(postRowToFeedItem(row, 'my_people', false, tribeName, role, tribeSlug));
      }
    }

    // Own my_people posts
    const ownMpRows = await db.select().from(posts)
      .where(and(eq(posts.authorId, userId), eq(posts.ring, 'my_people')))
      .orderBy(desc(posts.createdAt))
      .limit(10);
    for (const row of ownMpRows) {
      if (moodSlugs.length > 0 && (!row.moodTag || !moodSlugs.includes(row.moodTag))) continue;
      const tribeName = row.tribeId ? tribeNameMap.get(row.tribeId) : undefined;
      const tribeSlug = row.tribeId ? tribeSlugMap.get(row.tribeId) : undefined;
      const role = row.tribeId ? userTribeRoles[row.tribeId] : undefined;
      items.push(postRowToFeedItem(row, 'my_people', false, tribeName, role, tribeSlug));
    }
  }

  // Tribes posts
  if (ringFilter === 'all' || ringFilter === 'tribes') {
    if (userTribeIds.length > 0) {
      const tribeRows = await db.select().from(posts)
        .where(and(
          eq(posts.ring, 'tribes'),
          inArray(posts.tribeId, userTribeIds),
        ))
        .orderBy(desc(posts.createdAt))
        .limit(30);

      for (const row of tribeRows) {
        if (blockedIds.includes(row.authorId)) continue;
        if (moodSlugs.length > 0 && (!row.moodTag || !moodSlugs.includes(row.moodTag))) continue;
        const tribeName = row.tribeId ? tribeNameMap.get(row.tribeId) : undefined;
        const tribeSlug = row.tribeId ? tribeSlugMap.get(row.tribeId) : undefined;
        const role = row.tribeId ? userTribeRoles[row.tribeId] : undefined;
        items.push(postRowToFeedItem(row, 'tribes', false, tribeName, role, tribeSlug));
      }
    }
  }

  return items;
}

/**
 * Fetches mood stream posts (promoted posts across tribes).
 */
async function fetchMoodStreamPosts(
  userId: string,
  blockedIds: string[],
  moodSlugs: string[],
  userTribeRoles: Record<string, string>,
): Promise<CommunicationItem[]> {
  // Push filtering to the database with a proper join (Phase 7: replaces full table scan)
  const conditions = [eq(posts.isRemoved, false)];
  if (moodSlugs.length > 0) {
    conditions.push(inArray(postMoodTags.moodSlug, moodSlugs));
  }

  const streamRows = await db
    .select({
      post: posts,
      moodSlug: postMoodTags.moodSlug,
      promotedAt: postMoodTags.promotedAt,
      promotedBy: postMoodTags.promotedBy,
    })
    .from(postMoodTags)
    .innerJoin(posts, eq(posts.id, postMoodTags.postId))
    .where(and(...conditions))
    .orderBy(desc(posts.createdAt))
    .limit(100);

  if (streamRows.length === 0) return [];

  // Batch-fetch tribes + promoters
  const tribeIds = [...new Set(streamRows.map(r => r.post.tribeId).filter(Boolean) as string[])];
  const promoterIds = [...new Set(streamRows.map(r => r.promotedBy).filter(Boolean) as string[])];

  const [allTribes, allPromoters] = await Promise.all([
    tribeIds.length > 0
      ? db.select({ id: tribes.id, name: tribes.name, slug: tribes.slug }).from(tribes).where(inArray(tribes.id, tribeIds))
      : [],
    promoterIds.length > 0
      ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, promoterIds))
      : [],
  ]);
  const tribeMap = new Map(allTribes.map(t => [t.id, t.name]));
  const tribeSlugMap = new Map(allTribes.map(t => [t.id, t.slug]));
  const promoterMap = new Map(allPromoters.map(u => [u.id, u.name]));

  const items: CommunicationItem[] = [];

  for (const row of streamRows) {
    const postRow = row.post;
    if (blockedIds.includes(postRow.authorId)) continue;

    const moodSlug = row.moodSlug;
    const moodDetails = moodsData.find(m => m.slug === moodSlug);
    const tribeName = postRow.tribeId ? tribeMap.get(postRow.tribeId) : undefined;
    const role = postRow.tribeId ? userTribeRoles[postRow.tribeId] : undefined;
    const promotedByName = row.promotedBy ? promoterMap.get(row.promotedBy) : undefined;

    items.push({
      id: postRow.id,
      type: 'mood-stream',
      authorId: postRow.authorId,
      authorSlug: undefined, // Populated during enrichment pass
      tribeName,
      tribeId: postRow.tribeId ?? undefined,
      tribeSlug: postRow.tribeId ? tribeSlugMap.get(postRow.tribeId) || undefined : undefined,
      content: postRow.content,
      title: postRow.title ?? undefined,
      slug: postRow.slug ?? undefined,
      moodSlug,
      moodName: moodDetails?.name || moodSlug,
      avatarSrc: postRow.authorAvatar ?? undefined,
      avatarFallback: postRow.authorAvatarFallback ?? postRow.authorName?.substring(0, 2) ?? 'U',
      timestamp: postRow.createdAt ?? new Date(),
      editedAt: postRow.editedAt ?? undefined,
      vibes: postRow.vibeCount ?? 0,
      comments: postRow.commentCount ?? 0,
      dataAiHint: postRow.dataAiHintAvatar ?? undefined,
      imageUrl: postRow.imageUrl ?? undefined,
      imageUrls: postRow.imageUrls ?? undefined,
      imageAlt: postRow.imageAlt ?? undefined,
      dataAiHintImage: postRow.dataAiHintImage ?? undefined,
      sender: postRow.authorName,
      promotedByName,
      currentUserTribeRole: role,
      // Link preview
      linkUrl: postRow.linkUrl ?? undefined,
      linkTitle: postRow.linkTitle ?? undefined,
      linkDescription: postRow.linkDescription ?? undefined,
      linkImage: postRow.linkImage ?? undefined,
      linkSiteName: postRow.linkSiteName ?? undefined,
    });
  }

  return items;
}

/**
 * Task 2.5: Fetches pinned journal posts from Inner Circle bonds.
 * These are "wall updates" that appear in the Inner Circle ring.
 */
async function fetchInnerCircleWallPosts(
  userId: string,
  userBonds: BondInfo[],
  blockedIds: string[],
): Promise<CommunicationItem[]> {
  const innerCircleBondTargetIds = userBonds
    .filter(b => b.innerCircle && b.targetType === 'user' && b.targetId)
    .map(b => b.targetId!)
    .filter(id => !blockedIds.includes(id));

  if (innerCircleBondTargetIds.length === 0) return [];

  const wallRows = await db.select().from(posts)
    .where(and(
      eq(posts.ring, 'journal'),
      eq(posts.pinnedToWall, true),
      inArray(posts.authorId, innerCircleBondTargetIds),
    ))
    .orderBy(desc(posts.createdAt))
    .limit(10);

  return wallRows.map(row => postRowToFeedItem(row, 'inner_circle', true));
}

/**
 * Converts a raw post DB row into a CommunicationItem for the unified feed.
 */
function postRowToFeedItem(
  row: typeof posts.$inferSelect,
  ring: Ring,
  isPinnedWallUpdate = false,
  tribeName?: string,
  currentUserTribeRole?: string,
  tribeSlug?: string | null,
): CommunicationItem {
  return {
    id: row.id,
    type: 'ring-post',
    ring,
    authorId: row.authorId,
    authorSlug: undefined, // Populated during enrichment pass
    sender: row.authorName,
    content: row.content,
    title: row.title ?? undefined,
    avatarSrc: row.authorAvatar ?? undefined,
    avatarFallback: row.authorAvatarFallback ?? row.authorName?.substring(0, 2) ?? 'U',
    timestamp: row.createdAt ?? new Date(),
    vibes: row.vibeCount ?? 0,
    dataAiHint: row.dataAiHintAvatar ?? undefined,
    imageUrl: row.imageUrl ?? undefined,
    imageUrls: row.imageUrls ?? undefined,
    imageAlt: row.imageAlt ?? undefined,
    dataAiHintImage: row.dataAiHintImage ?? undefined,
    moodSlug: row.moodTag ?? undefined,
    moodName: row.moodTag ? (moodsData.find(m => m.slug === row.moodTag)?.name || row.moodTag) : undefined,
    tribeId: row.tribeId ?? undefined,
    tribeName,
    tribeSlug: tribeSlug || undefined,
    slug: row.slug || undefined,
    currentUserTribeRole,
    pinnedToWall: isPinnedWallUpdate || (row.pinnedToWall ?? false),
    comments: row.commentCount ?? 0,
    // E2E encryption data (Phase 3)
    isEncrypted: row.isEncrypted ?? false,
    ciphertextBase64: row.ciphertext ? Buffer.from(row.ciphertext as Buffer).toString('base64') : undefined,
    encryptionIv: row.encryptionIv ?? undefined,
    editedAt: row.editedAt ?? undefined,
    // Link preview
    linkUrl: row.linkUrl ?? undefined,
    linkTitle: row.linkTitle ?? undefined,
    linkDescription: row.linkDescription ?? undefined,
    linkImage: row.linkImage ?? undefined,
    linkSiteName: row.linkSiteName ?? undefined,
  };
}
