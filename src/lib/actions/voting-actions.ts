'use server';

import { requireAuth, requireVerifiedEmail, getCurrentUserId } from './shared';
import type { Proposal } from '@/lib/services/voting-service';

// ======== READ ========

/**
 * Check if the current user can create proposals.
 * Returns true for admins and tribe founders.
 */
export async function checkCanCreateProposal(): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const { db } = await import('@/db');
  const { users, tribes } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');

  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (user?.role === 'Admin') return true;

  const [founderRow] = await db.select({ id: tribes.id })
    .from(tribes)
    .where(eq(tribes.createdBy, userId))
    .limit(1);
  return !!founderRow;
}

export async function getProposals(options?: {
  tribeId?: string | null;
  status?: 'active' | 'closed' | 'canceled';
}): Promise<Proposal[]> {
  const userId = await getCurrentUserId();
  const { getProposals: fn } = await import('@/lib/services/voting-service');
  return fn({ ...options, currentUserId: userId ?? undefined });
}

export async function getProposalById(proposalId: string): Promise<Proposal | null> {
  const userId = await getCurrentUserId();
  const { getProposalById: fn } = await import('@/lib/services/voting-service');
  return fn(proposalId, userId ?? undefined);
}

export async function getActiveProposalCount(): Promise<number> {
  const { db } = await import('@/db');
  const { proposals } = await import('@/db/schema');
  const { eq, and, gt, count } = await import('drizzle-orm');

  const [row] = await db.select({ count: count() })
    .from(proposals)
    .where(and(
      eq(proposals.status, 'active'),
      gt(proposals.deadline, new Date())
    ));
  return row?.count ?? 0;
}


// ======== MUTATIONS ========

export async function createProposal(payload: {
  title: string;
  description: string;
  tribeId?: string | null;
  deadlineDays: number; // Days from now
  options: string[];
}): Promise<Proposal> {
  const userId = await requireVerifiedEmail();

  // Platform-wide proposals: admin OR any tribe founder
  if (!payload.tribeId) {
    const { db } = await import('@/db');
    const { users, tribes } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    const isAdmin = user?.role === 'Admin';

    // Check if user has founded at least one tribe
    const [founderRow] = await db.select({ id: tribes.id })
      .from(tribes)
      .where(eq(tribes.createdBy, userId))
      .limit(1);
    const isFounder = !!founderRow;

    if (!isAdmin && !isFounder) {
      throw new Error('Only platform admins and tribe founders can create proposals.');
    }
  } else {
    // Tribe-scoped: check that user is founder or speaker
    const { requireTribeSpeaker } = await import('@/lib/services/tribe-auth');
    await requireTribeSpeaker(userId, payload.tribeId);
  }

  const deadline = new Date();
  deadline.setDate(deadline.getDate() + payload.deadlineDays);

  const { createProposal: fn } = await import('@/lib/services/voting-service');
  const result = await fn({
    title: payload.title,
    description: payload.description,
    createdBy: userId,
    tribeId: payload.tribeId ?? null,
    deadline,
    options: payload.options,
  });

  // If a non-admin founder created this, notify all admins (fire-and-forget)
  if (!payload.tribeId) {
    const { db: dbInner } = await import('@/db');
    const { users: usersTable } = await import('@/db/schema');
    const { eq: eqOp } = await import('drizzle-orm');
    const [creator] = await dbInner.select({ role: usersTable.role, name: usersTable.name })
      .from(usersTable).where(eqOp(usersTable.id, userId)).limit(1);

    if (creator?.role !== 'Admin') {
      // Find all admins
      const admins = await dbInner.select({ id: usersTable.id })
        .from(usersTable)
        .where(eqOp(usersTable.role, 'Admin'));
      const adminIds = admins.map(a => a.id);

      if (adminIds.length > 0) {
        import('@/lib/services/push-service').then(({ sendPushToMultiple }) => {
          sendPushToMultiple(adminIds, {
            title: '🏛️ New Proposal Submitted',
            body: `${creator?.name ?? 'A tribe founder'} submitted a new proposal: "${payload.title}"`,
            url: `/voting`,
            tag: 'governance-new-proposal',
          }).catch(() => {});
        }).catch(() => {});
      }
    }
  }

  return result;
}

