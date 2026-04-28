/**
 * @fileoverview Unified feed service for the Concentric Rings model.
 * Task 2.1 + 2.5: Fetches all content types (ring posts, bond messages, mood stream posts,
 * pinned wall updates) into a single unified feed, with ring and mood filtering.
 */
import { db } from '@/db';
import { posts, bonds, postMoodTags, blockedUsers, tribeMembers, tribes, users } from '@/db/schema';
import { eq, desc, and, or, inArray } from 'drizzle-orm';
import { getBlockedAuthorIds, getUserTribeIds } from './query-helpers';
import type { CommunicationItem, Ring } from '@/lib/types';
import { rowToTribePost } from '@/lib/mappers/post-mapper';
import { moodsData } from '@/lib/moods-data';
import { computePasskeyStatus } from '@/lib/crypto/passkey-lifecycle';

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
  const [blockedIds, userBonds, userTribeIds] = await Promise.all([
    getBlockedAuthorIds(userId),
    getUserBonds(userId),
    getUserTribeIds(userId),
  ]);

  const items: CommunicationItem[] = [];

  // ── Bond Messages (only in 'all' or bond-related ring filters) ────────────
  const showBonds = ringFilter === 'all' || ringFilter === 'inner_circle' || ringFilter === 'my_people';
  if (showBonds) {
    const bondItems = await buildBondMessageItems(userBonds, userId, ringFilter, blockedIds);
    items.push(...bondItems);
  }

  // ── Ring-based Posts ──────────────────────────────────────────────────────
  const ringPosts = await fetchRingPosts(userId, ringFilter, userBonds, userTribeIds, blockedIds, moodSlugs);
  items.push(...ringPosts);

  // ── Mood Stream Posts (promoted posts) ────────────────────────────────────
  if (ringFilter === 'all' || ringFilter === 'streams') {
    const streamPosts = await fetchMoodStreamPosts(userId, blockedIds, moodSlugs);
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
 * Builds bond chat preview items from the user's bonds.
 */
async function buildBondMessageItems(
  userBonds: BondInfo[],
  userId: string,
  ringFilter: string,
  blockedIds: string[],
): Promise<CommunicationItem[]> {
  const { getLatestMessagePreview } = await import('@/lib/actions/content-actions');
  const items: CommunicationItem[] = [];

  const relevantBonds = userBonds
    .filter(b => b.targetType === 'user' && !blockedIds.includes(b.targetId ?? ''))
    .filter(b => isActiveBond(b)) // Enforce bond status boundary
    .filter(b => {
      if (ringFilter === 'inner_circle') return b.innerCircle;
      return b.bondType === 'person' || b.targetType === 'user';
    });

  for (const b of relevantBonds) {
    const latestMsg = await getLatestMessagePreview(b.id);
    const initials = b.targetName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    items.push({
      id: `bond-msg-${b.id}`,
      type: b.innerCircle ? 'inner-circle-bond' : 'person-bond',
      sender: b.targetName,
      bondName: b.targetName,
      bondId: b.id,
      bondTargetId: b.targetId ?? undefined,
      message: latestMsg?.preview || 'Start a conversation!',
      vibes: 0,
      timestamp: latestMsg?.sentAt ?? b.lastRefreshedAt ?? new Date(),
      avatarFallback: initials,
    });
  }

  return items;
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
): Promise<CommunicationItem[]> {
  const items: CommunicationItem[] = [];

  // Journal posts (own posts only)
  if (ringFilter === 'all' || ringFilter === 'journal') {
    const journalRows = await db.select().from(posts)
      .where(and(eq(posts.authorId, userId), eq(posts.ring, 'journal')))
      .orderBy(desc(posts.createdAt))
      .limit(20);

    for (const row of journalRows) {
      if (moodSlugs.length > 0 && row.moodTag && !moodSlugs.includes(row.moodTag)) continue;
      items.push(postRowToFeedItem(row, 'journal'));
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
        if (moodSlugs.length > 0 && row.moodTag && !moodSlugs.includes(row.moodTag)) continue;
        items.push(postRowToFeedItem(row, 'inner_circle'));
      }
    }

    // Also include user's own inner_circle posts
    const ownIcRows = await db.select().from(posts)
      .where(and(eq(posts.authorId, userId), eq(posts.ring, 'inner_circle')))
      .orderBy(desc(posts.createdAt))
      .limit(10);
    for (const row of ownIcRows) {
      if (moodSlugs.length > 0 && row.moodTag && !moodSlugs.includes(row.moodTag)) continue;
      items.push(postRowToFeedItem(row, 'inner_circle'));
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
        if (moodSlugs.length > 0 && row.moodTag && !moodSlugs.includes(row.moodTag)) continue;
        items.push(postRowToFeedItem(row, 'my_people'));
      }
    }

    // Own my_people posts
    const ownMpRows = await db.select().from(posts)
      .where(and(eq(posts.authorId, userId), eq(posts.ring, 'my_people')))
      .orderBy(desc(posts.createdAt))
      .limit(10);
    for (const row of ownMpRows) {
      if (moodSlugs.length > 0 && row.moodTag && !moodSlugs.includes(row.moodTag)) continue;
      items.push(postRowToFeedItem(row, 'my_people'));
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
        if (moodSlugs.length > 0 && row.moodTag && !moodSlugs.includes(row.moodTag)) continue;
        items.push(postRowToFeedItem(row, 'tribes'));
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
): Promise<CommunicationItem[]> {
  const tagRows = await db.select().from(postMoodTags);
  const postIds = [...new Set(tagRows.map(t => t.postId))];
  if (postIds.length === 0) return [];

  // 2. Batch-fetch all posts
  const allPosts = await db.select().from(posts)
    .where(inArray(posts.id, postIds));

  // 3. Batch-fetch all tribes referenced
  const tribeIds = [...new Set(allPosts.map(p => p.tribeId).filter(Boolean) as string[])];
  const allTribes = tribeIds.length > 0
    ? await db.select({ id: tribes.id, name: tribes.name }).from(tribes).where(inArray(tribes.id, tribeIds))
    : [];
  const tribeMap = new Map(allTribes.map(t => [t.id, t.name]));

  // 4. Batch-fetch all promoters
  const promoterIds = [...new Set(tagRows.map(t => t.promotedBy).filter(Boolean) as string[])];
  const allPromoters = promoterIds.length > 0
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, promoterIds))
    : [];
  const promoterMap = new Map(allPromoters.map(u => [u.id, u.name]));

  const items: CommunicationItem[] = [];

  for (const postRow of allPosts) {
    if (postRow.isRemoved) continue;
    if (blockedIds.includes(postRow.authorId)) continue;

    const tags = tagRows.filter(t => t.postId === postRow.id);
    const moodSlug = tags[0]?.moodSlug;
    if (moodSlugs.length > 0 && moodSlug && !moodSlugs.includes(moodSlug)) continue;

    const moodDetails = moodsData.find(m => m.slug === moodSlug);
    const tribeName = postRow.tribeId ? tribeMap.get(postRow.tribeId) : undefined;
    const promotedByName = tags[0]?.promotedBy ? promoterMap.get(tags[0].promotedBy) : undefined;

    items.push({
      id: postRow.id,
      type: 'mood-stream',
      authorId: postRow.authorId,
      tribeName,
      tribeId: postRow.tribeId ?? undefined,
      content: postRow.content,
      title: postRow.title ?? undefined,
      moodSlug,
      moodName: moodDetails?.name || moodSlug,
      avatarSrc: postRow.authorAvatar ?? undefined,
      avatarFallback: postRow.authorAvatarFallback ?? postRow.authorName?.substring(0, 2) ?? 'U',
      timestamp: postRow.createdAt ?? new Date(),
      editedAt: postRow.editedAt ?? undefined,
      vibes: postRow.vibeCount ?? 0,
      dataAiHint: postRow.dataAiHintAvatar ?? undefined,
      imageUrl: postRow.imageUrl ?? undefined,
      imageUrls: postRow.imageUrls ?? undefined,
      imageAlt: postRow.imageAlt ?? undefined,
      dataAiHintImage: postRow.dataAiHintImage ?? undefined,
      sender: postRow.authorName,
      promotedByName,
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
): CommunicationItem {
  return {
    id: row.id,
    type: 'ring-post',
    ring,
    authorId: row.authorId,
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
    pinnedToWall: isPinnedWallUpdate || (row.pinnedToWall ?? false),
    // E2E encryption data (Phase 3)
    isEncrypted: row.isEncrypted ?? false,
    ciphertextBase64: row.ciphertext ? Buffer.from(row.ciphertext as Buffer).toString('base64') : undefined,
    encryptionIv: row.encryptionIv ?? undefined,
    editedAt: row.editedAt ?? undefined,
  };
}
