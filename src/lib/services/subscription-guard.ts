/**
 * @fileoverview Subscription-gated feature checks.
 * Phase 3C: Enforces plan limits for bonds, tribes, and premium features.
 */

import { db } from '@/db';
import { plans, subscriptions, bonds, tribes, users } from '@/db/schema';
import { eq, and, count, asc } from 'drizzle-orm';

// ============================================================
// PLAN RESOLUTION
// ============================================================

/**
 * Resolves the base plan a role maps to — the lowest-tier plan whose `targetRole` matches.
 * Used as a fallback when a user has been granted a paid role WITHOUT a subscription
 * (e.g. an admin role edit). Returns null if no plan targets that role.
 *
 * Because role→plan is not 1:1 (individual_coop and creator both target Human_Paid), this
 * can only recover the BASE tier for a role — precise tiers require a real subscription.
 */
export async function resolvePlanForRole(role: string): Promise<typeof plans.$inferSelect | null> {
  const [plan] = await db.select().from(plans)
    .where(eq(plans.targetRole, role))
    .orderBy(asc(plans.sortOrder), asc(plans.priceMonthly))
    .limit(1);
  return plan ?? null;
}

/**
 * Gets the effective plan for a user.
 * Resolution order: active subscription → role-derived base plan → free.
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

  // Fallback: a paid role set without a subscription still grants its base plan's limits.
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (user) {
    const rolePlan = await resolvePlanForRole(user.role);
    if (rolePlan) return rolePlan;
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
    .where(and(eq(bonds.userId, userId), eq(bonds.targetType, 'user')));
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
 * Checks if a tribe can accept another member (under the owner's plan limit).
 * The member cap is enforced on the tribe *owner's* plan, not the joining user's plan.
 */
export async function canAddTribeMember(tribeId: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number | null;
  planName: string;
}> {
  // Find the tribe owner
  const [tribe] = await db.select({ createdBy: tribes.createdBy, memberCount: tribes.memberCount })
    .from(tribes).where(eq(tribes.id, tribeId)).limit(1);
  if (!tribe || !tribe.createdBy) {
    return { allowed: true, current: 0, limit: null, planName: 'Unknown' };
  }

  const plan = await getUserPlan(tribe.createdBy);
  const currentCount = tribe.memberCount ?? 0;

  if (plan.maxMembers === null || plan.maxMembers === undefined) {
    return { allowed: true, current: currentCount, limit: null, planName: plan.name };
  }

  return {
    allowed: currentCount < plan.maxMembers,
    current: currentCount,
    limit: plan.maxMembers,
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
