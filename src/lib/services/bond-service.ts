/**
 * @fileoverview Service layer for bond management actions.
 * Phase 2A: Full bond request lifecycle + creation flow.
 * Now backed by Drizzle ORM + SQLite.
 */

import { db } from '@/db';
import { bonds, bondRequests, blockedUsers, users, tribes } from '@/db/schema';
import { eq, and, or, count } from 'drizzle-orm';
import type { Bond, BondRequest, BondType, FormationMethod } from '@/lib/types';
import {
  computePasskeyStatus, computeNewExpiry, isBondDegraded, getStatusDescription,
  getExpiryDuration, daysUntilExpiry, AUTO_REFRESH_THRESHOLD_DAYS,
} from '@/lib/crypto/passkey-lifecycle';

/**
 * Guard: ensures a bond's passkey is not expired before allowing sensitive operations.
 * Throws for expired bonds. Returns the computed status.
 */
async function requireBondActive(bondId: string): Promise<Bond['passkeyStatus']> {
  const [row] = await db.select().from(bonds).where(eq(bonds.id, bondId)).limit(1);
  if (!row) throw new Error('Bond not found');
  const status = computePasskeyStatus({ expiresAt: row.expiresAt ?? new Date() });
  if (isBondDegraded(status)) {
    throw new Error(`Bond passkey has expired. Please refresh your bond to continue. (${getStatusDescription(status)})`);
  }
  return status;
}

// ============================================================
// ROW → TYPE MAPPERS
// ============================================================

function rowToBond(row: typeof bonds.$inferSelect): Bond {
  return {
    id: row.id,
    targetId: row.targetId ?? undefined,
    targetName: row.targetName,
    targetType: row.targetType as Bond['targetType'],
    bondType: row.bondType as Bond['bondType'],
    formationMethod: row.formationMethod as Bond['formationMethod'],
    passkeyStatus: (row.passkeyStatus ?? 'active') as Bond['passkeyStatus'],
    expiresAt: row.expiresAt ?? new Date(),
    lastRefreshedAt: row.lastRefreshedAt ?? new Date(),
    reconnectsCount: row.reconnectsCount ?? 0,
    pseudonym: row.pseudonym ?? undefined,
    targetPseudonymForMe: row.targetPseudonymForMe ?? undefined,
    tribeAssignedNickname: row.tribeAssignedNickname ?? undefined,
    displayPreferenceForTribeNickname: (row.displayPreference ?? undefined) as Bond['displayPreferenceForTribeNickname'],
    tribeNicknameVibe: (row.nicknameVibe ?? undefined) as Bond['tribeNicknameVibe'],
    isTribeNicknameReported: row.isNicknameReported ?? false,
    showInIntercom: row.showInIntercom ?? true,
    allowChatInitiation: row.allowChatInitiation ?? false,
    innerCircle: row.innerCircle ?? false,
    keyType: (row.keyType ?? 'standard') as Bond['keyType'],
    eventId: row.eventId ?? undefined,
    accessTier: (row.accessTier ?? undefined) as Bond['accessTier'],
    publicKeyJwk: row.publicKeyJwk ?? undefined,
  };
}

async function enrichBondRequest(row: typeof bondRequests.$inferSelect): Promise<BondRequest> {
  const [fromUser] = await db.select().from(users).where(eq(users.id, row.fromUserId)).limit(1);
  const [toUser] = await db.select().from(users).where(eq(users.id, row.toUserId)).limit(1);

  return {
    id: row.id,
    fromUserId: row.fromUserId,
    fromUserName: fromUser?.name ?? 'Unknown',
    fromUserAvatar: fromUser?.avatar ?? undefined,
    toUserId: row.toUserId,
    toUserName: toUser?.name ?? 'Unknown',
    toUserAvatar: toUser?.avatar ?? undefined,
    bondType: row.bondType as BondType,
    formationMethod: row.formationMethod as FormationMethod,
    message: row.message ?? undefined,
    status: row.status as BondRequest['status'],
    createdAt: row.createdAt ?? new Date(),
    resolvedAt: row.resolvedAt ?? undefined,
  };
}