export async function castVote(proposalId: string, optionId: string): Promise<void> {
  const userId = await requireAuth();

  // Feature gate: require coop_voting feature from a PAID subscription
  // Earned memberships do NOT grant voting rights — you must pay to govern.
  // Admins always bypass this check.
  const { db } = await import('@/db');
  const { subscriptions, users: usersTable } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const [currentUser] = await db.select({ role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const isAdmin = currentUser?.role === 'Admin';

  if (!isAdmin) {
    const { hasFeature } = await import('@/lib/services/subscription-guard');
    if (!(await hasFeature(userId, 'coop_voting'))) {
      throw new Error('Voting requires a paid Co-Op membership. Upgrade your plan to participate.');
    }
  }

  // Verify subscription source is 'paid' or 'founding' (not 'earned') — admins skip this too
  if (!isAdmin) {
    const [sub] = await db.select({ source: subscriptions.source })
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
      .limit(1);
    if (sub?.source === 'earned') {
      throw new Error('Earned memberships do not include voting rights. Upgrade to a paid plan to participate in governance.');
    }
  }

  // ── Future requirements (re-enable once platform matures) ──
  // Account age check: must be 30+ days old
  // const [user] = await db.select({
  //   createdAt: users.createdAt,
  //   reputationStatus: users.reputationStatus,
  // }).from(users).where(eq(users.id, userId)).limit(1);
  //
  // if (user?.createdAt) {
  //   const thirtyDaysAgo = new Date();
  //   thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  //   if (user.createdAt > thirtyDaysAgo) {
  //     throw new Error('Your account must be at least 30 days old to vote.');
  //   }
  // }
  //
  // Reputation check: must be Trusted or higher
  // const { meetsReputationGate } = await import('@/lib/constants');
  // if (!meetsReputationGate(user?.reputationStatus, 'Trusted')) {
  //   throw new Error('You must have Trusted reputation or higher to vote. Keep contributing to the community!');
  // }

  const { castVote: fn } = await import('@/lib/services/voting-service');
  return fn(proposalId, optionId, userId);
}

export async function closeProposal(proposalId: string): Promise<void> {
  const userId = await requireAuth();

  // Verify the user is the proposal creator or admin
  const { getProposalById: get } = await import('@/lib/services/voting-service');
  const proposal = await get(proposalId);
  if (!proposal) throw new Error('Proposal not found');

  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);

  if (proposal.createdBy !== userId && user?.role !== 'Admin') {
    throw new Error('Only the proposal creator or an admin can close a proposal.');
  }

  const { closeProposal: fn } = await import('@/lib/services/voting-service');
  return fn(proposalId);
}

export async function cancelProposal(proposalId: string): Promise<void> {
  const userId = await requireAuth();

  const { getProposalById: get } = await import('@/lib/services/voting-service');
  const proposal = await get(proposalId);
  if (!proposal) throw new Error('Proposal not found');

  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);

  if (proposal.createdBy !== userId && user?.role !== 'Admin') {
    throw new Error('Only the proposal creator or an admin can cancel a proposal.');
  }

  const { cancelProposal: fn } = await import('@/lib/services/voting-service');
  return fn(proposalId);
}

// ======== PROPOSAL COMMENTS ========

export interface ProposalCommentData {
  id: string;
  proposalId: string;
  parentCommentId: string | null;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  authorAvatarFallback: string;
  content: string;
  createdAt: Date;
  reactions: { thumbsUp: number; fist: number; thumbsDown: number };
  userReaction: string | null; // '👍' | '😐' | '👎' | null
  replies: ProposalCommentData[];
}

const ALLOWED_REACTIONS = ['👍', '😐', '👎'] as const;

export async function getProposalComments(proposalId: string): Promise<ProposalCommentData[]> {
  const userId = await getCurrentUserId();
  const { db } = await import('@/db');
  const { proposalComments, proposalCommentReactions } = await import('@/db/schema');
  const { eq, asc } = await import('drizzle-orm');

  // Fetch all comments for this proposal
  const rows = await db.select().from(proposalComments)
    .where(eq(proposalComments.proposalId, proposalId))
    .orderBy(asc(proposalComments.createdAt));

  // Fetch all reactions for these comment IDs
  const commentIds = rows.map(r => r.id);
  let allReactions: { id: string; commentId: string; userId: string; reaction: string }[] = [];
  if (commentIds.length > 0) {
    const { inArray } = await import('drizzle-orm');
    allReactions = await db.select({
      id: proposalCommentReactions.id,
      commentId: proposalCommentReactions.commentId,
      userId: proposalCommentReactions.userId,
      reaction: proposalCommentReactions.reaction,
    }).from(proposalCommentReactions)
      .where(inArray(proposalCommentReactions.commentId, commentIds));
  }

  // Build reaction maps
  const reactionsByComment = new Map<string, typeof allReactions>();
  for (const r of allReactions) {
    const arr = reactionsByComment.get(r.commentId) || [];
    arr.push(r);
    reactionsByComment.set(r.commentId, arr);
  }

  // Map rows to comment data
  const commentMap = new Map<string, ProposalCommentData>();
  const rootComments: ProposalCommentData[] = [];

  for (const row of rows) {
    const rxns = reactionsByComment.get(row.id) || [];
    const comment: ProposalCommentData = {
      id: row.id,
      proposalId: row.proposalId,
      parentCommentId: row.parentCommentId,
      authorId: row.authorId,
      authorName: row.authorName,
      authorAvatar: row.authorAvatar,
      authorAvatarFallback: row.authorAvatarFallback,
      content: row.content,
      createdAt: row.createdAt ?? new Date(),
      reactions: {
        thumbsUp: rxns.filter(r => r.reaction === '👍').length,
        fist: rxns.filter(r => r.reaction === '😐').length,
        thumbsDown: rxns.filter(r => r.reaction === '👎').length,
      },
      userReaction: userId ? rxns.find(r => r.userId === userId)?.reaction ?? null : null,
      replies: [],
    };
    commentMap.set(row.id, comment);
  }

  // Build tree
  for (const comment of commentMap.values()) {
    if (comment.parentCommentId && commentMap.has(comment.parentCommentId)) {
      commentMap.get(comment.parentCommentId)!.replies.push(comment);
    } else {
      rootComments.push(comment);
    }
  }

  return rootComments;
}

