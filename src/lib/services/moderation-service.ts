/**
 * @fileoverview Service layer for moderation actions.
 * Now backed by Drizzle ORM + SQLite.
 */

import { db } from '@/db';
import { reports, posts, tribeMembers, tribes, userBans, users, sessions } from '@/db/schema';
import { eq, and, or, gt, isNull } from 'drizzle-orm';
import type { ReportedPost, TribePost, Tribe } from '@/lib/types';
import { rowToTribePost } from '@/lib/mappers/post-mapper';
import { getTribeById, getTribes } from '@/lib/data-access/tribes';

interface ReportPostPayload {
  postId: string;
  postTitle?: string;
  reporterName: string;
  reason: string;
}

/**
 * Reports a post.
 */
export async function reportPost(payload: ReportPostPayload, reporterId: string): Promise<ReportedPost> {
  const newReport: ReportedPost = {
    ...payload,
    reportedAt: new Date(),
  };

  // Prevent duplicate reports
  const rows = await db.select().from(reports).where(eq(reports.postId, payload.postId)).limit(1);
  const existing = rows[0];
  if (!existing) {
    await db.insert(reports).values({
      id: `report-${payload.postId}-${Date.now()}`,
      postId: payload.postId,
      reporterId,
      reporterName: payload.reporterName,
      reason: payload.reason,
      status: 'pending',
      reportedAt: new Date(),
    });
  }

  return newReport;
}

interface ReportCommentPayload {
  commentId: string;
  commentAuthor: string;
  reason: string;
}

/**
 * Reports a discussion comment.
 * Persists to the reports table with targetType='comment'.
 */
export async function reportComment(payload: ReportCommentPayload, reporterId: string): Promise<void> {
  // Prevent duplicate reports on the same comment
  const existing = await db.select().from(reports)
    .where(and(eq(reports.commentId, payload.commentId), eq(reports.reporterId, reporterId)))
    .limit(1);
  if (existing.length > 0) return; // Already reported by this user

  // Look up which post the comment belongs to (for context)
  const { comments } = await import('@/db/schema');
  const [comment] = await db.select({ postId: comments.postId }).from(comments)
    .where(eq(comments.id, payload.commentId)).limit(1);

  await db.insert(reports).values({
    id: `report-comment-${payload.commentId}-${Date.now()}`,
    targetType: 'comment',
    postId: comment?.postId ?? null,
    commentId: payload.commentId,
    reporterId,
    reporterName: payload.commentAuthor,
    reason: payload.reason,
    status: 'pending',
    reportedAt: new Date(),
  });
}

/**
 * Dismisses a report.
 */
export async function dismissReport(postId: string): Promise<void> {
  await db.delete(reports).where(eq(reports.postId, postId));
}

/**
 * Escalates a report to platform administrators.
 * Sets report status to 'escalated' so it appears in the global mod queue.
 */
export async function escalateReport(postId: string): Promise<void> {
  await db.update(reports).set({ status: 'escalated' }).where(eq(reports.postId, postId));
}

interface RemovePostPayload {
  postId: string;
  reason: string;
  preventRepost: boolean;
}

/**
 * Removes a post and dismisses associated reports.
 */
export async function removePost(payload: RemovePostPayload): Promise<void> {
  // Dismiss reports
  await db.delete(reports).where(eq(reports.postId, payload.postId));

  // Mark post as removed
  await db.update(posts).set({
    isRemoved: true,
    canBeReposted: !payload.preventRepost,
    removalReason: payload.reason,
  }).where(eq(posts.id, payload.postId));
}

interface BanMemberFromTribePayload {
  tribeId: string;
  memberId: string;
  reason: string;
  duration: string;
}

/**
 * Bans a member from a specific tribe.
 */
export async function banMemberFromTribe(payload: BanMemberFromTribePayload): Promise<void> {
  await db.delete(tribeMembers).where(
    and(eq(tribeMembers.userId, payload.memberId), eq(tribeMembers.tribeId, payload.tribeId))
  );

  // Decrement member count
  const rows = await db.select().from(tribes).where(eq(tribes.id, payload.tribeId)).limit(1);
  const tribe = rows[0];
  if (tribe) {
    await db.update(tribes).set({ memberCount: Math.max(0, (tribe.memberCount ?? 0) - 1) }).where(eq(tribes.id, payload.tribeId));
  }
}




/**
 * Fetches IDs of all actively reported (not-removed) posts.
 */
export async function getActiveReportedPostIds(): Promise<Set<string>> {
  const allReports = await db.select().from(reports);

  const activeIds: string[] = [];
  for (const report of allReports) {
    if (!report.postId) continue; // Skip comment-only reports
    const postRows = await db.select().from(posts).where(eq(posts.id, report.postId)).limit(1);
    const post = postRows[0];
    if (post && !post.isRemoved) {
      activeIds.push(report.postId);
    }
  }
  return new Set(activeIds);
}

