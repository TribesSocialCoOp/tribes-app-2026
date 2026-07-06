
'use server';

import { requireAdmin } from './shared';
import { db } from '@/db';
import { users, userBans, adminAuditLogs, sessions, plans } from '@/db/schema';
import { eq, and, or, ilike, sql, desc, inArray, asc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { UserRole } from '@/lib/types';
import { revalidatePath } from 'next/cache';

/**
 * Helper to mask emails for privacy (PII protection).
 * E.g., "user@example.com" -> "u******@example.com"
 */
function maskEmail(email: string | null): string {
  if (!email) return 'No Email';
  const parts = email.split('@');
  if (parts.length !== 2) return 'Invalid Email';
  const [local, domain] = parts;
  if (local.length <= 1) return `*@${domain}`;
  const maskedLocal = local[0] + '*'.repeat(Math.min(local.length - 1, 8));
  return `${maskedLocal}@${domain}`;
}

/**
 * Internal helper to log admin actions for auditing.
 */
async function logAdminAction(adminId: string, payload: {
  action: 'role_change' | 'ban_issued' | 'ban_revoked' | 'user_deleted';
  targetUserId: string;
  details?: any;
}) {
  await db.insert(adminAuditLogs).values({
    id: `audit-${uuidv4()}`,
    adminId,
    action: payload.action,
    targetUserId: payload.targetUserId,
    details: payload.details ? JSON.stringify(payload.details) : null,
    createdAt: new Date(),
  });
}

/**
 * Fetch a paginated list of users with search and role filtering.
 * Enforces PII masking unless the admin has the `hasPiiAccess` flag.
 */
export async function getGlobalUsers(params: {
  page?: number;
  limit?: number;
  search?: string;
  roleFilter?: UserRole;
}) {
  const adminId = await requireAdmin();
  const { page = 1, limit = 20, search, roleFilter } = params;
  const offset = (page - 1) * limit;

  // Check if this admin has full PII access (dev/system level)
  const [adminUser] = await db.select({ hasPiiAccess: users.hasPiiAccess })
    .from(users).where(eq(users.id, adminId)).limit(1);
  const hasPiiAccess = adminUser?.hasPiiAccess ?? false;

  let whereClause: any = undefined;
  
  if (search) {
    const searchPattern = `%${search}%`;
    whereClause = or(
      ilike(users.name, searchPattern),
      ilike(users.email, searchPattern),
      ilike(users.id, searchPattern)
    );
  }

  if (roleFilter) {
    const roleMatch = eq(users.role, roleFilter);
    whereClause = whereClause ? and(whereClause, roleMatch) : roleMatch;
  }

  const query = db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    avatar: users.avatar,
    reputationStatus: users.reputationStatus,
    createdAt: users.createdAt,
  })
    .from(users)
    .where(whereClause)
    .limit(limit)
    .offset(offset)
    .orderBy(desc(users.createdAt));

  const totalCountQuery = db.select({ count: sql<number>`count(*)` })
    .from(users)
    .where(whereClause);

  const [usersList, [{ count: totalCount }]] = await Promise.all([
    query,
    totalCountQuery
  ]);

  // Enrich with active bans
  const userIds = usersList.map(u => u.id);
  const activeBans = userIds.length > 0 
    ? await db.select().from(userBans).where(and(inArray(userBans.userId, userIds), eq(userBans.isActive, true)))
    : [];

  const banMap = new Map(activeBans.map(b => [b.userId, b]));

  return {
    users: usersList.map(u => ({
      ...u,
      email: hasPiiAccess ? u.email : maskEmail(u.email),
      activeBan: banMap.get(u.id) || null,
    })),
    totalCount: Number(totalCount),
  };
}

/**
 * Update a user's platform-level role.
 * Restrictions: Cannot edit self, cannot demote other Admins.
 */