export async function createProposalComment(payload: {
  proposalId: string;
  content: string;
  parentCommentId?: string | null;
}): Promise<ProposalCommentData> {
  const userId = await requireAuth();

  if (!payload.content.trim()) throw new Error('Comment cannot be empty.');
  if (payload.content.length > 5000) throw new Error('Comment is too long (max 5000 characters).');

  const { db } = await import('@/db');
  const { proposalComments, users, proposals } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');

  // Verify proposal exists
  const [proposal] = await db.select({ id: proposals.id }).from(proposals)
    .where(eq(proposals.id, payload.proposalId)).limit(1);
  if (!proposal) throw new Error('Proposal not found.');

  // Get author info
  const [author] = await db.select({
    name: users.name,
    avatar: users.avatar,
  }).from(users).where(eq(users.id, userId)).limit(1);

  const id = `pc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fallback = (author?.name ?? '??').slice(0, 2).toUpperCase();

  await db.insert(proposalComments).values({
    id,
    proposalId: payload.proposalId,
    parentCommentId: payload.parentCommentId ?? null,
    authorId: userId,
    authorName: author?.name ?? 'Unknown',
    authorAvatar: author?.avatar ?? null,
    authorAvatarFallback: fallback,
    content: payload.content.trim(),
    createdAt: new Date(),
  });

  return {
    id,
    proposalId: payload.proposalId,
    parentCommentId: payload.parentCommentId ?? null,
    authorId: userId,
    authorName: author?.name ?? 'Unknown',
    authorAvatar: author?.avatar ?? null,
    authorAvatarFallback: fallback,
    content: payload.content.trim(),
    createdAt: new Date(),
    reactions: { thumbsUp: 0, fist: 0, thumbsDown: 0 },
    userReaction: null,
    replies: [],
  };
}

export async function toggleProposalCommentReaction(
  commentId: string,
  reaction: string,
): Promise<{ toggled: boolean; reactions: { thumbsUp: number; fist: number; thumbsDown: number } }> {
  const userId = await requireAuth();

  if (!ALLOWED_REACTIONS.includes(reaction as typeof ALLOWED_REACTIONS[number])) {
    throw new Error('Invalid reaction. Must be 👍, 😐, or 👎.');
  }

  const { db } = await import('@/db');
  const { proposalCommentReactions } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  // Check if user already reacted on this comment
  const [existing] = await db.select()
    .from(proposalCommentReactions)
    .where(and(
      eq(proposalCommentReactions.commentId, commentId),
      eq(proposalCommentReactions.userId, userId),
    ))
    .limit(1);

  if (existing) {
    if (existing.reaction === reaction) {
      // Same reaction — remove it (toggle off)
      await db.delete(proposalCommentReactions).where(eq(proposalCommentReactions.id, existing.id));
    } else {
      // Different reaction — update to the new one
      await db.update(proposalCommentReactions)
        .set({ reaction })
        .where(eq(proposalCommentReactions.id, existing.id));
    }
  } else {
    // No existing — insert new reaction
    const id = `pcr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(proposalCommentReactions).values({
      id,
      commentId,
      userId,
      reaction,
      createdAt: new Date(),
    });
  }

  // Return updated counts
  const allRxns = await db.select({ reaction: proposalCommentReactions.reaction })
    .from(proposalCommentReactions)
    .where(eq(proposalCommentReactions.commentId, commentId));

  const [userRxn] = await db.select({ reaction: proposalCommentReactions.reaction })
    .from(proposalCommentReactions)
    .where(and(
      eq(proposalCommentReactions.commentId, commentId),
      eq(proposalCommentReactions.userId, userId),
    ))
    .limit(1);

  return {
    toggled: !!userRxn,
    reactions: {
      thumbsUp: allRxns.filter(r => r.reaction === '👍').length,
      fist: allRxns.filter(r => r.reaction === '😐').length,
      thumbsDown: allRxns.filter(r => r.reaction === '👎').length,
    },
  };
}

export async function deleteProposalComment(commentId: string): Promise<void> {
  const userId = await requireAuth();

  const { db } = await import('@/db');
  const { proposalComments, users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');

  const [comment] = await db.select({ authorId: proposalComments.authorId })
    .from(proposalComments)
    .where(eq(proposalComments.id, commentId))
    .limit(1);
  if (!comment) throw new Error('Comment not found.');

  // Author or admin can delete
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (comment.authorId !== userId && user?.role !== 'Admin') {
    throw new Error('You can only delete your own comments.');
  }

  await db.delete(proposalComments).where(eq(proposalComments.id, commentId));
}