/**
 * Fetches all active reports for a specific tribe.
 */
export async function getActiveReportsForTribe(tribeId: string): Promise<{ tribe: Tribe | null, reports: ReportedPost[], posts: TribePost[] }> {
  const tribe = await getTribeById(tribeId);
  if (!tribe) return { tribe: null, reports: [], posts: [] };

  const postsInTribe = await db.select().from(posts).where(eq(posts.tribeId, tribeId));
  const postIdsInTribe = new Set(postsInTribe.map(p => p.id));

  const allReports = await db.select().from(reports);
  const reportsForTribe = allReports.filter(r => r.postId && postIdsInTribe.has(r.postId));

  // Filter out reports for removed posts
  const activeReports = reportsForTribe.filter(r => {
    if (!r.postId) return false;
    const post = postsInTribe.find(p => p.id === r.postId);
    return post && !post.isRemoved;
  }).map(r => ({
    postId: r.postId!,
    reporterName: r.reporterName,
    reason: r.reason ?? undefined,
    reportedAt: r.reportedAt ?? new Date(),
  }));

  return {
    tribe,
    reports: activeReports,
    posts: postsInTribe.map(row => rowToTribePost(row)),
  };
}

/**
 * Fetches all active reports globally across all tribes.
 */
export async function getActiveGlobalReports(): Promise<{ reports: ReportedPost[], posts: TribePost[], tribes: Tribe[] }> {
  const allTribes = await getTribes();
  const allPosts = await db.select().from(posts);
  const allReports = await db.select().from(reports);

  const activeReports = allReports.filter(r => {
    if (!r.postId) return false;
    const post = allPosts.find(p => p.id === r.postId);
    return post && !post.isRemoved;
  }).map(r => ({
    postId: r.postId!,
    reporterName: r.reporterName,
    reason: r.reason ?? undefined,
    reportedAt: r.reportedAt ?? new Date(),
  }));

  return {
    reports: activeReports,
    posts: allPosts.map(row => rowToTribePost(row)),
    tribes: allTribes,
  };
}

// ============================================================
// PLATFORM-LEVEL USER BANS
// ============================================================

type BanDuration = '1_day' | '7_days' | '30_days' | 'permanent';

interface BanUserPayload {
  userId: string;
  reason?: string;
  duration: BanDuration;
  relatedPostId?: string;
  forceLogout?: boolean; // Hard ban: invalidate all sessions
}

function computeExpiry(duration: BanDuration): Date | null {
  if (duration === 'permanent') return null;
  const now = new Date();
  const ms: Record<string, number> = {
    '1_day': 24 * 60 * 60 * 1000,
    '7_days': 7 * 24 * 60 * 60 * 1000,
    '30_days': 30 * 24 * 60 * 60 * 1000,
  };
  return new Date(now.getTime() + (ms[duration] ?? 0));
}

/**
 * Bans a user at the platform level.
 * Optionally invalidates all active sessions (hard ban).
 */
export async function banUser(bannedBy: string, payload: BanUserPayload): Promise<void> {
  // Guard: prevent banning admins
  const [target] = await db.select({ role: users.role }).from(users)
    .where(eq(users.id, payload.userId)).limit(1);
  if (target?.role === 'Admin') {
    throw new Error('Cannot ban an Admin user.');
  }

  const expiresAt = computeExpiry(payload.duration);

  await db.insert(userBans).values({
    id: `ban-${payload.userId.substring(0, 8)}-${Date.now()}`,
    userId: payload.userId,
    bannedBy,
    reason: payload.reason ?? null,
    duration: payload.duration,
    relatedPostId: payload.relatedPostId ?? null,
    expiresAt,
    isActive: true,
    createdAt: new Date(),
  });

  // Hard ban: invalidate all sessions so user is forced to re-authenticate
  if (payload.forceLogout) {
    await db.delete(sessions).where(eq(sessions.userId, payload.userId));
  }
}

/**
 * Checks whether a user has an active, non-expired platform ban.
 * Returns ban details if banned, or null if clear.
 */
export async function isUserBanned(userId: string): Promise<{ reason?: string; expiresAt?: Date } | null> {
  const now = new Date();

  const activeBans = await db.select().from(userBans).where(
    and(
      eq(userBans.userId, userId),
      eq(userBans.isActive, true),
      // Not expired: either permanent (null) or future expiry
      or(isNull(userBans.expiresAt), gt(userBans.expiresAt, now)),
    )
  ).limit(1);

  const ban = activeBans[0];
  if (!ban) return null;

  return {
    reason: ban.reason ?? undefined,
    expiresAt: ban.expiresAt ?? undefined,
  };
}