// ============================================================
// BOND QUERIES
// ============================================================

/**
 * Fetches all bonds for the current user.
 */
export async function getBonds(userId: string): Promise<Bond[]> {
  const rows = await db.select().from(bonds).where(eq(bonds.userId, userId));
  const bondList = rows.map(rowToBond);

  for (const bond of bondList) {
    // Phase 2D: Compute passkey status on read (check-on-read pattern)
    const computedStatus = computePasskeyStatus(bond);
    if (computedStatus !== bond.passkeyStatus) {
      bond.passkeyStatus = computedStatus;
      // Persist the status change back to DB (lazy write-back)
      await db.update(bonds).set({ passkeyStatus: computedStatus })
        .where(eq(bonds.id, bond.id));
    }

    // Phase 2C: Enrich user-type bonds with the peer's public key
    if (bond.targetType === 'user') {
      const targetId = rows.find(r => r.id === bond.id)?.targetId;
      if (targetId) {
        const [peerBondRow] = await db.select({ publicKeyJwk: bonds.publicKeyJwk })
          .from(bonds)
          .where(and(eq(bonds.userId, targetId), eq(bonds.targetId, userId)))
          .limit(1);
        bond.peerPublicKeyJwk = peerBondRow?.publicKeyJwk ?? undefined;
      }
    }
  }

  return bondList;
}

/**
 * Count active bonds for a user (for tier limit enforcement).
 */
export async function getBondCount(userId: string): Promise<number> {
  const result = await db.select({ count: count() }).from(bonds).where(eq(bonds.userId, userId));
  return result[0]?.count ?? 0;
}

/**
 * Fetches only family-type bonds for a user (for the introduce flow).
 * Returns bonds with targetType = 'user' and bondType = 'family'.
 */
export async function getFamilyBonds(userId: string): Promise<Bond[]> {
  const rows = await db.select().from(bonds)
    .where(and(eq(bonds.userId, userId), eq(bonds.bondType, 'family'), eq(bonds.targetType, 'user')));
  return rows.map(rowToBond);
}

/**
 * Creates family introduction bond requests.
 * Sends a family bond request from the new member to each selected existing family member.
 * Skips if a bond or pending request already exists between the two.
 *
 * @param introducerId - The user performing the introduction (for the message)
 * @param newMemberId - The user ID of the newly-connected family member
 * @param targetMemberIds - IDs of existing family members to introduce to
 * @returns Number of introduction requests actually sent
 */
export async function createFamilyIntroductions(
  introducerId: string,
  newMemberId: string,
  targetMemberIds: string[],
): Promise<number> {
  // Look up the introducer name for the request message
  const [introducer] = await db.select({ name: users.name }).from(users)
    .where(eq(users.id, introducerId)).limit(1);
  const introducerName = introducer?.name ?? 'A family member';

  let sent = 0;
  for (const targetId of targetMemberIds) {
    // Skip self
    if (targetId === newMemberId) continue;

    // Skip if bond already exists
    const existingBond = await db.select().from(bonds)
      .where(and(eq(bonds.userId, newMemberId), eq(bonds.targetId, targetId)))
      .limit(1);
    if (existingBond.length > 0) continue;

    // Skip if pending request already exists
    const existingRequest = await db.select().from(bondRequests)
      .where(and(
        eq(bondRequests.fromUserId, newMemberId),
        eq(bondRequests.toUserId, targetId),
        eq(bondRequests.status, 'pending'),
      ))
      .limit(1);
    if (existingRequest.length > 0) continue;

    // Create the bond request
    const id = crypto.randomUUID();
    await db.insert(bondRequests).values({
      id,
      fromUserId: newMemberId,
      toUserId: targetId,
      bondType: 'family',
      formationMethod: 'family_introduction',
      message: `Family introduction from ${introducerName}'s network`,
      status: 'pending',
      createdAt: new Date(),
    });
    sent++;

    // Fire-and-forget: notify recipient via email (P4-2)
    notifyFamilyIntroEmail(newMemberId, targetId, introducerName).catch(() => {});
  }

  return sent;
}

// ============================================================
// BOND REQUEST LIFECYCLE
// ============================================================

