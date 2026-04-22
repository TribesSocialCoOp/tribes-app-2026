/**
 * @fileoverview Service layer for tribe actions.
 * Now backed by Drizzle ORM + SQLite.
 */
import * as z from "zod";
import { db } from '@/db';
import { tribes, tribeMoodTags, tribeMembers, pendingMembers } from '@/db/schema';
import { eq, and, desc, count, sql, gte } from 'drizzle-orm';
import type { Tribe, PendingMember as PendingMemberType, TribeMember } from '@/lib/types';
import { tribeCoverSvg } from '@/lib/placeholder-svg';
import { REPUTATION_HIERARCHY } from '@/lib/constants';

// --- Create Tribe ---
const createTribeFormSchema = z.object({
  name: z.string().min(3).max(50),
  homepageUrl: z.string().url().optional().or(z.literal('')),
  moods: z.array(z.string()).min(1).max(3),
  description: z.string().min(10).max(500),
  isPublic: z.boolean(),
  coverImage: z.any().optional(),
});
type CreateTribePayload = z.infer<typeof createTribeFormSchema> & { 
  coverPreview?: string | null;
  createdBy?: string;
};

export async function createTribe(payload: CreateTribePayload): Promise<Tribe> {
  const id = `tribe-${Date.now()}`;

  await db.insert(tribes).values({
    id,
    name: payload.name,
    description: payload.description,
    memberCount: 1,
    isPublic: payload.isPublic,
    cover: payload.coverPreview || tribeCoverSvg(payload.name),
    dataAiHint: 'community group',
    homepageUrl: payload.homepageUrl || null,
    joinMechanism: 'instant',
    createdBy: payload.createdBy || null,
    createdAt: new Date(),
  });

  // Insert mood tags
  for (const mood of payload.moods) {
    await db.insert(tribeMoodTags).values({ tribeId: id, moodSlug: mood });
  }

  // Auto-add creator as speaker member
  const creatorId = payload.createdBy;
  if (creatorId) {
    await db.insert(tribeMembers).values({
      id: `tm-${creatorId}-${id}`,
      tribeId: id,
      userId: creatorId,
      role: 'founder',
      joinedAt: new Date(),
    });
  }

  return {
    id,
    name: payload.name,
    description: payload.description,
    members: 1,
    isPublic: payload.isPublic,
    cover: payload.coverPreview || '',
    dataAiHint: 'community group',
    moods: payload.moods,
    homepageUrl: payload.homepageUrl || undefined,
    joinMechanism: 'instant',
  };
}

// --- Update Tribe Settings ---
const tribeSettingsFormSchema = z.object({
  name: z.string().min(3).max(50),
  description: z.string().min(10).max(500),
  homepageUrl: z.string().url().optional().or(z.literal('')),
  isPublic: z.boolean(),
  moods: z.array(z.string()).max(3).optional().default([]),
  joinMechanism: z.enum(['instant', 'approval']),
  minimumReputation: z.enum(['Newcomer', 'Active', 'Trusted', 'Veteran', 'Elder']).optional(),
  minimumAccountAgeDays: z.number().int().positive().optional(),
});
type UpdateTribeSettingsPayload = z.infer<typeof tribeSettingsFormSchema>;

export async function updateTribeSettings(tribeId: string, payload: UpdateTribeSettingsPayload): Promise<Tribe | null> {
  const existingRows = await db.select().from(tribes).where(eq(tribes.id, tribeId)).limit(1);
  const existing = existingRows[0];
  if (!existing) return null;

  await db.update(tribes).set({
    name: payload.name,
    description: payload.description,
    homepageUrl: payload.homepageUrl || null,
    isPublic: payload.isPublic,
    joinMechanism: payload.joinMechanism,
    minimumReputation: payload.minimumReputation ?? null,
    minimumAccountAgeDays: payload.minimumAccountAgeDays ?? null,
  }).where(eq(tribes.id, tribeId));

  // Update mood tags: delete old, insert new
  await db.delete(tribeMoodTags).where(eq(tribeMoodTags.tribeId, tribeId));
  for (const mood of payload.moods ?? []) {
    await db.insert(tribeMoodTags).values({ tribeId, moodSlug: mood });
  }

  // Re-fetch to return updated data
  const { getTribeById } = await import('@/lib/data-access/tribes');
  return getTribeById(tribeId);
}

// --- Member Management ---

