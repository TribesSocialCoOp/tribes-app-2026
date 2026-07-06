/**
 * @fileoverview Service layer for tribe actions.
 * Now backed by Drizzle ORM + SQLite.
 */
import * as z from "zod";
import { db } from '@/db';
import { tribes, tribeMoodTags, tribeMembers, pendingMembers } from '@/db/schema';
import { eq, and, desc, count, sql, gte, inArray } from 'drizzle-orm';
import type { Tribe, PendingMember as PendingMemberType, TribeMember } from '@/lib/types';
import { tribeCoverSvg } from '@/lib/placeholder-svg';
import { REPUTATION_HIERARCHY } from '@/lib/constants';

// --- Create Tribe ---
const createTribeFormSchema = z.object({
  name: z.string().min(3).max(50),
  homepageUrl: z.string().url().optional().or(z.literal('')),
  moods: z.array(z.string()).min(1).max(3),
  description: z.string().min(10).max(500),
  isPublic: z.boolean(),
  isNsfw: z.boolean().optional(),
  isListed: z.boolean().optional(),
  coverImage: z.any().optional(),
});
type CreateTribePayload = z.infer<typeof createTribeFormSchema> & { 
  coverPreview?: string | null;
  createdBy?: string;
};

export async function createTribe(payload: CreateTribePayload): Promise<Tribe> {
  const id = `tribe-${Date.now()}`;
  const { generateUniqueSlug } = await import('@/lib/slugify');
  const { generateInviteToken } = await import('@/lib/invite-token');
  const slug = await generateUniqueSlug(payload.name);
  const inviteToken = generateInviteToken();

  // Generate a random, vibrant brand color
  const h = Math.floor(Math.random() * 360);
  const s = 60 + Math.floor(Math.random() * 20); // 60-80% saturation
  const l = 45 + Math.floor(Math.random() * 15); // 45-60% lightness
  const randomBrandColor = `hsl(${h}, ${s}%, ${l}%)`; // Use HSL directly or convert to hex if needed. 
  // The DB stores brand_color as text, so HSL is fine as long as the UI handles it.
  // Actually, the UI uses it in CSS gradients, so it works. 
  // But let's convert to HEX for maximum compatibility if possible.
  
  const hslToHex = (h: number, s: number, l: number) => {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };
  const brandColor = hslToHex(h, s, l);

  // NSFW policy §3: an NSFW tribe is permanently locked to Private (E2EE). The flag
  // forces isPublic=false regardless of what the client requested.
  const isNsfw = payload.isNsfw ?? false;
  const isPublic = isNsfw ? false : payload.isPublic;
  // Discoverability: NSFW tribes are LISTED by default (founder may unlist). All other
  // tribes derive discoverability from isPublic, so isListed stays false for them.
  const isListed = isNsfw ? (payload.isListed ?? true) : false;

  // NSFW gate (issue #32): geo-block region, else require the web-set 18+ opt-in.
  if (isNsfw && payload.createdBy) {
    const { assertNsfwAccess } = await import('@/lib/age-verification/nsfw-gate');
    await assertNsfwAccess(payload.createdBy);
  }

  await db.insert(tribes).values({
    id,
    slug,
    name: payload.name,
    description: payload.description,
    memberCount: 1,
    isPublic,
    isNsfw,
    isListed,
    cover: payload.coverPreview || tribeCoverSvg(payload.name, brandColor),
    dataAiHint: 'community group',
    homepageUrl: payload.homepageUrl || null,
    joinMechanism: 'instant',
    createdBy: payload.createdBy || null,
    inviteToken,
    brandColor: brandColor,
    createdAt: new Date(),
  });

  // Insert mood tags
  for (const mood of payload.moods) {
    await db.insert(tribeMoodTags).values({ tribeId: id, moodSlug: mood });
  }

  // Auto-add creator as founder member + bond to the tribe
  const creatorId = payload.createdBy;
  if (creatorId) {
    await db.insert(tribeMembers).values({
      id: `tm-${creatorId}-${id}`,
      tribeId: id,
      userId: creatorId,
      role: 'founder',
      joinedAt: new Date(),
    });

    // Create the founder's bond to the tribe (same pattern as join/approve flows)
    const { createTribeBond } = await import('@/lib/services/bond-service');
    await createTribeBond(creatorId, id, 'tribe', payload.name);
  }

  return {
    id,
    slug,
    name: payload.name,
    description: payload.description,
    members: 1,
    isPublic,
    isNsfw,
    isListed,
    cover: payload.coverPreview || '',
    dataAiHint: 'community group',
    moods: payload.moods,
    homepageUrl: payload.homepageUrl || undefined,
    joinMechanism: 'instant',
    inviteToken,
  };
}