/**
 * Creates a bond request from one user to another.
 * Validates: not self, not blocked, no duplicate pending, within tier limits.
 */
export async function createBondRequest(
  fromUserId: string,
  toUserId: string,
  bondType: BondType,
  formationMethod: FormationMethod,
  message?: string,
): Promise<BondRequest> {
  // Validation: can't bond with yourself
  if (fromUserId === toUserId) {
    throw new Error('Cannot create a bond with yourself');
  }

  // Validation: check if target has blocked the requester
  const blockCheck = await db.select().from(blockedUsers)
    .where(and(eq(blockedUsers.userId, toUserId), eq(blockedUsers.blockedUserId, fromUserId)))
    .limit(1);
  if (blockCheck.length > 0) {
    throw new Error('Cannot send a bond request to this user');
  }

  // Validation: check if requester has blocked the target
  const reverseBlockCheck = await db.select().from(blockedUsers)
    .where(and(eq(blockedUsers.userId, fromUserId), eq(blockedUsers.blockedUserId, toUserId)))
    .limit(1);
  if (reverseBlockCheck.length > 0) {
    throw new Error('You have blocked this user. Unblock them first to send a bond request.');
  }

  // Validation: no duplicate pending request
  const existingRequest = await db.select().from(bondRequests)
    .where(and(
      eq(bondRequests.fromUserId, fromUserId),
      eq(bondRequests.toUserId, toUserId),
      eq(bondRequests.status, 'pending'),
    ))
    .limit(1);
  if (existingRequest.length > 0) {
    throw new Error('You already have a pending bond request to this user');
  }

  // Validation: no existing bond with this target
  const existingBond = await db.select().from(bonds)
    .where(and(eq(bonds.userId, fromUserId), eq(bonds.targetId, toUserId)))
    .limit(1);
  if (existingBond.length > 0) {
    throw new Error('You already have a bond with this user');
  }

  // Validation: tier limits (Phase 3 — uses subscription guard)
  const { canCreateBond } = await import('@/lib/services/subscription-guard');
  const bondCheck = await canCreateBond(fromUserId);
  if (!bondCheck.allowed) {
    throw new Error(`${bondCheck.planName} plan allows ${bondCheck.limit} bonds (you have ${bondCheck.current}). Upgrade to create more.`);
  }

  // Validation: family bonds require paid feature
  if (bondType === 'family') {
    const { hasFeature } = await import('@/lib/services/subscription-guard');
    if (!(await hasFeature(fromUserId, 'family_bonds'))) {
      throw new Error('Family bonds require a paid membership. Upgrade to create family bonds.');
    }
  }

  const id = crypto.randomUUID();
  await db.insert(bondRequests).values({
    id,
    fromUserId,
    toUserId,
    bondType,
    formationMethod,
    message: message ?? null,
    status: 'pending',
    createdAt: new Date(),
  });

  const [row] = await db.select().from(bondRequests).where(eq(bondRequests.id, id)).limit(1);

  // Fire-and-forget: Email notification to recipient
  notifyBondRequestEmail(fromUserId, toUserId, bondType).catch(() => {});

  return enrichBondRequest(row!);
}

/**
 * Accepts a bond request — creates bond rows for both users (mutual bond types) or one (asymmetric).
 * Only the target user (toUserId) can accept.
 */
