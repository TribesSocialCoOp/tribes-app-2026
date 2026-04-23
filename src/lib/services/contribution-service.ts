/**
* @fileoverview Contribution tracking service.
* Phase 3: Earn-path membership — track community contributions
* and auto-upgrade users who reach the membership threshold.
*
* Point values:
*   post:          5 pts   (creating content)
*   moderation:   10 pts   (reporting harmful content)
*   referral:     25 pts   (inviting a friend who signs up)
*   event_hosted: 15 pts   (hosting a community event)
*   bug_report:   10 pts   (reporting a bug)
*
* Earn threshold: 100 points → auto-upgrade to Individual Co-Op
*
* IMPORTANT: All queries use the shared `db` from @/db to respect
* the local-first sync architecture (local SQLite → sqld → public).
*/

import { db } from '@/db';
import { contributions, subscriptions, plans, users } from '@/db/schema';
import { eq, and, sql, gte, sum } from 'drizzle-orm';

const EARN_THRESHOLD = 100;
const EARNED_PLAN_ID = 'individual_coop';

// Point values by contribution type
const POINT_VALUES: Record<string, number> = {
  post: 5,
  moderation: 10,
  referral: 25,
  event_hosted: 15,
  event_rsvp: 5,
  bug_report: 10,
  tribe_created: 10,
};

// Daily contribution caps by role (anti-farming)
const DAILY_CAPS: Record<string, number> = {
  'Human_Free': 50,
  'Human_Paid': 150,
  'Human_Pro': 300,
  'Admin': 999999, // effectively unlimited
};

/**
 * Records a contribution and checks if the user has earned membership.
 * Enforces daily contribution cap by user role.
 */
export async function recordContribution(
  userId: string,
  type: string,
  referenceId?: string,
  description?: string,
): Promise<{ points: number; totalPoints: number; earned: boolean }> {
  const pts = POINT_VALUES[type];
  if (!pts) throw new Error(`Unknown contribution type: ${type}`);

  // Get user role for cap lookup
  const [user] = await db.select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const userRole = user?.role ?? 'Human_Free';
  const dailyCap = DAILY_CAPS[userRole] ?? DAILY_CAPS['Human_Free'];

  // Check today's total
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todayResult] = await db.select({
    todayTotal: sql<number>`COALESCE(SUM(${contributions.points}), 0)`,
  }).from(contributions)
    .where(and(
      eq(contributions.userId, userId),
      gte(contributions.createdAt, todayStart),
    ));
  const todayTotal = Number(todayResult?.todayTotal ?? 0);

  if (todayTotal + pts > dailyCap) {
    throw new Error(`Daily contribution cap reached (${dailyCap} pts for ${userRole}). Try again tomorrow.`);
  }

  const contribId = `contrib-${userId}-${Date.now()}`;

  // Deduplication: skip if same (userId, type, referenceId) already exists
  if (referenceId) {
    const [existing] = await db.select({ id: contributions.id })
      .from(contributions)
      .where(and(
        eq(contributions.userId, userId),
        eq(contributions.type, type),
        eq(contributions.referenceId, referenceId),
      ))
      .limit(1);

    if (existing) {
      // Already tracked — return current totals without inserting
      const [totals] = await db.select({
        total: sql<number>`COALESCE(SUM(${contributions.points}), 0)`,
      }).from(contributions)
        .where(eq(contributions.userId, userId));
      return { points: 0, totalPoints: Number(totals?.total ?? 0), earned: false };
    }
  }

  // Insert the contribution
  await db.insert(contributions).values({
    id: contribId,
    userId,
    type,
    referenceId: referenceId ?? null,
    points: pts,
    description: description ?? null,
  });

  // Calculate total points
  const [totals] = await db.select({
    total: sql<number>`COALESCE(SUM(${contributions.points}), 0)`,
  }).from(contributions)
    .where(eq(contributions.userId, userId));
  const totalPoints = Number(totals?.total ?? 0);

  // Check if user earned membership
  let earned = false;
  if (totalPoints >= EARN_THRESHOLD) {
    // Check if user already has an active subscription
    const [existingSub] = await db.select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, 'active'),
      ))
      .limit(1);

    if (!existingSub) {
      // Get the plan's target role
      const [plan] = await db.select({ targetRole: plans.targetRole })
        .from(plans)
        .where(eq(plans.id, EARNED_PLAN_ID))
        .limit(1);
      const targetRole = plan?.targetRole ?? 'Human_Paid';

      // Auto-upgrade — create earned subscription + update user role
      await db.insert(subscriptions).values({
        id: `sub-earned-${userId}-${Date.now()}`,
        userId,
        planId: EARNED_PLAN_ID,
        status: 'active',
        source: 'earned',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await db.update(users)
        .set({ role: targetRole })
        .where(eq(users.id, userId));

      earned = true;
      console.log(`[contributions] User ${userId} earned membership! (${totalPoints} points)`);
    }
  }

  // Update reputation score + auto-transition status
  const { updateReputation } = await import('@/lib/services/reputation-service');
  await updateReputation(userId, pts);

  return { points: pts, totalPoints, earned };
}

/**
 * Gets the contribution summary for a user.
 */
export async function getContributionSummary(userId: string): Promise<{
  totalPoints: number;
  threshold: number;
  progress: number; // 0-100 percent
  contributions: Array<{
    type: string;
    points: number;
    description: string | null;
    createdAt: number | null;
  }>;
}> {
  const allContribs = await db.select({
    type: contributions.type,
    points: contributions.points,
    description: contributions.description,
    createdAt: contributions.createdAt,
  }).from(contributions)
    .where(eq(contributions.userId, userId))
    .orderBy(contributions.createdAt);

  const totalPoints = allContribs.reduce((sum, c) => sum + c.points, 0);

  return {
    totalPoints,
    threshold: EARN_THRESHOLD,
    progress: Math.min(100, Math.floor((totalPoints / EARN_THRESHOLD) * 100)),
    contributions: allContribs.map(c => ({
      ...c,
      createdAt: c.createdAt ? Math.floor(c.createdAt.getTime() / 1000) : null,
    })),
  };
}
