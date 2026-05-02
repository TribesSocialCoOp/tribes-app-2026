/**
 * @fileoverview Service layer for user profile actions.
 * Now backed by Drizzle ORM + SQLite.
 */
import { db } from '@/db';
import { users, userAliases } from '@/db/schema';
import { eq, and, ne } from 'drizzle-orm';
import type { UserProfile } from '@/lib/types';

function rowToProfile(row: typeof users.$inferSelect, aliases: UserProfile['aliases']): UserProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? '',
    role: row.role as UserProfile['role'],
    bio: row.bio ?? '',
    avatar: row.avatar ?? '',
    reservedAlias: row.reservedAlias ?? undefined,
    reservedAliasAvatar: row.reservedAliasAvatar ?? undefined,
    aliases,
    reputationScore: row.reputationScore ?? 0,
    reputationStatus: (row.reputationStatus ?? 'Onboarding') as UserProfile['reputationStatus'],
    emailVerified: row.emailVerified ?? false,
    totpEnabled: row.totpEnabled ?? false,
    aiDataSharingEnabled: row.aiDataSharingEnabled ?? true,
    isVerified: row.isVerified ?? false,
    tosAcceptedVersion: row.tosAcceptedVersion ?? null,
    accountCreatedAt: row.createdAt ?? new Date(),
  };
}

/**
 * Fetches a user's profile.
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const row = rows[0];
  if (!row) return null;

  const aliasRows = await db.select().from(userAliases).where(eq(userAliases.userId, userId));
  const aliases = aliasRows.map(a => ({ name: a.alias, avatar: a.avatar ?? undefined }));

  return rowToProfile(row, aliases);
}

/**
 * Updates a user's profile.
 * Handles reservedAlias uniqueness checking and alias table sync.
 */
export async function updateUserProfile(userId: string, updates: Partial<Omit<UserProfile, 'id' | 'role' | 'email'>>): Promise<UserProfile | null> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const existing = rows[0];
  if (!existing) return null;

  // ── Reserved alias subscription check ─────────────────────────
  if (updates.reservedAlias && updates.reservedAlias !== existing.reservedAlias) {
    const { canReserveAlias } = await import('./subscription-guard');
    const aliasCheck = await canReserveAlias(userId);
    if (!aliasCheck.allowed) {
      throw new Error('Upgrade to Individual Co-Op or higher to reserve a global alias.');
    }

    // ── Reserved alias uniqueness check ──────────────────────────
    const [collision] = await db.select({ id: users.id })
      .from(users)
      .where(and(
        eq(users.reservedAlias, updates.reservedAlias),
        ne(users.id, userId),
      ))
      .limit(1);
    if (collision) {
      throw new Error('This alias is already taken by another user.');
    }
  }

  // ── Update core user fields ──────────────────────────────────
  await db.update(users).set({
    name: updates.name ?? existing.name,
    bio: updates.bio ?? existing.bio,
    avatar: updates.avatar ?? existing.avatar,
    reservedAlias: updates.reservedAlias !== undefined ? (updates.reservedAlias || null) : existing.reservedAlias,
    reservedAliasAvatar: updates.reservedAliasAvatar !== undefined ? (updates.reservedAliasAvatar || null) : existing.reservedAliasAvatar,
    reputationScore: updates.reputationScore ?? existing.reputationScore,
    reputationStatus: updates.reputationStatus ?? existing.reputationStatus,
  }).where(eq(users.id, userId));

  // ── Sync aliases table ───────────────────────────────────────
  if (updates.aliases !== undefined) {
    // ── Collision check: reject aliases matching any user's reserved handle ──
    if (updates.aliases.length > 0) {
      for (const alias of updates.aliases) {
        const aliasName = (typeof alias === 'string' ? alias : alias.name).toLowerCase().replace(/^@/, '');
        // Check against all reserved aliases (stored with '@' prefix)
        const [collision] = await db.select({ id: users.id, reservedAlias: users.reservedAlias })
          .from(users)
          .where(eq(users.reservedAlias, `@${aliasName}`))
          .limit(1);
        if (collision && collision.id !== userId) {
          throw new Error(`The alias '${aliasName}' conflicts with a reserved handle. Choose a different name.`);
        }
      }
    }

    // Delete all existing aliases for this user
    await db.delete(userAliases).where(eq(userAliases.userId, userId));
    // Insert new aliases
    if (updates.aliases.length > 0) {
      const { avatarSvg } = await import('@/lib/placeholder-svg');
      await db.insert(userAliases).values(
        updates.aliases.map(alias => ({
          id: `alias-${userId}-${crypto.randomUUID().substring(0, 8)}`,
          userId,
          alias: typeof alias === 'string' ? alias : alias.name,
          avatar: typeof alias === 'string' ? avatarSvg(alias) : (alias.avatar || avatarSvg(alias.name)),
        }))
      );
    }
  }

  return getUserProfile(userId);
}

/**
 * Graduates a user from 'Onboarding' status.
 */
export async function graduateUserFromOnboarding(userId: string): Promise<UserProfile | null> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const existing = rows[0];
  if (!existing || existing.reputationStatus !== 'Onboarding') return null;

  await db.update(users).set({
    reputationStatus: 'Newcomer',
    reputationScore: 250,
  }).where(eq(users.id, userId));

  return getUserProfile(userId);
}
