import { db } from '@/db';
import { blockedUsers, tribeMembers, bonds } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Helper: get blocked user IDs for a given user.
 */
export async function getBlockedAuthorIds(userId?: string): Promise<string[]> {
  if (!userId) return [];
  const rows = await db.select({ blockedId: blockedUsers.blockedUserId })
    .from(blockedUsers)
    .where(eq(blockedUsers.userId, userId));
  return rows.map(r => r.blockedId);
}

/**
 * Helper: get tribe IDs that a user is a member of.
 */
export async function getUserTribeIds(userId?: string): Promise<string[]> {
  if (!userId) return [];
  const rows = await db.select({ tribeId: tribeMembers.tribeId })
    .from(tribeMembers)
    .where(eq(tribeMembers.userId, userId));
  return rows.map(r => r.tribeId);
}

/**
 * Resolves a user's display name and avatar for a given tribe context.
 * logic: bond preference (nickname) > joinedAsAlias > real user name.
 */
export async function resolveDisplayIdentity(
  userId: string,
  tribeId: string | null,
  realName: string,
  realAvatar: string | null = null,
): Promise<{ name: string; avatar: string | null }> {
  let resolvedName = realName;
  let resolvedAvatar = realAvatar;

  if (tribeId) {
    const [member] = await db.select().from(tribeMembers)
      .where(and(eq(tribeMembers.tribeId, tribeId), eq(tribeMembers.userId, userId)))
      .limit(1);
    
    const [bond] = await db.select().from(bonds)
      .where(and(eq(bonds.userId, userId), eq(bonds.targetId, tribeId)))
      .limit(1);

    if (member) {
      if (bond?.displayPreference === 'tribe_assigned_nickname' && member.tribeAssignedNickname) {
        resolvedName = member.tribeAssignedNickname;
      } else if (member.joinedAsAlias) {
        resolvedName = member.joinedAsAlias;
        if (member.joinedAsAvatar) resolvedAvatar = member.joinedAsAvatar;
      }
    }
  }

  return { name: resolvedName, avatar: resolvedAvatar };
}