export async function acceptBondRequest(requestId: string, acceptorUserId: string): Promise<void> {
  const [request] = await db.select().from(bondRequests)
    .where(and(eq(bondRequests.id, requestId), eq(bondRequests.status, 'pending')))
    .limit(1);

  if (!request) throw new Error('Bond request not found or already resolved');
  if (request.toUserId !== acceptorUserId) throw new Error('Only the recipient can accept a bond request');

  // Resolve the request
  await db.update(bondRequests).set({
    status: 'accepted',
    resolvedAt: new Date(),
  }).where(eq(bondRequests.id, requestId));

  // Lookup user names for bond rows
  const [fromUser] = await db.select().from(users).where(eq(users.id, request.fromUserId)).limit(1);
  const [toUser] = await db.select().from(users).where(eq(users.id, request.toUserId)).limit(1);

  const now = new Date();
  const expiresAt = computeNewExpiry(request.bondType);

  // Create bond for the requester (from → to)
  await db.insert(bonds).values({
    id: `bond-${request.fromUserId.substring(0, 8)}-${request.toUserId.substring(0, 8)}-${Date.now()}`,
    userId: request.fromUserId,
    targetId: request.toUserId,
    targetType: 'user',
    targetName: toUser?.name ?? 'Unknown',
    bondType: request.bondType,
    formationMethod: request.formationMethod,
    passkeyStatus: 'active',
    expiresAt,
    lastRefreshedAt: now,
    reconnectsCount: 0,
    innerCircle: request.bondType === 'family', // Family bonds auto-join Inner Circle
  });

  // For mutual bond types (family, friend, professional, collaborator), create the reverse bond too
  const mutualTypes: BondType[] = ['family', 'friend', 'professional', 'collaborator'];
  if (mutualTypes.includes(request.bondType as BondType)) {
    await db.insert(bonds).values({
      id: `bond-${request.toUserId.substring(0, 8)}-${request.fromUserId.substring(0, 8)}-${Date.now()}`,
      userId: request.toUserId,
      targetId: request.fromUserId,
      targetType: 'user',
      targetName: fromUser?.name ?? 'Unknown',
      bondType: request.bondType,
      formationMethod: request.formationMethod,
      passkeyStatus: 'active',
      expiresAt,
      lastRefreshedAt: now,
      reconnectsCount: 0,
      innerCircle: request.bondType === 'family', // Family bonds auto-join Inner Circle
    });
  }
}

/**
 * Rejects a bond request. Only the target user can reject.
 */
export async function rejectBondRequest(requestId: string, rejectorUserId: string): Promise<void> {
  const [request] = await db.select().from(bondRequests)
    .where(and(eq(bondRequests.id, requestId), eq(bondRequests.status, 'pending')))
    .limit(1);

  if (!request) throw new Error('Bond request not found or already resolved');
  if (request.toUserId !== rejectorUserId) throw new Error('Only the recipient can reject a bond request');

  await db.update(bondRequests).set({
    status: 'rejected',
    resolvedAt: new Date(),
  }).where(eq(bondRequests.id, requestId));
}

// ============================================================
// KEY EXCHANGE (Phase 2C)
// ============================================================

/**
 * Stores the user's public key on their bond row.
 * Called by the client after key generation.
 * The peer can then read this via getBonds() → peerPublicKeyJwk.
 */
export async function submitBondPublicKey(
  bondId: string,
  userId: string,
  publicKeyJwk: string,
): Promise<void> {
  // Verify the bond belongs to this user
  const [bond] = await db.select().from(bonds)
    .where(and(eq(bonds.id, bondId), eq(bonds.userId, userId)))
    .limit(1);

  if (!bond) throw new Error('Bond not found or unauthorized');

  // Passkey expiration guard
  await requireBondActive(bondId);

  await db.update(bonds).set({
    publicKeyJwk,
  }).where(eq(bonds.id, bondId));
}

/**
 * Gets the peer's public key for a specific bond.
 * Looks up the reverse bond row (peer's bond that targets us).
 */
export async function getPeerPublicKey(
  bondId: string,
  userId: string,
): Promise<string | null> {
  // Get our bond to find the target
  const [ourBond] = await db.select().from(bonds)
    .where(and(eq(bonds.id, bondId), eq(bonds.userId, userId)))
    .limit(1);

  if (!ourBond || !ourBond.targetId) return null;

  // Find the peer's bond row that targets us
  const [peerBond] = await db.select({ publicKeyJwk: bonds.publicKeyJwk })
    .from(bonds)
    .where(and(eq(bonds.userId, ourBond.targetId), eq(bonds.targetId, userId)))
    .limit(1);

  return peerBond?.publicKeyJwk ?? null;
}

/**
 * Gets pending bond requests for a user (both incoming and outgoing).
 */