export async function getTribeMembers(tribeId: string): Promise<TribeMember[]> {
  const { users } = await import('@/db/schema');
  const rows = await db.select().from(tribeMembers).where(eq(tribeMembers.tribeId, tribeId));
  
  return Promise.all(rows.map(async (r) => {
    const userRows = await db.select().from(users).where(eq(users.id, r.userId)).limit(1);
    const user = userRows[0];
    return {
      id: r.userId,
      name: user?.name ?? r.userId,
      avatar: user?.avatar ?? '',
      dataAiHint: 'person',
      role: (r.role ?? 'member') as TribeMember['role'],
      tribeId: r.tribeId,
      tribeAssignedNickname: r.tribeAssignedNickname ?? undefined,
      reputationStatus: r.reputationStatus as TribeMember['reputationStatus'],
    };
  }));
}

export async function getPendingMembers(tribeId: string): Promise<PendingMemberType[]> {
  const { users } = await import('@/db/schema');
  const rows = await db.select().from(pendingMembers).where(eq(pendingMembers.tribeId, tribeId));
  
  return Promise.all(rows.map(async (r) => {
    const userRows = await db.select().from(users).where(eq(users.id, r.userId)).limit(1);
    const user = userRows[0];
    return {
      id: r.id,
      name: user?.name ?? r.userId,
      avatar: user?.avatar ?? '',
      dataAiHint: 'person',
      tribeId: r.tribeId,
      requestTimestamp: r.requestedAt ?? new Date(),
    };
  }));
}

export async function updateMemberNickname(tribeId: string, memberId: string, nickname: string | undefined): Promise<void> {
  await db.update(tribeMembers).set({
    tribeAssignedNickname: nickname ?? null,
  }).where(and(eq(tribeMembers.userId, memberId), eq(tribeMembers.tribeId, tribeId)));
}

export async function updateMemberRole(tribeId: string, memberId: string, role: 'member' | 'speaker'): Promise<void> {
  await db.update(tribeMembers).set({ role }).where(and(eq(tribeMembers.userId, memberId), eq(tribeMembers.tribeId, tribeId)));
}

export async function approveJoinRequest(tribeId: string, pendingMemberId: string): Promise<void> {
  const pendingRows = await db.select().from(pendingMembers)
    .where(and(eq(pendingMembers.id, pendingMemberId), eq(pendingMembers.tribeId, tribeId)))
    .limit(1);
  const pending = pendingRows[0];

  if (!pending) return;

  // Remove from pending
  await db.delete(pendingMembers).where(eq(pendingMembers.id, pendingMemberId));

  // Add as member
  await db.insert(tribeMembers).values({
    id: `tm-${pending.userId}-${tribeId}`,
    tribeId,
    userId: pending.userId,
    role: 'member',
    joinedAt: new Date(),
  });

  // Increment member count
  const tribeRows = await db.select().from(tribes).where(eq(tribes.id, tribeId)).limit(1);
  const tribe = tribeRows[0];
  if (tribe) {
    await db.update(tribes).set({ memberCount: (tribe.memberCount ?? 0) + 1 }).where(eq(tribes.id, tribeId));
  }

  // Auto-create follower bond for the new member → tribe
  const { createFollowerBond } = await import('@/lib/services/bond-service');
  await createFollowerBond(pending.userId, tribeId, 'tribe', tribe?.name ?? 'Unknown Tribe');
}

export async function denyJoinRequest(tribeId: string, pendingMemberId: string): Promise<void> {
  await db.delete(pendingMembers).where(and(eq(pendingMembers.id, pendingMemberId), eq(pendingMembers.tribeId, tribeId)));
}

/**
 * Removes a user from a tribe, revokes their tribe bond, decrements member count.
 */
export async function leaveTribe(userId: string, tribeId: string): Promise<void> {
  // Remove membership
  await db.delete(tribeMembers).where(
    and(eq(tribeMembers.userId, userId), eq(tribeMembers.tribeId, tribeId)),
  );

  // Decrement member count
  const tribeRows = await db.select().from(tribes).where(eq(tribes.id, tribeId)).limit(1);
  const tribe = tribeRows[0];
  if (tribe && (tribe.memberCount ?? 0) > 0) {
    await db.update(tribes).set({ memberCount: (tribe.memberCount ?? 1) - 1 }).where(eq(tribes.id, tribeId));
  }

  // Revoke the tribe bond
  const { bonds: bondsTable } = await import('@/db/schema');
  const tribeBonds = await db.select().from(bondsTable)
    .where(and(eq(bondsTable.userId, userId), eq(bondsTable.targetId, tribeId)));
  for (const bond of tribeBonds) {
    await db.delete(bondsTable).where(eq(bondsTable.id, bond.id));
  }
}

