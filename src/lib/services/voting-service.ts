/**
 * @fileoverview Co-Op Voting service.
 * Phase 4A: Enables paid members to participate in platform governance
 * through proposals and voting.
 *
 * Rules:
 *   - Only admins can create platform-wide proposals
 *   - Tribe founders/speakers can create tribe-scoped proposals
 *   - Voting requires `coop_voting` feature flag (paid members only)
 *   - One vote per user per proposal (enforced at DB + service level)
 *   - Proposals auto-close after deadline
 *   - Each proposal has "Support" / "Oppose" options (binary up/down)
 *   - Creator flair: platform role (Admin) and tribe-founder status are exposed
 */

import { db } from '@/db';
import { proposals, proposalOptions, votes, users, tribes } from '@/db/schema';
import { eq, and, desc, count, sql, lte } from 'drizzle-orm';

// ── Types ──

export interface Proposal {
  id: string;
  title: string;
  description: string;
  createdBy: string;
  creatorName: string;
  creatorAvatar?: string | null;
  creatorRole: string;          // Platform role — 'Admin', 'Human_Paid', etc.
  creatorIsFounder: boolean;    // True if this user has founded at least one tribe
  status: 'active' | 'closed' | 'canceled';
  tribeId: string | null;
  deadline: Date;
  voteCount: number;
  createdAt: Date;
  options: ProposalOption[];
  userVoteOptionId?: string | null; // Which option the current user voted for
  slug?: string;
}

export interface ProposalOption {
  id: string;
  label: string;
  voteCount: number;
  percentage: number; // 0-100
}

// ── Create Proposal ──

export async function createProposal(payload: {
  title: string;
  description: string;
  createdBy: string;
  tribeId?: string | null;
  deadline: Date;
  options: string[]; // Labels for each option
}): Promise<Proposal> {
  if (payload.options.length < 2) {
    throw new Error('A proposal must have at least 2 options.');
  }
  if (payload.options.length > 10) {
    throw new Error('A proposal can have at most 10 options.');
  }
  if (payload.deadline <= new Date()) {
    throw new Error('Deadline must be in the future.');
  }

  const id = `prop-${Date.now()}`;

  // Generate unique slug
  const { slugify, generateUniqueSlug } = await import('@/lib/utils/slugify');
  const baseSlug = slugify(payload.title) || 'proposal';
  const uniqueSlug = await generateUniqueSlug(baseSlug, async (candidate) => {
    const existing = await db.select({ id: proposals.id }).from(proposals).where(eq(proposals.slug, candidate)).limit(1);
    return existing.length > 0;
  });

  await db.insert(proposals).values({
    id,
    title: payload.title,
    description: payload.description,
    createdBy: payload.createdBy,
    tribeId: payload.tribeId ?? null,
    deadline: payload.deadline,
    status: 'active',
    voteCount: 0,
    createdAt: new Date(),
    slug: uniqueSlug,
  });

  // Insert options
  for (let i = 0; i < payload.options.length; i++) {
    await db.insert(proposalOptions).values({
      id: `opt-${id}-${i}`,
      proposalId: id,
      label: payload.options[i]!,
      voteCount: 0,
      sortOrder: i,
    });
  }

  return getProposalById(id, payload.createdBy) as Promise<Proposal>;
}

// ── Cast Vote ──

export async function castVote(proposalId: string, optionId: string, userId: string): Promise<void> {
  // 1. Check proposal exists and is active
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!proposal) throw new Error('Proposal not found');
  if (proposal.status !== 'active') throw new Error('This proposal is no longer accepting votes.');
  if (proposal.deadline && proposal.deadline < new Date()) {
    // Auto-close if past deadline
    await db.update(proposals).set({ status: 'closed' }).where(eq(proposals.id, proposalId));
    throw new Error('This proposal has passed its deadline.');
  }

  // 2. Check option belongs to this proposal
  const [option] = await db.select().from(proposalOptions)
    .where(and(eq(proposalOptions.id, optionId), eq(proposalOptions.proposalId, proposalId)))
    .limit(1);
  if (!option) throw new Error('Invalid option for this proposal.');

  // 3. Check if user already voted
  const [existing] = await db.select().from(votes)
    .where(and(eq(votes.proposalId, proposalId), eq(votes.userId, userId)))
    .limit(1);
  if (existing) throw new Error('You have already voted on this proposal.');

  // 4. Record vote
  await db.insert(votes).values({
    id: `vote-${userId}-${proposalId}`,
    proposalId,
    optionId,
    userId,
    createdAt: new Date(),
  });

  // 5. Increment counters
  await db.update(proposalOptions).set({
    voteCount: sql`${proposalOptions.voteCount} + 1`,
  }).where(eq(proposalOptions.id, optionId));

  await db.update(proposals).set({
    voteCount: sql`${proposals.voteCount} + 1`,
  }).where(eq(proposals.id, proposalId));
}