export async function getPendingBondRequests(userId: string): Promise<{
  incoming: BondRequest[];
  outgoing: BondRequest[];
}> {
  const rows = await db.select().from(bondRequests)
    .where(and(
      eq(bondRequests.status, 'pending'),
      or(eq(bondRequests.fromUserId, userId), eq(bondRequests.toUserId, userId)),
    ));

  const enriched = await Promise.all(rows.map(enrichBondRequest));

  return {
    incoming: enriched.filter(r => r.toUserId === userId),
    outgoing: enriched.filter(r => r.fromUserId === userId),
  };
}

// ============================================================
// IMMEDIATE BOND CREATION (no request needed)
// ============================================================

/**
 * Creates a follower/supporter bond immediately (no acceptance needed).
 * Used for tribe joins and one-way follows.
 */
export async function createFollowerBond(
  userId: string,
  targetId: string,
  targetType: 'user' | 'tribe',
  targetName: string,
  bondType: 'follower' | 'supporter' = 'follower',
): Promise<void> {
  // Check if bond already exists
  const existing = await db.select().from(bonds)
    .where(and(eq(bonds.userId, userId), eq(bonds.targetId, targetId)))
    .limit(1);
  if (existing.length > 0) return; // Already bonded

  // For tribe bonds, read the tribe's configured duration
  let tribeDurationDays: number | null = null;
  if (targetType === 'tribe') {
    const [tribe] = await db.select({ bondDurationDays: tribes.bondDurationDays })
      .from(tribes).where(eq(tribes.id, targetId)).limit(1);
    tribeDurationDays = tribe?.bondDurationDays ?? null;
  }

  const now = new Date();
  await db.insert(bonds).values({
    id: `bond-${userId.substring(0, 8)}-${targetId.substring(0, 8)}-${Date.now()}`,
    userId,
    targetId,
    targetType,
    targetName,
    bondType,
    formationMethod: 'virtual_request',
    passkeyStatus: 'active',
    expiresAt: computeNewExpiry(bondType, tribeDurationDays),
    lastRefreshedAt: now,
    reconnectsCount: 0,
  });
}

/**
 * Creates a mutual referral bond between an inviter and invitee.
 * This is platform-granted (bypasses subscription guard) and auto-accepted.
 * Creates bonds in BOTH directions so both users see the connection.
 *
 * This forms the "trust chain" — every user is connected to the person
 * who invited them, creating an auditable graph for bot detection.
 */
export async function createReferralBond(
  inviteeId: string,
  inviterId: string,
): Promise<void> {
  // Look up inviter's name for the bond display
  const { users } = await import('@/db/schema');
  const [inviter] = await db.select({ name: users.name }).from(users)
    .where(eq(users.id, inviterId)).limit(1);
  const [invitee] = await db.select({ name: users.name }).from(users)
    .where(eq(users.id, inviteeId)).limit(1);

  const inviterName = inviter?.name ?? 'Unknown';
  const inviteeName = invitee?.name ?? 'Unknown';
  const now = new Date();

  // Bond: invitee → inviter
  const existingForward = await db.select().from(bonds)
    .where(and(eq(bonds.userId, inviteeId), eq(bonds.targetId, inviterId)))
    .limit(1);
  if (existingForward.length === 0) {
    await db.insert(bonds).values({
      id: `bond-ref-${inviteeId.substring(0, 8)}-${inviterId.substring(0, 8)}-${Date.now()}`,
      userId: inviteeId,
      targetId: inviterId,
      targetType: 'user',
      targetName: inviterName,
      bondType: 'friend',
      formationMethod: 'digital_introduction',
      passkeyStatus: 'active',
      expiresAt: new Date(now.getTime() + 365 * 86400000), // 1 year
      lastRefreshedAt: now,
      reconnectsCount: 0,
    });
  }

  // Bond: inviter → invitee
  const existingReverse = await db.select().from(bonds)
    .where(and(eq(bonds.userId, inviterId), eq(bonds.targetId, inviteeId)))
    .limit(1);
  if (existingReverse.length === 0) {
    await db.insert(bonds).values({
      id: `bond-ref-${inviterId.substring(0, 8)}-${inviteeId.substring(0, 8)}-${Date.now()}`,
      userId: inviterId,
      targetId: inviteeId,
      targetType: 'user',
      targetName: inviteeName,
      bondType: 'friend',
      formationMethod: 'digital_introduction',
      passkeyStatus: 'active',
      expiresAt: new Date(now.getTime() + 365 * 86400000), // 1 year
      lastRefreshedAt: now,
      reconnectsCount: 0,
    });
  }
}

