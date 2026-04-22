/**
 * @fileoverview Subscription-gated feature checks.
 * Phase 3C: Enforces plan limits for bonds, tribes, and premium features.
 */

import { db } from '@/db';
import { plans, subscriptions, bonds, tribes } from '@/db/schema';
import { eq, and, count } from 'drizzle-orm';

// ============================================================
// PLAN RESOLUTION
// ============================================================

/**
 * Gets the effective plan for a user (checks subscription, falls back to free).
 */
export async function getUserPlan(userId: string): Promise<typeof plans.$inferSelect> {
  // Check for active subscription
  const [sub] = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
    .limit(1);

  if (sub) {
    const [plan] = await db.select().from(plans).where(eq(plans.id, sub.planId)).limit(1);
    if (plan) return plan;
  }

  // Default to free plan
  const [freePlan] = await db.select().from(plans).where(eq(plans.id, 'free')).limit(1);
  if (!freePlan) throw new Error('Free plan not found — seed the database');
  return freePlan;
}

// ============================================================
// FEATURE GUARDS
// ============================================================

/**
 * Checks if a user can create another bond (under their plan limit).
 */
export async function canCreateBond(userId: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number | null;
  planName: string;
}> {
  const plan = await getUserPlan(userId);
  const [result] = await db.select({ count: count() }).from(bonds)
    .where(eq(bonds.userId, userId));
  const currentCount = result?.count ?? 0;

  if (plan.maxBonds === null) {
    return { allowed: true, current: currentCount, limit: null, planName: plan.name };
  }

  return {
    allowed: currentCount < plan.maxBonds,
    current: currentCount,
    limit: plan.maxBonds,
    planName: plan.name,
  };
}

/**
 * Checks if a user can create another tribe they own.
 */
export async function canCreateTribe(userId: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number | null;
  planName: string;
}> {
  const plan = await getUserPlan(userId);
  const [result] = await db.select({ count: count() }).from(tribes)
    .where(eq(tribes.createdBy, userId));
  const currentCount = result?.count ?? 0;

  if (plan.maxTribesOwned === null) {
    return { allowed: true, current: currentCount, limit: null, planName: plan.name };
  }

  return {
    allowed: currentCount < plan.maxTribesOwned,
    current: currentCount,
    limit: plan.maxTribesOwned,
    planName: plan.name,
  };
}

/**
 * Checks if a user can reserve a global alias (requires paid plan).
 */
export async function canReserveAlias(userId: string): Promise<{
  allowed: boolean;
  planName: string;
}> {
  const plan = await getUserPlan(userId);
  const features: string[] = plan.features ? JSON.parse(plan.features) : [];
  return {
    allowed: features.includes('reserve_alias'),
    planName: plan.name,
  };
}

/**
 * Checks if a feature flag is enabled for a user's plan.
 */
export async function hasFeature(userId: string, feature: string): Promise<boolean> {
  const plan = await getUserPlan(userId);
  const features: string[] = plan.features ? JSON.parse(plan.features) : [];
  return features.includes(feature);
}

/**
 * Gets the full feature summary for a user (for settings/billing UI).
 */
export async function getFeatureSummary(userId: string): Promise<{
  planName: string;
  planId: string;
  bonds: { current: number; limit: number | null };
  tribes: { current: number; limit: number | null };
  features: string[];
}> {
  const plan = await getUserPlan(userId);
  const bondCheck = await canCreateBond(userId);
  const tribeCheck = await canCreateTribe(userId);
  const features: string[] = plan.features ? JSON.parse(plan.features) : [];

  return {
    planName: plan.name,
    planId: plan.id,
    bonds: { current: bondCheck.current, limit: plan.maxBonds },
    tribes: { current: tribeCheck.current, limit: plan.maxTribesOwned },
    features,
  };
}
