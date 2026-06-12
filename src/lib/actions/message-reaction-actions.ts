'use server';

/**
 * Server actions for emoji reactions on bond messages.
 * One reaction per user per message — tapping the same emoji toggles it
 * off, tapping a different emoji swaps it (same pattern as proposal
 * comment reactions).
 */

import { requireAuth } from './shared';

export interface MessageReactionSummary {
  emoji: string;
  count: number;
  userReacted: boolean;
}

/**
 * Validates that a reaction string is composed only of emoji codepoints —
 * one or more pictographs / regional-indicator pairs, plus the usual
 * modifiers (skin tones, ZWJ, variation selector, keycap). Rejects plain
 * text, digits, and whitespace so reactions can't be used to store arbitrary
 * strings that render as pills to the peer.
 */
function isValidReaction(s: string): boolean {
  // Must contain at least one actual emoji (pictograph or regional indicator)
  if (!/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]/u.test(s)) return false;
  // After removing every emoji-related codepoint, nothing else may remain
  const residue = s.replace(
    /\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}]|[\u{1F1E6}-\u{1F1FF}]|[\u200d\ufe0f\u20e3]/gu,
    '',
  );
  return residue.trim().length === 0;
}

/**
 * Verifies the user is a participant in the bond the message belongs to.
 * Returns the message's bondId, or throws if access is denied.
 */
async function assertMessageAccess(messageId: string, userId: string): Promise<void> {
  const { db } = await import('@/db');
  const { messages, bonds } = await import('@/db/schema');
  const { eq, or, and } = await import('drizzle-orm');

  const [msg] = await db.select({ bondId: messages.bondId })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  if (!msg) throw new Error('Message not found.');

  // The message is stored under one side's bond row — the user is a
  // participant if they own that bond or are its target.
  const [bond] = await db.select({ id: bonds.id })
    .from(bonds)
    .where(and(
      eq(bonds.id, msg.bondId),
      or(eq(bonds.userId, userId), eq(bonds.targetId, userId)),
    ))
    .limit(1);
  if (!bond) throw new Error('Not a member of this bond.');
}

export async function toggleReaction(
  messageId: string,
  emoji: string,
): Promise<{ reactions: MessageReactionSummary[] }> {
  const userId = await requireAuth();

  const trimmed = emoji?.trim();
  // 32 chars covers complex multi-codepoint emoji (e.g. family emoji = 11 JS chars)
  if (!trimmed || trimmed.length > 32 || !isValidReaction(trimmed)) {
    throw new Error('Invalid reaction emoji.');
  }

  await assertMessageAccess(messageId, userId);

  const { db } = await import('@/db');
  const { messageReactions } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const [existing] = await db.select()
    .from(messageReactions)
    .where(and(
      eq(messageReactions.messageId, messageId),
      eq(messageReactions.userId, userId),
    ))
    .limit(1);

  if (existing) {
    if (existing.emoji === trimmed) {
      // Same emoji — remove it (toggle off)
      await db.delete(messageReactions).where(eq(messageReactions.id, existing.id));
    } else {
      // Different emoji — swap to the new one
      await db.update(messageReactions)
        .set({ emoji: trimmed })
        .where(eq(messageReactions.id, existing.id));
    }
  } else {
    const id = `mrx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(messageReactions).values({
      id,
      messageId,
      userId,
      emoji: trimmed,
      createdAt: new Date(),
    });
  }

  const all = await getReactionsForMessages([messageId]);
  return { reactions: all[messageId] ?? [] };
}

/**
 * Batch-fetches reactions for a set of messages, grouped per message.
 * Returns { [messageId]: [{ emoji, count, userReacted }] }.
 *
 * Only returns reactions for messages that the current user actually has
 * access to (i.e. belong to bonds where they are userId or targetId).
 * This prevents an authenticated user from probing reaction data for
 * arbitrary message IDs they may have guessed.
 */
export async function getReactionsForMessages(
  messageIds: string[],
): Promise<Record<string, MessageReactionSummary[]>> {
  const userId = await requireAuth();
  if (messageIds.length === 0) return {};

  const { db } = await import('@/db');
  const { messageReactions, messages, bonds } = await import('@/db/schema');
  const { inArray, eq, or, and } = await import('drizzle-orm');

  const capped = messageIds.slice(0, 200);

  // Only include messages the user has access to:
  // the message's bondId must be a bond where userId or targetId = current user.
  const accessibleMessages = await db.select({ id: messages.id })
    .from(messages)
    .innerJoin(bonds, and(
      eq(bonds.id, messages.bondId),
      or(eq(bonds.userId, userId), eq(bonds.targetId, userId)),
    ))
    .where(inArray(messages.id, capped));

  const accessibleIds = accessibleMessages.map(m => m.id);
  if (accessibleIds.length === 0) return {};

  const rows = await db.select({
    messageId: messageReactions.messageId,
    userId: messageReactions.userId,
    emoji: messageReactions.emoji,
  }).from(messageReactions)
    .where(inArray(messageReactions.messageId, accessibleIds));

  const grouped: Record<string, MessageReactionSummary[]> = {};
  for (const row of rows) {
    const list = grouped[row.messageId] ?? (grouped[row.messageId] = []);
    let entry = list.find(r => r.emoji === row.emoji);
    if (!entry) {
      entry = { emoji: row.emoji, count: 0, userReacted: false };
      list.push(entry);
    }
    entry.count++;
    if (row.userId === userId) entry.userReacted = true;
  }
  return grouped;
}