// ============================================================
// EXISTING BOND OPERATIONS (preserved from Phase 1)
// ============================================================

/**
 * Refreshes a bond's passkey — resets expiration and triggers key regeneration.
 * Phase 2D: Uses computeNewExpiry for consistent duration calculation.
 * Clears publicKeyJwk to force client-side key regeneration.
 */
export async function refreshBond(bondId: string, userId: string): Promise<void> {
  const [existing] = await db.select().from(bonds)
    .where(and(eq(bonds.id, bondId), eq(bonds.userId, userId)))
    .limit(1);
  if (!existing) throw new Error('Bond not found or unauthorized');

  // For tribe bonds, read the tribe's configured duration
  let tribeDurationDays: number | null = null;
  if (existing.targetType === 'tribe' && existing.targetId) {
    const [tribe] = await db.select({ bondDurationDays: tribes.bondDurationDays })
      .from(tribes).where(eq(tribes.id, existing.targetId)).limit(1);
    tribeDurationDays = tribe?.bondDurationDays ?? null;
  }

  await db.update(bonds).set({
    passkeyStatus: 'active',
    lastRefreshedAt: new Date(),
    expiresAt: computeNewExpiry(existing.bondType, tribeDurationDays),
    reconnectsCount: (existing.reconnectsCount ?? 0) + 1,
    publicKeyJwk: null, // Clear public key — client must regenerate
  }).where(eq(bonds.id, bondId));
}

/**
 * Revokes a bond. Only the bond owner can revoke.
 */
export async function revokeBond(bondId: string, userId: string): Promise<void> {
  const [existing] = await db.select().from(bonds)
    .where(and(eq(bonds.id, bondId), eq(bonds.userId, userId)))
    .limit(1);
  if (!existing) throw new Error('Bond not found or unauthorized');

  await db.delete(bonds).where(eq(bonds.id, bondId));
}

/**
 * Upgrades a user bond to a family bond. Only the bond owner can upgrade.
 */
export async function upgradeToFamilyBond(bondId: string, userId: string): Promise<void> {
  const [existing] = await db.select().from(bonds)
    .where(and(eq(bonds.id, bondId), eq(bonds.userId, userId)))
    .limit(1);
  if (!existing || existing.targetType !== 'user') throw new Error('Bond not found or unauthorized');

  // Server-side guard: check plan-level bond capacity before allowing family upgrade
  const { canCreateBond } = await import('@/lib/services/subscription-guard');
  const bondCheck = await canCreateBond(userId);
  // Free-tier users get a limited number of bonds (the plan's maxBonds).
  // If they're at or over the limit, the upgrade is a privilege escalation.
  if (bondCheck.limit !== null) {
    // Count existing family bonds
    const familyBonds = await db.select({ count: count() }).from(bonds)
      .where(and(eq(bonds.userId, userId), eq(bonds.bondType, 'family')));
    const familyCount = familyBonds[0]?.count ?? 0;
    // Use same limit — family bonds are the premium subset
    if (familyCount >= bondCheck.limit) {
      throw new Error(`Your ${bondCheck.planName} plan allows up to ${bondCheck.limit} family bonds. Upgrade your plan to add more.`);
    }
  }

  await db.update(bonds).set({
    bondType: 'family',
    passkeyStatus: 'active',
    lastRefreshedAt: new Date(),
    expiresAt: computeNewExpiry('family'), // Family bonds always use 365-day duration
    reconnectsCount: (existing.reconnectsCount ?? 0) + 1,
    publicKeyJwk: null, // Clear public key — type changed, regen required
  }).where(eq(bonds.id, bondId));
}

/**
 * Saves updated settings for a bond. Only the bond owner can modify.
 */
