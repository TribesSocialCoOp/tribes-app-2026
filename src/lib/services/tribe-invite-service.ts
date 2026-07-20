/**
 * @fileoverview In-app tribe invites (issue #58).
 *
 * Lets an existing tribe member invite a specific existing Tribes user to
 * join, instead of relying solely on external share links. Deliberately
 * reuses the tribe's existing `inviteToken` mechanism for the actual join —
 * this service only decides WHO gets notified and tracks that a personal
 * invite is outstanding (for dedupe + activity feed display). It does not
 * grant any permission the public share link didn't already grant: accepting
 * still runs through requestToJoinTribe()'s normal gates (approval/instant
 * join mechanism, NSFW gate, reputation/age gates, member cap).
 */
import { db } from '@/db';
import { tribeInvites, tribeMembers, tribes, users, blockedUsers } from '@/db/schema';
import { eq, and, ne, like, sql, inArray } from 'drizzle-orm';
import { isTribeMember } from './tribe-auth';

export interface TribeInviteSearchResult {
  id: string;
  name: string;
  avatarUrl?: string;
  status: 'none' | 'member' | 'invited';
}

/**
 * Ensures the tribe has an invite token (legacy rows created before
 * inviteToken existed may be null) and returns it. Does not require any
 * elevated permission — the token is already exposed to every member via
 * the "Share Tribe" action, so lazily creating one is not a new capability.
 */
async function ensureInviteToken(tribeId: string): Promise<string> {
  const [tribe] = await db.select({ inviteToken: tribes.inviteToken }).from(tribes)
    .where(eq(tribes.id, tribeId)).limit(1);
  if (!tribe) throw new Error('Tribe not found');
  if (tribe.inviteToken) return tribe.inviteToken;

  const { generateInviteToken } = await import('@/lib/invite-token');
  const newToken = generateInviteToken();
  await db.update(tribes).set({ inviteToken: newToken }).where(eq(tribes.id, tribeId));
  return newToken;
}

/**
 * Searches existing Tribes users by name for the invite picker, scoped to a
 * specific tribe. Excludes the searcher, blocked users (either direction),
 * and marks members/already-invited users so the UI can disable those rows
 * (mirrors searchUsersForBonding's status pattern).
 */
export async function searchUsersForTribeInvite(
  inviterId: string,
  tribeId: string,
  query: string,
): Promise<TribeInviteSearchResult[]> {
  if (!(await isTribeMember(inviterId, tribeId))) {
    throw new Error('Only tribe members can invite others.');
  }
  if (!query || query.trim().length < 2) return [];

  const escaped = query.trim().replace(/[%_\\]/g, '\\$&');
  const pattern = `%${escaped}%`;

  const blockedIdsSql = sql`(
    SELECT ${blockedUsers.blockedUserId} FROM ${blockedUsers} WHERE ${blockedUsers.userId} = ${inviterId}
    UNION
    SELECT ${blockedUsers.userId} FROM ${blockedUsers} WHERE ${blockedUsers.blockedUserId} = ${inviterId}
  )`;

  const matches = await db.select({
    id: users.id,
    name: users.name,
    avatarUrl: users.avatar,
  })
    .from(users)
    .where(and(
      ne(users.id, inviterId),
      like(users.name, pattern),
      sql`${users.id} NOT IN ${blockedIdsSql}`
    ))
    .limit(10);

  if (matches.length === 0) return [];
  const matchIds = matches.map(m => m.id);

  const [memberRows, pendingInvites] = await Promise.all([
    db.select({ userId: tribeMembers.userId }).from(tribeMembers)
      .where(and(eq(tribeMembers.tribeId, tribeId), inArray(tribeMembers.userId, matchIds))),
    db.select({ toUserId: tribeInvites.toUserId }).from(tribeInvites)
      .where(and(
        eq(tribeInvites.tribeId, tribeId),
        eq(tribeInvites.status, 'pending'),
        inArray(tribeInvites.toUserId, matchIds),
      )),
  ]);

  const memberIds = new Set(memberRows.map(r => r.userId));
  const invitedIds = new Set(pendingInvites.map(r => r.toUserId));

  return matches.map(m => {
    let status: TribeInviteSearchResult['status'] = 'none';
    if (memberIds.has(m.id)) status = 'member';
    else if (invitedIds.has(m.id)) status = 'invited';
    return {
      id: m.id,
      name: m.name ?? 'Unknown',
      avatarUrl: m.avatarUrl ?? undefined,
      status,
    };
  });
}

/**
 * Sends an in-app invite: records the invite row and pushes a notification
 * containing the tribe's existing invite link. Throws friendly errors for
 * edge cases the UI should surface (already a member, already invited).
 */