// ============================================================
// REPUTATION GATE HIERARCHY
// ============================================================
// REPUTATION_HIERARCHY is now imported from @/lib/constants
// (see imports at top of file)

/**
 * Request to join a tribe — enforces reputation gates, account age gates,
 * and join mechanism rules.
 * 
 * Bot friction: new/bot accounts with low reputation cannot join gated tribes.
 */
export async function requestToJoinTribe(userId: string, tribeId: string): Promise<'joined' | 'pending' | 'rejected'> {
  const { users } = await import('@/db/schema');

  // 1. Load tribe and user
  const tribeRows = await db.select().from(tribes).where(eq(tribes.id, tribeId)).limit(1);
  const tribe = tribeRows[0];
  if (!tribe) throw new Error('Tribe not found');

  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) throw new Error('User not found');

  // 2. Check if already a member
  const existingMember = await db.select().from(tribeMembers)
    .where(and(eq(tribeMembers.userId, userId), eq(tribeMembers.tribeId, tribeId)))
    .limit(1);
  if (existingMember.length > 0) throw new Error('Already a member');

  // 3. Check if already pending
  const existingPending = await db.select().from(pendingMembers)
    .where(and(eq(pendingMembers.userId, userId), eq(pendingMembers.tribeId, tribeId)))
    .limit(1);
  if (existingPending.length > 0) throw new Error('Request already pending');

  // 4. GATE: Reputation check
  if (tribe.minimumReputation) {
    const userLevel = REPUTATION_HIERARCHY[user.reputationStatus ?? 'Onboarding'] ?? 0;
    const requiredLevel = REPUTATION_HIERARCHY[tribe.minimumReputation] ?? 0;
    if (userLevel < requiredLevel) {
      throw new Error(`This tribe requires ${tribe.minimumReputation} reputation status. Your current status is ${user.reputationStatus ?? 'Onboarding'}.`);
    }
  }

  // 5. GATE: Account age check
  if (tribe.minimumAccountAgeDays && tribe.minimumAccountAgeDays > 0) {
    const accountCreated = user.createdAt;
    if (accountCreated) {
      const accountAgeDays = Math.floor((Date.now() - accountCreated.getTime()) / (1000 * 60 * 60 * 24));
      if (accountAgeDays < tribe.minimumAccountAgeDays) {
        throw new Error(`This tribe requires accounts to be at least ${tribe.minimumAccountAgeDays} days old. Your account is ${accountAgeDays} days old.`);
      }
    }
  }

  // 6. GATE: Join mechanism
  if (tribe.joinMechanism === 'approval') {
    // Add to pending queue
    await db.insert(pendingMembers).values({
      id: `pm-${userId}-${tribeId}`,
      tribeId,
      userId,
      requestedAt: new Date(),
    });
    return 'pending';
  }

  // 7. Instant join
  await db.insert(tribeMembers).values({
    id: `tm-${userId}-${tribeId}`,
    tribeId,
    userId,
    role: 'member',
    joinedAt: new Date(),
  });

  // Increment member count
  if (tribe) {
    await db.update(tribes).set({ memberCount: (tribe.memberCount ?? 0) + 1 }).where(eq(tribes.id, tribeId));
  }

  // Auto-create follower bond
  const { createFollowerBond } = await import('@/lib/services/bond-service');
  await createFollowerBond(userId, tribeId, 'tribe', tribe.name);

  return 'joined';
}

// ============================================================
// TRIBE ANALYTICS
// ============================================================

export interface TribeAnalytics {
  memberGrowth: Array<{ date: string; members: number }>;
  topPosts: Array<{ name: string; vibes: number; comments: number }>;
  stats: {
    totalMembers: number;
    totalPosts: number;
    engagementRate: string; // e.g. "12.5%"
    engagementDelta: string; // e.g. "+2.1%"
    avgVibesPerPost: string; // e.g. "8.2"
    vibesDelta: string; // e.g. "+1.3"
  };
}

/**
 * Computes real analytics for a tribe from the database.
 * No zero-filling — only months with actual data are shown.
 */