export async function saveBondSettings(updatedBond: Bond, userId: string): Promise<void> {
  // Verify ownership
  const [existing] = await db.select().from(bonds)
    .where(and(eq(bonds.id, updatedBond.id), eq(bonds.userId, userId)))
    .limit(1);
  if (!existing) throw new Error('Bond not found or unauthorized');

  // Passkey expiration guard
  await requireBondActive(updatedBond.id);

  await db.update(bonds).set({
    showInIntercom: updatedBond.showInIntercom,
    pseudonym: updatedBond.pseudonym ?? null,
    targetPseudonymForMe: updatedBond.targetPseudonymForMe ?? null,
    displayPreference: updatedBond.displayPreferenceForTribeNickname ?? null,
    nicknameVibe: updatedBond.tribeNicknameVibe ?? null,
    isNicknameReported: updatedBond.isTribeNicknameReported ?? false,
    allowChatInitiation: updatedBond.allowChatInitiation ?? false,
    innerCircle: updatedBond.innerCircle ?? false,
  }).where(eq(bonds.id, updatedBond.id));
}

// ============================================================
// USER BLOCKING
// ============================================================

/**
 * Blocks a user — prevents all interactions.
 */
export async function blockUser(userId: string, blockedUsrId: string, reason?: string): Promise<void> {
  // Check if already blocked
  const [existing] = await db.select().from(blockedUsers)
    .where(and(eq(blockedUsers.userId, userId), eq(blockedUsers.blockedUserId, blockedUsrId)))
    .limit(1);
  if (existing) return;

  await db.insert(blockedUsers).values({
    id: `block-${Date.now()}`,
    userId,
    blockedUserId: blockedUsrId,
    blockedAt: new Date(),
    reason: reason ?? null,
  });

  // Also revoke any bonds with this user
  const userBonds = await db.select().from(bonds)
    .where(and(eq(bonds.userId, userId), eq(bonds.targetId, blockedUsrId)));
  for (const bond of userBonds) {
    await db.delete(bonds).where(eq(bonds.id, bond.id));
  }

  // Reject any pending bond requests between the two users
  const pendingRequests = await db.select().from(bondRequests)
    .where(and(
      eq(bondRequests.status, 'pending'),
      or(
        and(eq(bondRequests.fromUserId, userId), eq(bondRequests.toUserId, blockedUsrId)),
        and(eq(bondRequests.fromUserId, blockedUsrId), eq(bondRequests.toUserId, userId)),
      ),
    ));
  for (const req of pendingRequests) {
    await db.update(bondRequests).set({
      status: 'rejected',
      resolvedAt: new Date(),
    }).where(eq(bondRequests.id, req.id));
  }
}

/**
 * Gets the list of blocked user IDs for the current user.
 */
export async function getBlockedUserIds(userId: string): Promise<Set<string>> {
  const rows = await db.select().from(blockedUsers)
    .where(eq(blockedUsers.userId, userId));
  return new Set(rows.map(r => r.blockedUserId));
}

// ============================================================
// AUTO-REFRESH ON SHARING ACTIVITY
// ============================================================

/**
 * Silently extends a bond's expiry when the user actively shares content.
 *
 * This is the heart of the "active not passive" design: posting, commenting,
 * vibing, and messaging keep your bonds alive. Lurking does not.
 *
 * Only triggers a DB write when the bond has < AUTO_REFRESH_THRESHOLD_DAYS
 * remaining, to avoid unnecessary writes on every interaction.
 *
 * @param userId - The user who performed the sharing action
 * @param targetId - The tribe ID or user ID the action relates to
 * @param targetType - 'tribe' or 'user'
 */
