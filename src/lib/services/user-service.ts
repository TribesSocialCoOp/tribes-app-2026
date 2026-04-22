/**
 * @fileoverview Service layer for user profile actions.
 * Now backed by Drizzle ORM + SQLite.
 */
import { db } from '@/db';
import { users, userAliases } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { UserProfile } from '@/lib/types';

function rowToProfile(row: typeof users.$inferSelect, aliases: string[]): UserProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? '',
    role: row.role as UserProfile['role'],
    bio: row.bio ?? '',
    avatar: row.avatar ?? '',
    reservedAlias: row.reservedAlias ?? undefined,
    aliases,
    reputationScore: row.reputationScore ?? 0,
    reputationStatus: (row.reputationStatus ?? 'Onboarding') as UserProfile['reputationStatus'],
    emailVerified: row.emailVerified ?? false,
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
  const aliases = aliasRows.map(a => a.alias);

  return rowToProfile(row, aliases);
}

/**
 * Updates a user's profile.
 */
export async function updateUserProfile(userId: string, updates: Partial<Omit<UserProfile, 'id' | 'role' | 'email'>>): Promise<UserProfile | null> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const existing = rows[0];
  if (!existing) return null;

  await db.update(users).set({
    name: updates.name ?? existing.name,
    bio: updates.bio ?? existing.bio,
    avatar: updates.avatar ?? existing.avatar,
    reservedAlias: updates.reservedAlias ?? existing.reservedAlias,
    reputationScore: updates.reputationScore ?? existing.reputationScore,
    reputationStatus: updates.reputationStatus ?? existing.reputationStatus,
  }).where(eq(users.id, userId));

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