export async function sendTribeInvite(
  inviterId: string,
  tribeId: string,
  toUserId: string,
): Promise<void> {
  if (!(await isTribeMember(inviterId, tribeId))) {
    throw new Error('Only tribe members can invite others.');
  }
  if (toUserId === inviterId) {
    throw new Error('You cannot invite yourself.');
  }

  const [tribe] = await db.select({ id: tribes.id, name: tribes.name }).from(tribes)
    .where(eq(tribes.id, tribeId)).limit(1);
  if (!tribe) throw new Error('Tribe not found');

  const [targetUser] = await db.select({ id: users.id, name: users.name }).from(users)
    .where(eq(users.id, toUserId)).limit(1);
  if (!targetUser) throw new Error('User not found');

  // Blocked either direction — never allow an invite to cross a block.
  const blocked = await db.select({ id: blockedUsers.id }).from(blockedUsers)
    .where(and(
      sql`(${blockedUsers.userId} = ${inviterId} AND ${blockedUsers.blockedUserId} = ${toUserId})
        OR (${blockedUsers.userId} = ${toUserId} AND ${blockedUsers.blockedUserId} = ${inviterId})`,
    )).limit(1);
  if (blocked.length > 0) {
    throw new Error('Unable to invite this user.');
  }

  const existingMember = await db.select({ id: tribeMembers.id }).from(tribeMembers)
    .where(and(eq(tribeMembers.tribeId, tribeId), eq(tribeMembers.userId, toUserId))).limit(1);
  if (existingMember.length > 0) {
    throw new Error(`${targetUser.name ?? 'This user'} is already a member of ${tribe.name}.`);
  }

  const existingInvite = await db.select({ id: tribeInvites.id }).from(tribeInvites)
    .where(and(
      eq(tribeInvites.tribeId, tribeId),
      eq(tribeInvites.toUserId, toUserId),
      eq(tribeInvites.status, 'pending'),
    )).limit(1);
  if (existingInvite.length > 0) {
    throw new Error(`${targetUser.name ?? 'This user'} already has a pending invite to ${tribe.name}.`);
  }

  const inviteToken = await ensureInviteToken(tribeId);

  const [inviter] = await db.select({ name: users.name }).from(users)
    .where(eq(users.id, inviterId)).limit(1);

  await db.insert(tribeInvites).values({
    id: `ti-${crypto.randomUUID()}`,
    tribeId,
    fromUserId: inviterId,
    toUserId,
    status: 'pending',
    createdAt: new Date(),
  });

  const { notifyTribeInvite } = await import('./realtime-dispatch');
  await notifyTribeInvite(toUserId, inviter?.name ?? 'Someone', tribe.name, inviteToken).catch(() => {});
}

/**
 * Pending invites addressed to a user, for the activity feed. An invite
 * "resolves itself" the moment the invitee becomes a member through any
 * path (this in-app invite, the raw share link, browsing to a public/listed
 * tribe, etc.) — callers should exclude rows where the user already joined
 * rather than requiring an explicit accept/decline action.
 */
export async function getPendingTribeInvites(toUserId: string): Promise<Array<{
  id: string;
  tribeId: string;
  tribeName: string;
  tribeSlug: string | null;
  inviteToken: string | null;
  fromUserId: string;
  fromUserName: string;
  fromUserAvatar: string | null;
  createdAt: Date;
}>> {
  const rows = await db.select({
    id: tribeInvites.id,
    tribeId: tribeInvites.tribeId,
    fromUserId: tribeInvites.fromUserId,
    createdAt: tribeInvites.createdAt,
    tribeName: tribes.name,
    tribeSlug: tribes.slug,
    inviteToken: tribes.inviteToken,
  })
    .from(tribeInvites)
    .innerJoin(tribes, eq(tribeInvites.tribeId, tribes.id))
    .where(and(
      eq(tribeInvites.toUserId, toUserId),
      eq(tribeInvites.status, 'pending'),
      // Exclude invites for tribes the user already joined
      sql`NOT EXISTS (
        SELECT 1 FROM ${tribeMembers}
        WHERE ${tribeMembers.tribeId} = ${tribeInvites.tribeId}
          AND ${tribeMembers.userId} = ${toUserId}
      )`,
    ))
    .orderBy(sql`${tribeInvites.createdAt} DESC`)
    .limit(10);

  if (rows.length === 0) return [];

  const fromUserIds = [...new Set(rows.map(r => r.fromUserId))];
  const fromUsers = await db.select({ id: users.id, name: users.name, avatar: users.avatar })
    .from(users).where(inArray(users.id, fromUserIds));
  const fromUserMap = new Map(fromUsers.map(u => [u.id, u]));

  return rows.map(r => {
    const fromUser = fromUserMap.get(r.fromUserId);
    return {
      id: r.id,
      tribeId: r.tribeId,
      tribeName: r.tribeName,
      tribeSlug: r.tribeSlug,
      inviteToken: r.inviteToken,
      fromUserId: r.fromUserId,
      fromUserName: fromUser?.name ?? 'Someone',
      fromUserAvatar: fromUser?.avatar ?? null,
      createdAt: r.createdAt ?? new Date(),
    };
  });
}
