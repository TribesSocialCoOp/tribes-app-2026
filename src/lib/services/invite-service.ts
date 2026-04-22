/**
 * @fileoverview Invite code redemption service.
 * Phase 3: Founding Member & earned membership pathways.
 *
 * Invite codes grant plan access without Stripe payment.
 * Supports: founding member codes, earned-contribution upgrades.
 */

import { db } from '@/db';
import { inviteCodes, inviteRedemptions, subscriptions, plans, users } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';

/**
 * Validates an invite code without redeeming it.
 * Returns the code details or throws an error.
 */
export async function validateInviteCode(code: string): Promise<{
  id: string;
  grantsPlanId: string;
  planName: string;
  remainingUses: number;
}> {
  const normalizedCode = code.trim().toUpperCase();

  const [invite] = await db.select().from(inviteCodes)
    .where(eq(inviteCodes.id, normalizedCode))
    .limit(1);

  if (!invite) {
    throw new Error('Invalid invite code');
  }

  // Check if expired
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    throw new Error('This invite code has expired');
  }

  // Check if used up
  const remaining = (invite.maxUses ?? 1) - (invite.usedCount ?? 0);
  if (remaining <= 0) {
    throw new Error('This invite code has been fully redeemed');
  }

  // Get plan name
  const [plan] = await db.select().from(plans)
    .where(eq(plans.id, invite.grantsPlanId))
    .limit(1);

  return {
    id: invite.id,
    grantsPlanId: invite.grantsPlanId,
    planName: plan?.name ?? invite.grantsPlanId,
    remainingUses: remaining,
  };
}

/**
 * Redeems an invite code for a user.
 * Creates a subscription with source='founding' and upgrades user role.
 */
export async function redeemInviteCode(
  userId: string,
  code: string,
): Promise<{ planName: string; source: string }> {
  const normalizedCode = code.trim().toUpperCase();

  // Validate the code
  const validated = await validateInviteCode(normalizedCode);

  // Check if user already redeemed this code
  const [existing] = await db.select().from(inviteRedemptions)
    .where(and(
      eq(inviteRedemptions.inviteCodeId, normalizedCode),
      eq(inviteRedemptions.userId, userId),
    ))
    .limit(1);

  if (existing) {
    throw new Error('You have already redeemed this invite code');
  }

  // Check if user already has an active subscription at this level or higher
  const [existingSub] = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
    .limit(1);

  if (existingSub) {
    throw new Error('You already have an active subscription');
  }

  // Get the plan to determine the target role
  const [plan] = await db.select().from(plans)
    .where(eq(plans.id, validated.grantsPlanId))
    .limit(1);

  if (!plan) throw new Error('Plan not found');

  // Determine source based on code prefix
  const source = normalizedCode.startsWith('FOUNDING') ? 'founding' : 'earned';
  const subId = `sub-${userId}-${Date.now()}`;
  const redemptionId = `redemption-${userId}-${Date.now()}`;
  const now = Math.floor(Date.now() / 1000);

  // Use batch to execute all writes atomically
  const { createClient } = await import('@libsql/client');
  const client = createClient({ url: `file:${process.cwd()}/tribes.db` });

  await client.batch([
    // Create subscription
    {
      sql: `INSERT INTO subscriptions (id, user_id, plan_id, status, source, cancel_at_period_end, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, 0, ?, ?)`,
      args: [subId, userId, validated.grantsPlanId, source, now, now],
    },
    // Record redemption
    {
      sql: `INSERT INTO invite_redemptions (id, invite_code_id, user_id) VALUES (?, ?, ?)`,
      args: [redemptionId, normalizedCode, userId],
    },
    // Increment used count
    {
      sql: `UPDATE invite_codes SET used_count = used_count + 1 WHERE id = ?`,
      args: [normalizedCode],
    },
    // Upgrade user role
    {
      sql: `UPDATE users SET role = ? WHERE id = ?`,
      args: [plan.targetRole, userId],
    },
  ], 'write');

  // Referral tracking: if the code was created by a user, award them 25 pts
  try {
    const codeResult = await client.execute({
      sql: `SELECT created_by FROM invite_codes WHERE id = ?`,
      args: [normalizedCode],
    });
    const createdBy = codeResult.rows[0]?.created_by as string | null;
    if (createdBy && createdBy !== userId) {
      const { recordContribution } = await import('@/lib/services/contribution-service');
      await recordContribution(createdBy, 'referral', userId, `Referred user via invite code ${normalizedCode}`);
    }
  } catch (e) { console.warn('[invite-service] referral tracking failed:', e); }

  return { planName: plan.name, source };
}

/**
 * Generates an invite code for a paid member to share.
 * When someone redeems it, the creator earns 25 referral points.
 */
export async function generateInviteCode(
  userId: string,
  maxUses: number = 5,
): Promise<{ code: string; maxUses: number }> {
  // Generate a unique code: INVITE-{shortUserId}-{random}
  const shortId = userId.slice(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const random = Array.from(crypto.getRandomValues(new Uint8Array(3)), b => b.toString(36).toUpperCase()).join('').slice(0, 4);
  const code = `INVITE-${shortId}-${random}`;

  db.insert(inviteCodes).values({
    id: code,
    createdBy: userId,
    grantsPlanId: 'individual_coop',
    maxUses,
    usedCount: 0,
  }).run();

  return { code, maxUses };
}