// --- Update Tribe Settings ---
const tribeSettingsFormSchema = z.object({
  name: z.string().min(3).max(50),
  description: z.string().min(10).max(500),
  homepageUrl: z.string().url().optional().or(z.literal('')),
  isPublic: z.boolean(),
  isNsfw: z.boolean().optional(),
  isListed: z.boolean().optional(),
  moods: z.array(z.string()).max(3).optional().default([]),
  joinMechanism: z.enum(['instant', 'approval']),
  minimumReputation: z.enum(['Newcomer', 'Active', 'Trusted', 'Veteran', 'Elder']).optional(),
  minimumAccountAgeDays: z.number().int().positive().optional(),
  brandColor: z.string().optional(),
  brandLogo: z.string().optional(),
  cover: z.string().optional(),
  coverPosition: z.string().optional(),
  bondDurationDays: z.number().int().min(30).max(365).optional().nullable(), // null = platform default (90 days)
});
type UpdateTribeSettingsPayload = z.infer<typeof tribeSettingsFormSchema>;

export async function updateTribeSettings(tribeId: string, payload: UpdateTribeSettingsPayload, actingUserId: string): Promise<Tribe | null> {
  const existingRows = await db.select().from(tribes).where(eq(tribes.id, tribeId)).limit(1);
  const existing = existingRows[0];
  if (!existing) return null;

  // ── Name change governance ────────────────────────────────────
  const nameChanged = payload.name !== existing.name;
  if (nameChanged && (existing.memberCount ?? 0) > 1) {
    throw new Error(
      'Tribe name cannot be changed once other members have joined. '
      + 'Create a new tribe if you need a different name.'
    );
  }

  // Solo founder can rename → update slug + create redirect from old slug
  let newSlug = existing.slug;
  if (nameChanged && (existing.memberCount ?? 0) <= 1) {
    const { generateUniqueSlug, createSlugRedirect } = await import('@/lib/slugify');
    newSlug = await generateUniqueSlug(payload.name);
    if (existing.slug && existing.slug !== newSlug) {
      await createSlugRedirect(existing.slug, tribeId);
    }
  }

  // NSFW flag is one-way (issue #119): once a tribe is NSFW it stays NSFW (and Private).
  // Founders may flag a tribe NSFW, but cannot un-flag it. NSFW forces isPublic=false.
  if (existing.isNsfw && payload.isNsfw === false) {
    throw new Error('An NSFW tribe cannot be un-flagged. This setting is permanent.');
  }
  const isNsfw = existing.isNsfw || (payload.isNsfw ?? false);

  // Flipping a tribe TO NSFW is itself a gated action (same gate as createTribe): the
  // acting founder must clear the geo/opt-in/verify gate first. A public→NSFW flip is
  // still allowed — reads are gated per-request — but note that plaintext post/comment
  // history from the tribe's public era stays unencrypted in the DB; only content
  // created after the flip (once the tribe is Private/E2EE) is encrypted.
  if (isNsfw && !existing.isNsfw) {
    const { assertNsfwAccess } = await import('@/lib/age-verification/nsfw-gate');
    await assertNsfwAccess(actingUserId);
  }

  const isPublic = isNsfw ? false : payload.isPublic;
  // NSFW tribes are listable (founder option, default listed); non-NSFW derive
  // discoverability from isPublic, so isListed is forced false for them.
  const isListed = isNsfw ? (payload.isListed ?? existing.isListed ?? true) : false;

  const newBrandColor = payload.brandColor ?? existing.brandColor;
  let newCover = payload.cover ?? existing.cover;
  
  if (newCover && newCover.startsWith('data:image/svg+xml') && (payload.name !== existing.name || payload.brandColor !== existing.brandColor)) {
    const { tribeCoverSvg } = await import('@/lib/placeholder-svg');
    newCover = tribeCoverSvg(payload.name, newBrandColor || undefined);
  }

  await db.update(tribes).set({
    name: payload.name,
    slug: newSlug,
    description: payload.description,
    homepageUrl: payload.homepageUrl || null,
    isPublic,
    isNsfw,
    isListed,
    joinMechanism: payload.joinMechanism,
    minimumReputation: payload.minimumReputation ?? null,
    minimumAccountAgeDays: payload.minimumAccountAgeDays ?? null,
    brandColor: newBrandColor,
    brandLogo: payload.brandLogo ?? existing.brandLogo,
    cover: newCover,
    coverPosition: payload.coverPosition ?? existing.coverPosition,
    bondDurationDays: payload.bondDurationDays !== undefined ? payload.bondDurationDays : existing.bondDurationDays,
  }).where(eq(tribes.id, tribeId));

  // Update mood tags: delete old, insert new
  await db.delete(tribeMoodTags).where(eq(tribeMoodTags.tribeId, tribeId));
  for (const mood of payload.moods ?? []) {
    await db.insert(tribeMoodTags).values({ tribeId, moodSlug: mood });
  }

  // Re-fetch to return updated data
  const { getTribeById } = await import('@/lib/data-access/tribes');
  return getTribeById(tribeId);
}