export async function touchBondOnActivity(
  userId: string,
  targetId: string,
  targetType: 'tribe' | 'user' = 'tribe',
): Promise<void> {
  try {
    // Find the user's bond with this target
    const [bond] = await db.select().from(bonds)
      .where(and(eq(bonds.userId, userId), eq(bonds.targetId, targetId)))
      .limit(1);

    if (!bond || !bond.expiresAt) return;

    // Only refresh if within the threshold window
    const remaining = daysUntilExpiry({ expiresAt: bond.expiresAt });
    if (remaining > AUTO_REFRESH_THRESHOLD_DAYS) return;

    // For tribe bonds, read the tribe's configured duration
    let tribeDurationDays: number | null = null;
    if (targetType === 'tribe') {
      const [tribe] = await db.select({ bondDurationDays: tribes.bondDurationDays })
        .from(tribes).where(eq(tribes.id, targetId)).limit(1);
      tribeDurationDays = tribe?.bondDurationDays ?? null;
    }

    // Extend the bond
    await db.update(bonds).set({
      passkeyStatus: 'active',
      lastRefreshedAt: new Date(),
      expiresAt: computeNewExpiry(bond.bondType, tribeDurationDays),
    }).where(eq(bonds.id, bond.id));
  } catch {
    // Fire-and-forget: never let auto-refresh failures break the main action
  }
}

// ============================================================
// EMAIL NOTIFICATION HELPERS (P4-1)
// ============================================================

async function notifyBondRequestEmail(fromUserId: string, toUserId: string, bondType: string): Promise<void> {
  const { getPreferences } = await import('@/lib/services/notification-service');
  const prefs = await getPreferences(toUserId);

  const [toUser] = await db.select({ name: users.name, email: users.email })
    .from(users).where(eq(users.id, toUserId)).limit(1);
  const [fromUser] = await db.select({ name: users.name })
    .from(users).where(eq(users.id, fromUserId)).limit(1);

  if (!toUser) return;

  // Push notification (always attempt if push is enabled)
  if (prefs.pushEnabled && prefs.bondMessagesEnabled) {
    const { sendPushNotification } = await import('@/lib/services/push-service');
    sendPushNotification(toUserId, {
      title: 'New Bond Request',
      body: `${fromUser?.name ?? 'Someone'} wants to form a ${bondType} bond with you.`,
      url: '/bonds?tab=requests',
      tag: `bond-request-${fromUserId}`,
    }).catch(() => {});
  }

  // Email notification
  if (prefs.emailEnabled && prefs.bondMessagesEnabled && toUser.email) {
    const { sendEmail } = await import('@/lib/services/email-service');
    const { bondRequestEmail } = await import('@/lib/services/email-templates');
    const { generateUnsubscribeUrl } = await import('@/lib/services/email-unsubscribe-service');
    const unsubUrl = generateUnsubscribeUrl(toUserId, 'bondMessages');
    const email = bondRequestEmail(toUser.name, fromUser?.name ?? 'Someone', bondType, unsubUrl);
    await sendEmail({ to: toUser.email, ...email }, toUserId);
  }
}

async function notifyFamilyIntroEmail(newMemberId: string, targetId: string, introducerName: string): Promise<void> {
  const { getPreferences } = await import('@/lib/services/notification-service');
  const prefs = await getPreferences(targetId);

  const [toUser] = await db.select({ name: users.name, email: users.email })
    .from(users).where(eq(users.id, targetId)).limit(1);
  const [fromUser] = await db.select({ name: users.name })
    .from(users).where(eq(users.id, newMemberId)).limit(1);

  if (!toUser) return;

  // Push notification
  if (prefs.pushEnabled && prefs.bondMessagesEnabled) {
    const { sendPushNotification } = await import('@/lib/services/push-service');
    sendPushNotification(targetId, {
      title: 'Family Introduction',
      body: `${introducerName} introduced you to ${fromUser?.name ?? 'a new family member'}.`,
      url: '/bonds?tab=requests',
      tag: `family-intro-${newMemberId}`,
    }).catch(() => {});
  }

  // Email notification
  if (prefs.emailEnabled && prefs.bondMessagesEnabled && toUser.email) {
    const { sendEmail } = await import('@/lib/services/email-service');
    const { familyIntroEmail } = await import('@/lib/services/email-templates');
    const { generateUnsubscribeUrl } = await import('@/lib/services/email-unsubscribe-service');
    const unsubUrl = generateUnsubscribeUrl(targetId, 'bondMessages');
    const email = familyIntroEmail(toUser.name, fromUser?.name ?? 'A new member', introducerName, unsubUrl);
    await sendEmail({ to: toUser.email, ...email }, targetId);
  }
}