export async function updateGlobalUserRole(targetUserId: string, newRole: UserRole) {
  const adminId = await requireAdmin();
  if (targetUserId === adminId) throw new Error('You cannot change your own role.');

  const [targetUser] = await db.select({ role: users.role }).from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!targetUser) throw new Error('User not found.');
  
  // Rule: Admins cannot demote other Admins (dev-only via DB for now)
  if (targetUser.role === 'Admin' && newRole !== 'Admin') {
    throw new Error('Only developers can demote other super-admins.');
  }

  await db.update(users).set({ role: newRole }).where(eq(users.id, targetUserId));

  await logAdminAction(adminId, {
    action: 'role_change',
    targetUserId,
    details: { oldRole: targetUser.role, newRole },
  });

  revalidatePath('/admin/users');
}

/**
 * Lists the plans an admin can grant (excludes 'free'), lowest tier first.
 */
export async function getGrantablePlans() {
  await requireAdmin();
  return db.select({
    id: plans.id,
    name: plans.name,
    targetRole: plans.targetRole,
    maxTribesOwned: plans.maxTribesOwned,
  }).from(plans).where(sql`${plans.id} <> 'free'`).orderBy(asc(plans.sortOrder));
}

/**
 * Grants a membership PLAN to a user — creates/updates an active subscription AND sets the
 * derived role, so tribe entitlements and billing stay consistent. This is the correct way
 * to make someone a paid member (setting the role alone leaves them on the free plan for
 * guard purposes). Use updateGlobalUserRole only for non-plan roles (Admin/Bot).
 */
export async function grantMembership(targetUserId: string, planId: string) {
  const adminId = await requireAdmin();

  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!plan) throw new Error('Plan not found.');

  const [targetUser] = await db.select({ role: users.role }).from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!targetUser) throw new Error('User not found.');

  const { grantPlanToUser } = await import('@/lib/services/payment-service');
  await grantPlanToUser(db, targetUserId, planId, 'earned');

  await logAdminAction(adminId, {
    action: 'role_change',
    targetUserId,
    details: { oldRole: targetUser.role, newRole: plan.targetRole, grantedPlan: planId },
  });

  revalidatePath('/admin/users');
}

/**
 * Apply a platform-wide ban to a user.
 * Optional forceLogout invalidates all active sessions.
 */
export async function banUserProactively(payload: {
  userId: string;
  reason?: string;
  duration: '1_day' | '7_days' | '30_days' | 'permanent';
  forceLogout?: boolean;
}) {
  const adminId = await requireAdmin();
  if (payload.userId === adminId) throw new Error('You cannot ban yourself.');

  const [targetUser] = await db.select({ role: users.role }).from(users).where(eq(users.id, payload.userId)).limit(1);
  if (targetUser?.role === 'Admin') throw new Error('You cannot ban another super-admin.');

  let expiresAt: Date | null = null;
  if (payload.duration !== 'permanent') {
    expiresAt = new Date();
    const days = payload.duration === '1_day' ? 1 : payload.duration === '7_days' ? 7 : 30;
    expiresAt.setDate(expiresAt.getDate() + days);
  }

  // Deactivate any existing active bans for this user
  await db.update(userBans).set({ isActive: false }).where(eq(userBans.userId, payload.userId));

  const banId = `ban-${uuidv4()}`;
  await db.insert(userBans).values({
    id: banId,
    userId: payload.userId,
    bannedBy: adminId,
    reason: payload.reason || null,
    duration: payload.duration,
    expiresAt,
    isActive: true,
    createdAt: new Date(),
  });

  if (payload.forceLogout) {
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, payload.userId));
  }

  await logAdminAction(adminId, {
    action: 'ban_issued',
    targetUserId: payload.userId,
    details: { duration: payload.duration, reason: payload.reason, forceLogout: payload.forceLogout },
  });

  revalidatePath('/admin/users');
}

/**
 * Revoke an active platform ban.
 */
export async function revokeGlobalBan(userId: string) {
  const adminId = await requireAdmin();
  await db.update(userBans).set({ isActive: false }).where(eq(userBans.userId, userId));

  await logAdminAction(adminId, {
    action: 'ban_revoked',
    targetUserId: userId,
  });

  revalidatePath('/admin/users');
}