// --- Member Management ---

export async function getTribeMembers(
  tribeId: string,
  options?: { page?: number; limit?: number },
): Promise<TribeMember[]> {
  const { users, bonds } = await import('@/db/schema');

  // When paginated, apply offset/limit to the base query
  const page = options?.page ?? undefined;
  const limit = options?.limit ?? undefined;

  let rows;
  if (page !== undefined && limit !== undefined) {
    const offset = (page - 1) * limit;
    rows = await db.select().from(tribeMembers)
      .where(eq(tribeMembers.tribeId, tribeId))
      .limit(limit)
      .offset(offset);
  } else {
    rows = await db.select().from(tribeMembers).where(eq(tribeMembers.tribeId, tribeId));
  }

  const memberUserIds = rows.map(r => r.userId);

  if (memberUserIds.length === 0) return [];

  const [allUsers, allBonds] = await Promise.all([
    db.select().from(users).where(inArray(users.id, memberUserIds)),
    db.select().from(bonds).where(and(
      inArray(bonds.userId, memberUserIds),
      eq(bonds.targetId, tribeId),
    )),
  ]);

  const userMap = new Map(allUsers.map(u => [u.id, u]));
  const bondMap = new Map(allBonds.map(b => [b.userId, b]));
  
  return rows.map((r) => {
    const user = userMap.get(r.userId);
    const bond = bondMap.get(r.userId);

    // Resolve name and avatar based on preferences (inline to avoid re-querying)
    let resolvedName = user?.name ?? r.userId;
    let resolvedAvatar = user?.avatar ?? '';

    if (bond?.displayPreference === 'tribe_assigned_nickname' && r.tribeAssignedNickname) {
      resolvedName = r.tribeAssignedNickname;
    } else if (r.joinedAsAlias) {
      resolvedName = r.joinedAsAlias;
      if (r.joinedAsAvatar) resolvedAvatar = r.joinedAsAvatar;
    }

    return {
      id: r.userId,
      slug: user?.slug ?? undefined,
      name: resolvedName,
      avatar: resolvedAvatar ?? '',
      dataAiHint: 'person',
      role: (r.role ?? 'member') as TribeMember['role'],
      tribeId: r.tribeId,
      tribeAssignedNickname: r.tribeAssignedNickname ?? undefined,
      reputationStatus: r.reputationStatus as TribeMember['reputationStatus'],
    };
  });
}

/**
 * Returns the total count of members in a tribe.
 * Used alongside paginated getTribeMembers for "showing X of Y".
 */
export async function getTribeMemberCount(tribeId: string): Promise<number> {
  const result = await db.select({ count: count() }).from(tribeMembers)
    .where(eq(tribeMembers.tribeId, tribeId));
  return result[0]?.count ?? 0;
}


export async function getPendingMembers(tribeId: string): Promise<PendingMemberType[]> {
  const { users } = await import('@/db/schema');
  const rows = await db.select().from(pendingMembers).where(eq(pendingMembers.tribeId, tribeId));
  
  return Promise.all(rows.map(async (r) => {
    const userRows = await db.select().from(users).where(eq(users.id, r.userId)).limit(1);
    const user = userRows[0];
    return {
      id: r.id,
      slug: user?.slug ?? undefined,
      name: user?.name ?? r.userId,
      avatar: user?.avatar ?? '',
      dataAiHint: 'person',
      tribeId: r.tribeId,
      requestTimestamp: r.requestedAt ?? new Date(),
    };
  }));
}

export async function updateMemberNickname(tribeId: string, memberId: string, nickname: string | undefined): Promise<void> {
  await db.update(tribeMembers).set({
    tribeAssignedNickname: nickname ?? null,
  }).where(and(eq(tribeMembers.userId, memberId), eq(tribeMembers.tribeId, tribeId)));
}

export async function updateMemberRole(tribeId: string, memberId: string, role: 'member' | 'speaker'): Promise<void> {
  await db.update(tribeMembers).set({ role }).where(and(eq(tribeMembers.userId, memberId), eq(tribeMembers.tribeId, tribeId)));
}