// ── Close Proposal ──

export async function closeProposal(proposalId: string): Promise<void> {
  await db.update(proposals).set({ status: 'closed' }).where(eq(proposals.id, proposalId));
}

export async function cancelProposal(proposalId: string): Promise<void> {
  await db.update(proposals).set({ status: 'canceled' }).where(eq(proposals.id, proposalId));
}

// ── Read Operations ──

/**
 * Auto-closes any proposals past their deadline.
 */
async function autoCloseExpired(): Promise<void> {
  await db.update(proposals).set({ status: 'closed' }).where(
    and(eq(proposals.status, 'active'), lte(proposals.deadline, new Date()))
  );
}

export async function getProposals(options?: {
  tribeId?: string | null;
  status?: 'active' | 'closed' | 'canceled';
  currentUserId?: string;
}): Promise<Proposal[]> {
  await autoCloseExpired();

  let query = db.select().from(proposals).orderBy(desc(proposals.createdAt));

  const rows = await query;

  // Filter in JS for optional tribeId/status (SQLite doesn't support dynamic WHERE well with Drizzle)
  let filtered = rows;
  if (options?.tribeId !== undefined) {
    filtered = filtered.filter(r => r.tribeId === options.tribeId);
  }
  if (options?.status) {
    filtered = filtered.filter(r => r.status === options.status);
  }

  return Promise.all(filtered.map(r => hydrateProposal(r, options?.currentUserId)));
}

export async function getProposalById(proposalId: string, currentUserId?: string): Promise<Proposal | null> {
  await autoCloseExpired();
  const [row] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!row) return null;
  return hydrateProposal(row, currentUserId);
}

/**
 * Checks whether a user has founded at least one tribe.
 */
async function isUserTribeFounder(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: tribes.id })
    .from(tribes)
    .where(eq(tribes.createdBy, userId))
    .limit(1);
  return !!row;
}

async function hydrateProposal(
  row: typeof proposals.$inferSelect,
  currentUserId?: string,
): Promise<Proposal> {
  // Get creator details (name, role, avatar)
  const [creator] = await db.select({
    name: users.name,
    role: users.role,
    avatar: users.avatar,
  }).from(users).where(eq(users.id, row.createdBy)).limit(1);

  // Check if creator is a tribe founder
  const creatorIsFounder = await isUserTribeFounder(row.createdBy);

  // Get options
  const optRows = await db.select().from(proposalOptions)
    .where(eq(proposalOptions.proposalId, row.id))
    .orderBy(proposalOptions.sortOrder);

  const totalVotes = row.voteCount ?? 0;
  const opts: ProposalOption[] = optRows.map(o => ({
    id: o.id,
    label: o.label,
    voteCount: o.voteCount ?? 0,
    percentage: totalVotes > 0 ? Math.round(((o.voteCount ?? 0) / totalVotes) * 100) : 0,
  }));

  // Get user's vote if applicable
  let userVoteOptionId: string | null = null;
  if (currentUserId) {
    const [userVote] = await db.select({ optionId: votes.optionId }).from(votes)
      .where(and(eq(votes.proposalId, row.id), eq(votes.userId, currentUserId)))
      .limit(1);
    userVoteOptionId = userVote?.optionId ?? null;
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    createdBy: row.createdBy,
    creatorName: creator?.name ?? 'Unknown',
    creatorAvatar: creator?.avatar ?? null,
    creatorRole: creator?.role ?? 'Human_Free',
    creatorIsFounder,
    status: row.status as Proposal['status'],
    tribeId: row.tribeId,
    deadline: row.deadline,
    voteCount: totalVotes,
    createdAt: row.createdAt ?? new Date(),
    options: opts,
    userVoteOptionId,
    slug: row.slug ?? undefined,
  };
}