export async function getTribeAnalytics(tribeId: string): Promise<TribeAnalytics> {
  const { posts } = await import('@/db/schema');

  // 1. Member Growth: count members joined per month (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const memberRows = await db.select({
    joinedAt: tribeMembers.joinedAt,
  }).from(tribeMembers)
    .where(and(
      eq(tribeMembers.tribeId, tribeId),
      gte(tribeMembers.joinedAt, sixMonthsAgo),
    ));

  // Group by month label
  const monthCounts: Record<string, number> = {};
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (const row of memberRows) {
    if (!row.joinedAt) continue;
    const d = new Date(row.joinedAt);
    const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
    monthCounts[key] = (monthCounts[key] ?? 0) + 1;
  }

  // Build cumulative growth from the base count
  const tribeRow = await db.select().from(tribes).where(eq(tribes.id, tribeId)).limit(1);
  const totalMembers = tribeRow[0]?.memberCount ?? 0;

  // Convert to sorted array (chronological)
  const monthEntries = Object.entries(monthCounts).sort((a, b) => {
    const parseKey = (k: string) => {
      const [mon, yr] = k.split(' ');
      return new Date(`${mon} 1 ${yr}`).getTime();
    };
    return parseKey(a[0]) - parseKey(b[0]);
  });

  // Build cumulative: work backwards from totalMembers
  let cumulative = totalMembers;
  const memberGrowth: Array<{ date: string; members: number }> = [];
  for (let i = monthEntries.length - 1; i >= 0; i--) {
    memberGrowth.unshift({ date: monthEntries[i]![0], members: cumulative });
    cumulative -= monthEntries[i]![1];
  }

  // 2. Top 5 Posts by engagement (vibes + comments)
  const topPostRows = await db.select({
    title: posts.title,
    vibeCount: posts.vibeCount,
    commentCount: posts.commentCount,
  }).from(posts)
    .where(eq(posts.tribeId, tribeId))
    .orderBy(desc(sql`${posts.vibeCount} + ${posts.commentCount}`))
    .limit(5);

  const topPosts = topPostRows.map((p, i) => ({
    name: p.title ? (p.title.length > 25 ? p.title.substring(0, 25) + '…' : p.title) : `Post ${i + 1}`,
    vibes: p.vibeCount ?? 0,
    comments: p.commentCount ?? 0,
  }));

  // 3. Key Stats with 30-day deltas
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  // Total posts in this tribe
  const [postCountResult] = await db.select({ count: count() }).from(posts)
    .where(eq(posts.tribeId, tribeId));
  const totalPosts = postCountResult?.count ?? 0;

  // Posts in last 30 days
  const [recent30] = await db.select({
    count: count(),
    vibes: sql<number>`COALESCE(SUM(${posts.vibeCount}), 0)`,
    comments: sql<number>`COALESCE(SUM(${posts.commentCount}), 0)`,
  }).from(posts)
    .where(and(eq(posts.tribeId, tribeId), gte(posts.createdAt, thirtyDaysAgo)));

  // Posts in prior 30 days (30-60 days ago)
  const [prior30] = await db.select({
    count: count(),
    vibes: sql<number>`COALESCE(SUM(${posts.vibeCount}), 0)`,
    comments: sql<number>`COALESCE(SUM(${posts.commentCount}), 0)`,
  }).from(posts)
    .where(and(
      eq(posts.tribeId, tribeId),
      gte(posts.createdAt, sixtyDaysAgo),
      sql`${posts.createdAt} < ${thirtyDaysAgo}`,
    ));

  const recentPosts = recent30?.count ?? 0;
  const recentVibes = Number(recent30?.vibes ?? 0);
  const recentComments = Number(recent30?.comments ?? 0);
  const priorPosts = prior30?.count ?? 0;
  const priorVibes = Number(prior30?.vibes ?? 0);

  // Engagement rate: (vibes + comments) / posts
  const engagementRate = recentPosts > 0
    ? ((recentVibes + recentComments) / recentPosts * 100).toFixed(1)
    : '0.0';
  const priorEngagement = priorPosts > 0
    ? ((priorVibes + Number(prior30?.comments ?? 0)) / priorPosts * 100)
    : 0;
  const engagementDelta = priorEngagement > 0
    ? `${(parseFloat(engagementRate) - priorEngagement) > 0 ? '+' : ''}${(parseFloat(engagementRate) - priorEngagement).toFixed(1)}%`
    : 'N/A';

  // Avg vibes per post
  const avgVibes = recentPosts > 0 ? (recentVibes / recentPosts).toFixed(1) : '0.0';
  const priorAvgVibes = priorPosts > 0 ? priorVibes / priorPosts : 0;
  const vibesDelta = priorAvgVibes > 0
    ? `${(parseFloat(avgVibes) - priorAvgVibes) > 0 ? '+' : ''}${(parseFloat(avgVibes) - priorAvgVibes).toFixed(1)}`
    : 'N/A';

  return {
    memberGrowth,
    topPosts,
    stats: {
      totalMembers,
      totalPosts,
      engagementRate: `${engagementRate}%`,
      engagementDelta,
      avgVibesPerPost: avgVibes,
      vibesDelta,
    },
  };
}