export async function approveJoinRequest(tribeId: string, pendingMemberId: string): Promise<void> {
  const pendingRows = await db.select().from(pendingMembers)
    .where(and(eq(pendingMembers.id, pendingMemberId), eq(pendingMembers.tribeId, tribeId)))
    .limit(1);
  const pending = pendingRows[0];

  if (!pending) return;

  // GATE: Tribe member cap
  const { canAddTribeMember } = await import('@/lib/services/subscription-guard');
  const memberCheck = await canAddTribeMember(tribeId);
  if (!memberCheck.allowed) {
    throw new Error(`This tribe has reached its member limit (${memberCheck.limit}). The tribe owner needs to upgrade their plan.`);
  }

  await db.transaction(async (tx) => {
    // Remove from pending
    await tx.delete(pendingMembers).where(eq(pendingMembers.id, pendingMemberId));

    // Add as member
    await tx.insert(tribeMembers).values({
      id: `tm-${pending.userId}-${tribeId}`,
      tribeId,
      userId: pending.userId,
      role: 'member',
      joinedAsAlias: pending.joinedAsAlias,
      joinedAsAvatar: pending.joinedAsAvatar,
      joinedAt: new Date(),
    });

    // Increment member count
    await tx.update(tribes).set({ 
      memberCount: sql`COALESCE(${tribes.memberCount}, 0) + 1` 
    }).where(eq(tribes.id, tribeId));
  });

  // Auto-create follower bond for the new member → tribe
  const { createTribeBond } = await import('@/lib/services/bond-service');
  const [tribeRow] = await db.select({ name: tribes.name }).from(tribes).where(eq(tribes.id, tribeId)).limit(1);
  await createTribeBond(pending.userId, tribeId, 'tribe', tribeRow?.name ?? 'Unknown Tribe');
}

export async function denyJoinRequest(tribeId: string, pendingMemberId: string): Promise<void> {
  await db.delete(pendingMembers).where(and(eq(pendingMembers.id, pendingMemberId), eq(pendingMembers.tribeId, tribeId)));
}

/**
 * Bulk-approve multiple pending join requests.
 * Processes sequentially because each approval needs subscription cap check,
 * a DB transaction, and bond creation. Returns a summary of results.
 */
