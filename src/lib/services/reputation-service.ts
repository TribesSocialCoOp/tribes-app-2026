/**
 * @fileoverview Reputation progression service.
 * 
 * Manages the automatic progression of user reputation status based on
 * their contribution score. Called after each contribution is recorded.
 *
 * Reputation Hierarchy (ascending):
 *   Newcomer   →  0 pts  (default for new signups)
 *   Active     → 10 pts  (first real activity)
 *   Trusted    → 50 pts  (consistent contributor)
 *   Veteran    → 200 pts (long-term community member)
 *   Elder      → 500 pts (pillar of the community)
 *
 * Admin can also manually set reputation via the moderation panel.
 *
 * Uses the shared `db` from @/db (local-first sync architecture).
 */

import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { ReputationStatus } from '@/lib/constants';

// Score thresholds for each reputation level
const REPUTATION_THRESHOLDS: Array<{ status: ReputationStatus; minScore: number }> = [
  { status: 'Elder',    minScore: 500 },
  { status: 'Veteran',  minScore: 200 },
  { status: 'Trusted',  minScore: 50 },
  { status: 'Active',   minScore: 10 },
  { status: 'Newcomer', minScore: 0 },
];

/**
 * Determines the correct reputation status for a given score.
 */
export function statusForScore(score: number): ReputationStatus {
  for (const tier of REPUTATION_THRESHOLDS) {
    if (score >= tier.minScore) {
      return tier.status;
    }
  }
  return 'Newcomer';
}

/**
 * Updates a user's reputation score and auto-transitions their status.
 * Called after a contribution is recorded.
 *
 * @param userId - The user to update
 * @param pointsToAdd - Points to add (can be negative for penalties)
 * @returns The new score and status
 */
export async function updateReputation(
  userId: string,
  pointsToAdd: number,
): Promise<{ newScore: number; newStatus: ReputationStatus; promoted: boolean }> {
  // Get current score
  const [user] = await db.select({
    reputationScore: users.reputationScore,
    reputationStatus: users.reputationStatus,
  }).from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new Error('User not found');

  const currentScore = user.reputationScore ?? 0;
  const currentStatus = (user.reputationStatus ?? 'Newcomer') as ReputationStatus;
  const newScore = Math.max(0, currentScore + pointsToAdd); // Never go below 0
  const newStatus = statusForScore(newScore);
  const promoted = newStatus !== currentStatus;

  // Only write if something changed
  if (newScore !== currentScore || promoted) {
    await db.update(users)
      .set({
        reputationScore: newScore,
        reputationStatus: newStatus,
      })
      .where(eq(users.id, userId));

    if (promoted) {
      console.log(`[reputation] User ${userId}: ${currentStatus} → ${newStatus} (${newScore} pts)`);
    }
  }

  return { newScore, newStatus, promoted };
}

/**
 * Gets the current reputation info for a user.
 */
export async function getReputation(userId: string): Promise<{
  score: number;
  status: ReputationStatus;
  nextTier: { status: ReputationStatus; pointsNeeded: number } | null;
}> {
  const [user] = await db.select({
    reputationScore: users.reputationScore,
    reputationStatus: users.reputationStatus,
  }).from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const score = user?.reputationScore ?? 0;
  const status = (user?.reputationStatus ?? 'Newcomer') as ReputationStatus;

  // Find next tier
  const currentIdx = REPUTATION_THRESHOLDS.findIndex(t => t.status === status);
  const nextTier = currentIdx > 0
    ? {
        status: REPUTATION_THRESHOLDS[currentIdx - 1]!.status,
        pointsNeeded: REPUTATION_THRESHOLDS[currentIdx - 1]!.minScore - score,
      }
    : null; // Already at Elder

  return { score, status, nextTier };
}

/**
 * Admin: manually set a user's reputation status (overrides score-based progression).
 */
export async function setReputationManually(
  userId: string,
  status: ReputationStatus,
): Promise<void> {
  // Find the minimum score for this status to keep score consistent
  const tier = REPUTATION_THRESHOLDS.find(t => t.status === status);
  const minScore = tier?.minScore ?? 0;

  const [user] = await db.select({ reputationScore: users.reputationScore })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Only bump score up if it's below the tier minimum (never reduce score)
  const currentScore = user?.reputationScore ?? 0;
  const newScore = Math.max(currentScore, minScore);

  await db.update(users)
    .set({
      reputationStatus: status,
      reputationScore: newScore,
    })
    .where(eq(users.id, userId));

  console.log(`[reputation] Admin set user ${userId} to ${status} (score: ${newScore})`);
}