export async function bulkApproveJoinRequests(
  tribeId: string,
  pendingMemberIds: string[],
): Promise<{ approved: number; failed: Array<{ id: string; reason: string }> }> {
  const results = { approved: 0, failed: [] as Array<{ id: string; reason: string }> };

  for (const id of pendingMemberIds) {
    try {
      await approveJoinRequest(tribeId, id);
      results.approved++;
    } catch (err) {
      results.failed.push({
        id,
        reason: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return results;
}

/**
 * Bulk-deny multiple pending join requests.
 * Uses batch delete for efficiency since denial has no side effects.
 */
export async function bulkDenyJoinRequests(
  tribeId: string,
  pendingMemberIds: string[],
): Promise<{ denied: number }> {
  if (pendingMemberIds.length === 0) return { denied: 0 };

  await db.delete(pendingMembers).where(
    and(
      eq(pendingMembers.tribeId, tribeId),
      inArray(pendingMembers.id, pendingMemberIds),
    ),
  );

  return { denied: pendingMemberIds.length };
}

/**
 * Removes a user from a tribe, revokes their tribe bond, decrements member count.
 */
export async function leaveTribe(userId: string, tribeId: string): Promise<void> {
  // Remove membership
  await db.delete(tribeMembers).where(
    and(eq(tribeMembers.userId, userId), eq(tribeMembers.tribeId, tribeId)),
  );

  // Decrement member count
  await db.update(tribes).set({ 
    memberCount: sql`GREATEST(0, COALESCE(${tribes.memberCount}, 1) - 1)` 
  }).where(eq(tribes.id, tribeId));

  // Revoke the tribe bond
  const { bonds: bondsTable } = await import('@/db/schema');
  const tribeBonds = await db.select().from(bondsTable)
    .where(and(eq(bondsTable.userId, userId), eq(bondsTable.targetId, tribeId)));
  for (const bond of tribeBonds) {
    await db.delete(bondsTable).where(eq(bondsTable.id, bond.id));
  }

  // Rotate tribe group key if tribe is private (forward secrecy)
  // The departed member's old key is deactivated; remaining members
  // will receive a new key grant on their next KeySyncProvider cycle.
  try {
    const { isTribePrivate, rotateTribeKey, deleteGrantForUser, getActiveTribeKey } = await import('./tribe-key-service');
    const isPrivate = await isTribePrivate(tribeId);

    if (isPrivate) {
      // Delete the departing user's grant for the current key
      const activeKey = await getActiveTribeKey(tribeId);
      if (activeKey) {
        await deleteGrantForUser(activeKey.id, userId);
        // Rotate to a new key version — old key becomes inactive
        await rotateTribeKey(tribeId, userId);
        console.info(`[tribe-service] Rotated tribe key for ${tribeId} after member ${userId.substring(0, 8)}... left`);
      }
    }
  } catch (err) {
    // Key rotation is best-effort — don't fail the leave operation
    console.warn(`[tribe-service] Failed to rotate tribe key for ${tribeId}:`, err);
  }
}

/**
 * Permanently deletes a tribe and all associated data.
 * Only the founder (createdBy) can delete a tribe.
 * Cascades: members, pending members, mood tags, posts, bonds.
 */
export async function deleteTribe(userId: string, tribeId: string): Promise<void> {
  const { bonds: bondsTable, posts, postMoodTags, comments, vibes } = await import('@/db/schema');

  // Verify tribe exists and user is the founder
  const [tribe] = await db.select().from(tribes).where(eq(tribes.id, tribeId)).limit(1);
  if (!tribe) throw new Error('Tribe not found');
  if (tribe.createdBy !== userId) throw new Error('Only the tribe founder can delete a tribe');

  await db.transaction(async (tx) => {
    // 1. Delete all bonds targeting this tribe (all members' tribe bonds)
    const tribeBonds = await tx.select().from(bondsTable)
      .where(eq(bondsTable.targetId, tribeId));
    for (const bond of tribeBonds) {
      await tx.delete(bondsTable).where(eq(bondsTable.id, bond.id));
    }

    // 2. Delete posts and their related data (comments, vibes, mood tags)
    const tribePosts = await tx.select({ id: posts.id }).from(posts)
      .where(eq(posts.tribeId, tribeId));
    for (const post of tribePosts) {
      await tx.delete(vibes).where(eq(vibes.targetId, post.id));
      await tx.delete(comments).where(eq(comments.postId, post.id));
      await tx.delete(postMoodTags).where(eq(postMoodTags.postId, post.id));
    }
    await tx.delete(posts).where(eq(posts.tribeId, tribeId));

    // 3. Delete members and pending members
    await tx.delete(tribeMembers).where(eq(tribeMembers.tribeId, tribeId));
    await tx.delete(pendingMembers).where(eq(pendingMembers.tribeId, tribeId));

    // 4. Delete mood tags
    await tx.delete(tribeMoodTags).where(eq(tribeMoodTags.tribeId, tribeId));

    // 5. Delete the tribe itself
    await tx.delete(tribes).where(eq(tribes.id, tribeId));
  });
}

// ============================================================
// REPUTATION GATE HIERARCHY
// ============================================================
// REPUTATION_HIERARCHY is now imported from @/lib/constants
// (see imports at top of file)

/**
 * Checks whether a user has a pending join request for a tribe.
 */
export async function checkPendingMembership(userId: string, tribeId: string): Promise<boolean> {
  const existing = await db.select({ id: pendingMembers.id })
    .from(pendingMembers)
    .where(and(eq(pendingMembers.userId, userId), eq(pendingMembers.tribeId, tribeId)))
    .limit(1);
  return existing.length > 0;
}

/**
 * Request to join a tribe — enforces reputation gates, account age gates,
 * and join mechanism rules.
 * 
 * Bot friction: new/bot accounts with low reputation cannot join gated tribes.
 */
export async function requestToJoinTribe(userId: string, tribeId: string, aliasName?: string, aliasAvatar?: string): Promise<'joined' | 'pending' | 'rejected' | 'already_member' | 'already_pending' | 'age_required' | 'region_blocked' | 'opt_in_required'> {
  const { users } = await import('@/db/schema');

  // 1. Load tribe and user
  const tribeRows = await db.select().from(tribes).where(eq(tribes.id, tribeId)).limit(1);
  const tribe = tribeRows[0];
  if (!tribe) throw new Error('Tribe not found');

  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) throw new Error('User not found');

  // 2. Check if already a member — return friendly status instead of throwing
  const existingMember = await db.select().from(tribeMembers)
    .where(and(eq(tribeMembers.userId, userId), eq(tribeMembers.tribeId, tribeId)))
    .limit(1);
  if (existingMember.length > 0) return 'already_member';

  // 3. Check if already pending — return friendly status instead of throwing
  const existingPending = await db.select().from(pendingMembers)
    .where(and(eq(pendingMembers.userId, userId), eq(pendingMembers.tribeId, tribeId)))
    .limit(1);
  if (existingPending.length > 0) return 'already_pending';

  // 4. GATE: Reputation check
  if (tribe.minimumReputation) {
    const userLevel = REPUTATION_HIERARCHY[user.reputationStatus ?? 'Onboarding'] ?? 0;
    const requiredLevel = REPUTATION_HIERARCHY[tribe.minimumReputation] ?? 0;
    if (userLevel < requiredLevel) {
      throw new Error(`This tribe requires ${tribe.minimumReputation} reputation status. Your current status is ${user.reputationStatus ?? 'Onboarding'}.`);
    }
  }

  // 5. GATE: Account age check
  if (tribe.minimumAccountAgeDays && tribe.minimumAccountAgeDays > 0) {
    const accountCreated = user.createdAt;
    if (accountCreated) {
      const accountAgeDays = Math.floor((Date.now() - accountCreated.getTime()) / (1000 * 60 * 60 * 24));
      if (accountAgeDays < tribe.minimumAccountAgeDays) {
        throw new Error(`This tribe requires accounts to be at least ${tribe.minimumAccountAgeDays} days old. Your account is ${accountAgeDays} days old.`);
      }
    }
  }

  // 5b. GATE: NSFW (issue #32). Returned as a status (not thrown) so the client can
  // react: geo-blocked region → 'region_blocked'; otherwise needs the web-set 18+
  // self-attest opt-in → 'opt_in_required'. Verified/opted-in users pass through.
  if (tribe.isNsfw) {
    const { resolveNsfwGate } = await import('@/lib/age-verification/nsfw-gate');
    const gate = await resolveNsfwGate({ isNsfw: true, userId });
    if (gate.decision === 'blocked') return 'region_blocked';
    if (gate.decision === 'needs_verify') return 'age_required';
    if (gate.decision === 'needs_optin') return 'opt_in_required';
  }

  // 6. GATE: Tribe member cap
  const { canAddTribeMember } = await import('@/lib/services/subscription-guard');
  const memberCheck = await canAddTribeMember(tribeId);
  if (!memberCheck.allowed) {
    throw new Error(`This tribe has reached its member limit (${memberCheck.limit}). The tribe owner needs to upgrade their plan.`);
  }

  // 7. GATE: Join mechanism
  if (tribe.joinMechanism === 'approval') {
    // Add to pending queue
    await db.insert(pendingMembers).values({
      id: `pm-${userId}-${tribeId}`,
      tribeId,
      userId,
      joinedAsAlias: aliasName || null,
      joinedAsAvatar: aliasAvatar || null,
      requestedAt: new Date(),
    });

    // Notify tribe admins about the join request (fire-and-forget)
    import('@/lib/services/realtime-dispatch').then(({ notifyTribeJoinRequest }) => {
      notifyTribeJoinRequest(tribeId, user?.name ?? 'Someone', tribe.name);
    }).catch(() => {});

    return 'pending';
  }

  // 7. Instant join
  await db.insert(tribeMembers).values({
    id: `tm-${userId}-${tribeId}`,
    tribeId,
    userId,
    role: 'member',
    joinedAsAlias: aliasName || null,
    joinedAsAvatar: aliasAvatar || null,
    joinedAt: new Date(),
  });

  // Increment member count
  await db.update(tribes).set({ 
    memberCount: sql`COALESCE(${tribes.memberCount}, 0) + 1` 
  }).where(eq(tribes.id, tribeId));

  // Auto-create follower bond
  const { createTribeBond } = await import('@/lib/services/bond-service');
  await createTribeBond(userId, tribeId, 'tribe', tribe.name);

  // WS-2: for a private tribe, nudge the key-holders to distribute the tribe key
  // to this new member immediately (instead of waiting for their polling cycle).
  if (!tribe.isPublic) {
    import('@/lib/services/realtime-dispatch').then(({ notifyTribeKeyGranters }) => {
      notifyTribeKeyGranters(tribeId);
    }).catch(() => {});
  }

  return 'joined';
}

/**
 * Directly joins a user to a tribe — no gates, no approval flow.
 * Used internally for system operations like auto-joining the welcome tribe.
 * Silently no-ops if the user is already a member.
 */
export async function joinTribeDirectly(userId: string, tribeId: string): Promise<void> {
  // Check if already a member — silently skip
  const existing = await db.select({ id: tribeMembers.id }).from(tribeMembers)
    .where(and(eq(tribeMembers.userId, userId), eq(tribeMembers.tribeId, tribeId)))
    .limit(1);
  if (existing.length > 0) return;

  // GATE: never create an unverified member of an NSFW tribe via this un-gated path
  // (issue #32). Even "system" auto-joins must not bypass 18+ verification. All
  // current callers are best-effort welcome-tribe auto-joins inside signup/OAuth
  // flows that don't catch age-gate sentinels — so SKIP rather than throw, or a
  // founder flagging the welcome tribe NSFW would break every new signup.
  const [tribeRow] = await db.select({ isNsfw: tribes.isNsfw }).from(tribes)
    .where(eq(tribes.id, tribeId)).limit(1);
  if (tribeRow?.isNsfw) {
    const { resolveNsfwGate } = await import('@/lib/age-verification/nsfw-gate');
    const gate = await resolveNsfwGate({ isNsfw: true, userId });
    if (gate.decision !== 'allow') {
      console.warn(`[joinTribeDirectly] skipped auto-join of NSFW tribe ${tribeId} for user ${userId}: ${gate.decision}`);
      return;
    }
  }

  await db.insert(tribeMembers).values({
    id: `tm-${userId}-${tribeId}`,
    tribeId,
    userId,
    role: 'member',
    joinedAt: new Date(),
  });

  // Increment member count
  await db.update(tribes).set({
    memberCount: sql`COALESCE(${tribes.memberCount}, 0) + 1`
  }).where(eq(tribes.id, tribeId));
}

/**
 * Updates a tribe member's identity (alias + avatar).
 * Allows switching between main profile and aliases post-join.
 */
export async function updateTribeMemberIdentity(
  userId: string,
  tribeId: string,
  aliasName?: string,
  aliasAvatar?: string,
): Promise<void> {
  // Verify the user is actually a member
  const [membership] = await db.select()
    .from(tribeMembers)
    .where(and(eq(tribeMembers.userId, userId), eq(tribeMembers.tribeId, tribeId)))
    .limit(1);

  if (!membership) {
    throw new Error('You are not a member of this tribe.');
  }

  await db.update(tribeMembers).set({
    joinedAsAlias: aliasName || null,
    joinedAsAvatar: aliasAvatar || null,
  }).where(eq(tribeMembers.id, membership.id));
}

// ============================================================
// TRIBE ANALYTICS
// ============================================================

export interface TribeAnalytics {
  memberGrowth: Array<{ date: string; members: number }>;
  topPosts: Array<{ name: string; vibes: number; comments: number }>;
  stats: {
    totalMembers: number;
    totalPosts: number;
    engagementRate: string; // e.g. "12.5%"
    engagementDelta: string; // e.g. "+2.1%"
    avgVibesPerPost: string; // e.g. "8.2"
    vibesDelta: string; // e.g. "+1.3"
  };
}

/**
 * Computes real analytics for a tribe from the database.
 * No zero-filling — only months with actual data are shown.
 */
export async function getTribeAnalytics(tribeId: string): Promise<TribeAnalytics> {
  const { posts } = await import('@/db/schema');

  // 1. Member Growth: count members joined per month (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const memberRows = await db.select({
    joinedAt: tribeMembers.joinedAt,
  }).from(tribeMembers)
    .where(and(
      eq(tribeMembers.tribeId, tribeId),
      gte(tribeMembers.joinedAt, sixMonthsAgo),
    ));

  // Group by month label
  const monthCounts: Record<string, number> = {};
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (const row of memberRows) {
    if (!row.joinedAt) continue;
    const d = new Date(row.joinedAt);
    const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
    monthCounts[key] = (monthCounts[key] ?? 0) + 1;
  }

  // Build cumulative growth from the base count
  const tribeRow = await db.select().from(tribes).where(eq(tribes.id, tribeId)).limit(1);
  const totalMembers = tribeRow[0]?.memberCount ?? 0;

  // Convert to sorted array (chronological)
  const monthEntries = Object.entries(monthCounts).sort((a, b) => {
    const parseKey = (k: string) => {
      const [mon, yr] = k.split(' ');
      return new Date(`${mon} 1 ${yr}`).getTime();
    };
    return parseKey(a[0]) - parseKey(b[0]);
  });

  // Build cumulative: work backwards from totalMembers
  let cumulative = totalMembers;
  const memberGrowth: Array<{ date: string; members: number }> = [];
  for (let i = monthEntries.length - 1; i >= 0; i--) {
    memberGrowth.unshift({ date: monthEntries[i]![0], members: cumulative });
    cumulative -= monthEntries[i]![1];
  }

  // 2. Top 5 Posts by engagement (vibes + comments)
  const topPostRows = await db.select({
    title: posts.title,
    vibeCount: posts.vibeCount,
    commentCount: posts.commentCount,
  }).from(posts)
    .where(eq(posts.tribeId, tribeId))
    .orderBy(desc(sql`${posts.vibeCount} + ${posts.commentCount}`))
    .limit(5);

  const topPosts = topPostRows.map((p, i) => ({
    name: p.title ? (p.title.length > 25 ? p.title.substring(0, 25) + '…' : p.title) : `Post ${i + 1}`,
    vibes: p.vibeCount ?? 0,
    comments: p.commentCount ?? 0,
  }));

  // 3. Key Stats with 30-day deltas
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  // Total posts in this tribe
  const [postCountResult] = await db.select({ count: count() }).from(posts)
    .where(eq(posts.tribeId, tribeId));
  const totalPosts = postCountResult?.count ?? 0;

  // Posts in last 30 days
  const [recent30] = await db.select({
    count: count(),
    vibes: sql<number>`COALESCE(SUM(${posts.vibeCount}), 0)`,
    comments: sql<number>`COALESCE(SUM(${posts.commentCount}), 0)`,
  }).from(posts)
    .where(and(eq(posts.tribeId, tribeId), gte(posts.createdAt, thirtyDaysAgo)));

  // Posts in prior 30 days (30-60 days ago)
  const [prior30] = await db.select({
    count: count(),
    vibes: sql<number>`COALESCE(SUM(${posts.vibeCount}), 0)`,
    comments: sql<number>`COALESCE(SUM(${posts.commentCount}), 0)`,
  }).from(posts)
    .where(and(
      eq(posts.tribeId, tribeId),
      gte(posts.createdAt, sixtyDaysAgo),
      sql`${posts.createdAt} < ${thirtyDaysAgo}`,
    ));

  const recentPosts = recent30?.count ?? 0;
  const recentVibes = Number(recent30?.vibes ?? 0);
  const recentComments = Number(recent30?.comments ?? 0);
  const priorPosts = prior30?.count ?? 0;
  const priorVibes = Number(prior30?.vibes ?? 0);

  // Engagement rate: (vibes + comments) / posts
  const engagementRate = recentPosts > 0
    ? ((recentVibes + recentComments) / recentPosts * 100).toFixed(1)
    : '0.0';
  const priorEngagement = priorPosts > 0
    ? ((priorVibes + Number(prior30?.comments ?? 0)) / priorPosts * 100)
    : 0;
  const engagementDelta = priorEngagement > 0
    ? `${(parseFloat(engagementRate) - priorEngagement) > 0 ? '+' : ''}${(parseFloat(engagementRate) - priorEngagement).toFixed(1)}%`
    : 'N/A';

  // Avg vibes per post
  const avgVibes = recentPosts > 0 ? (recentVibes / recentPosts).toFixed(1) : '0.0';
  const priorAvgVibes = priorPosts > 0 ? priorVibes / priorPosts : 0;
  const vibesDelta = priorAvgVibes > 0
    ? `${(parseFloat(avgVibes) - priorAvgVibes) > 0 ? '+' : ''}${(parseFloat(avgVibes) - priorAvgVibes).toFixed(1)}`
    : 'N/A';

  return {
    memberGrowth,
    topPosts,
    stats: {
      totalMembers,
      totalPosts,
      engagementRate: `${engagementRate}%`,
      engagementDelta,
      avgVibesPerPost: avgVibes,
      vibesDelta,
    },
  };
}

// ============================================================
// ADVANCED TRIBE ANALYTICS (Phase 4C — Org Pro+)
// ============================================================

export interface AdvancedTribeAnalytics {
  /** Posts per day-of-week (0=Sun..6=Sat), for activity heatmap */
  activityByDayOfWeek: Array<{ day: string; posts: number; vibes: number }>;
  /** Posts per hour-of-day (0..23), for time-of-day chart */
  activityByHour: Array<{ hour: number; posts: number }>;
  /** Top 10 contributors by post count */
  topContributors: Array<{ name: string; userId: string; posts: number; vibes: number }>;
  /** Retention: members active in last 30d vs total members */
  retention: { activeMembers: number; totalMembers: number; retentionRate: string };
  /** Content mix: posts with images vs text-only */
  contentMix: { withImage: number; textOnly: number };
}

export async function getAdvancedTribeAnalytics(tribeId: string): Promise<AdvancedTribeAnalytics> {
  const { posts, users: usersTable } = await import('@/db/schema');

  // All posts for this tribe
  const allPosts = await db.select({
    authorId: posts.authorId,
    vibeCount: posts.vibeCount,
    createdAt: posts.createdAt,
    imageUrl: posts.imageUrl,
  }).from(posts).where(eq(posts.tribeId, tribeId));

  // Activity by day of week
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayStats = dayNames.map(d => ({ day: d, posts: 0, vibes: 0 }));
  const hourStats = Array.from({ length: 24 }, (_, h) => ({ hour: h, posts: 0 }));

  for (const p of allPosts) {
    if (p.createdAt) {
      const d = new Date(p.createdAt);
      dayStats[d.getDay()]!.posts++;
      dayStats[d.getDay()]!.vibes += (p.vibeCount ?? 0);
      hourStats[d.getHours()]!.posts++;
    }
  }

  // Top contributors
  const authorCounts: Record<string, { posts: number; vibes: number }> = {};
  for (const p of allPosts) {
    if (!authorCounts[p.authorId]) authorCounts[p.authorId] = { posts: 0, vibes: 0 };
    authorCounts[p.authorId]!.posts++;
    authorCounts[p.authorId]!.vibes += (p.vibeCount ?? 0);
  }
  const topAuthorIds = Object.entries(authorCounts)
    .sort((a, b) => b[1].posts - a[1].posts)
    .slice(0, 10);

  const topContributors = await Promise.all(
    topAuthorIds.map(async ([userId, stats]) => {
      const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      return { name: u?.name ?? 'Unknown', userId, posts: stats.posts, vibes: stats.vibes };
    })
  );

  // Retention: members who posted in last 30d
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const activeAuthors = new Set(
    allPosts.filter(p => p.createdAt && new Date(p.createdAt) >= thirtyDaysAgo).map(p => p.authorId)
  );

  const tribeRow = await db.select().from(tribes).where(eq(tribes.id, tribeId)).limit(1);
  const totalMembers = tribeRow[0]?.memberCount ?? 0;
  const activeMembers = activeAuthors.size;
  const retentionRate = totalMembers > 0 ? ((activeMembers / totalMembers) * 100).toFixed(1) : '0.0';

  // Content mix
  const withImage = allPosts.filter(p => !!p.imageUrl).length;
  const textOnly = allPosts.length - withImage;

  return {
    activityByDayOfWeek: dayStats,
    activityByHour: hourStats,
    topContributors,
    retention: { activeMembers, totalMembers, retentionRate: `${retentionRate}%` },
    contentMix: { withImage, textOnly },
  };
}
