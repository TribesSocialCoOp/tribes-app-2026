/**
 * @fileoverview Message service for E2E encrypted bond messaging.
 * Phase P3: Messages are stored as ciphertext — encryption/decryption
 * happens client-side using the shared ECDH secret.
 *
 * IMPORTANT: Each user has their OWN bond row with a unique ID.
 * Messages must be queryable by BOTH users, so we resolve both
 * bond IDs (ours + peer's) and query across both.
 */

import { db } from '@/db';
import { messages, bonds } from '@/db/schema';
import { eq, and, or, desc, lt, isNull, ne, sql } from 'drizzle-orm';

export interface MessageRow {
  id: string;
  bondId: string;
  senderId: string;
  ciphertext: Buffer | null;
  plaintext: string | null;
  attachmentFileId: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
  attachmentSize: number | null;
  attachmentEncryptionMeta: string | null;
  sentAt: Date | null;
  readAt: Date | null;
}

export interface AttachmentData {
  fileId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  encryptionMeta: string; // JSON-encoded EncryptionMeta
}

/**
 * Resolves both bond IDs for a conversation.
 * Each user has their own bond row — we need both IDs to see all messages.
 *
 * Returns [myBondId, peerBondId] or [myBondId, null] if no peer bond found.
 */
async function resolveBondPair(
  bondId: string,
  userId: string,
): Promise<[string, string | null]> {
  // Look up my bond to get the target user
  const [myBond] = await db.select({
    targetId: bonds.targetId,
    targetType: bonds.targetType,
  }).from(bonds)
    .where(and(eq(bonds.id, bondId), eq(bonds.userId, userId)))
    .limit(1);

  if (!myBond) throw new Error('Not a member of this bond');

  // For user-to-user bonds, find the peer's bond row
  if (myBond.targetType === 'user') {
    const [peerBond] = await db.select({ id: bonds.id })
      .from(bonds)
      .where(and(eq(bonds.userId, myBond.targetId), eq(bonds.targetId, userId)))
      .limit(1);
    return [bondId, peerBond?.id ?? null];
  }

  return [bondId, null];
}

/**
 * Creates a WHERE clause that matches messages from either bond ID.
 */
function bondIdFilter(myBondId: string, peerBondId: string | null) {
  if (peerBondId) {
    return or(eq(messages.bondId, myBondId), eq(messages.bondId, peerBondId))!;
  }
  return eq(messages.bondId, myBondId);
}

/**
 * Stores an encrypted message for a bond.
 * The ciphertext is produced client-side via AES-256-GCM.
 */
export async function sendMessage(
  bondId: string,
  senderId: string,
  ciphertextBase64: string,
  attachment?: AttachmentData,
): Promise<MessageRow> {
  const id = crypto.randomUUID();
  const ciphertext = Buffer.from(ciphertextBase64, 'base64');
  const sentAt = new Date();

  await db.insert(messages).values({
    id,
    bondId,
    senderId,
    ciphertext,
    sentAt,
    attachmentFileId: attachment?.fileId ?? null,
    attachmentName: attachment?.fileName ?? null,
    attachmentType: attachment?.fileType ?? null,
    attachmentSize: attachment?.fileSize ?? null,
    attachmentEncryptionMeta: attachment?.encryptionMeta ?? null,
  });

  // Fire push notification to bond partner (fire-and-forget)
  // The WS relay handles real-time delivery; this is the offline fallback
  import('./realtime-dispatch').then(async ({ notifyBondMessage }) => {
    const { users } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');

    // Find the bond partner's userId
    const [bond] = await db.select({ targetId: bonds.targetId })
      .from(bonds).where(eq(bonds.id, bondId)).limit(1);
    if (!bond) return;

    // Get sender name for the notification
    const [sender] = await db.select({ name: users.name })
      .from(users).where(eq(users.id, senderId)).limit(1);

    await notifyBondMessage(bond.targetId, sender?.name ?? 'Someone', bondId);
  }).catch(() => {});

  // Auto-refresh: messaging keeps your bond alive (fire-and-forget)
  import('./bond-service').then(async ({ touchBondOnActivity, strengthenBondConnection }) => {
    const [bond] = await db.select({ targetId: bonds.targetId, targetType: bonds.targetType })
      .from(bonds).where(eq(bonds.id, bondId)).limit(1);
    if (bond?.targetId) {
      await touchBondOnActivity(senderId, bond.targetId, (bond.targetType as 'user' | 'tribe') ?? 'user');
      await strengthenBondConnection(senderId, bond.targetId, 3);
    }
  }).catch(() => {});

  return {
    id, bondId, senderId, ciphertext, plaintext: null, sentAt, readAt: null,
    attachmentFileId: attachment?.fileId ?? null,
    attachmentName: attachment?.fileName ?? null,
    attachmentType: attachment?.fileType ?? null,
    attachmentSize: attachment?.fileSize ?? null,
    attachmentEncryptionMeta: attachment?.encryptionMeta ?? null,
  };
}

/**
 * Returns messages for a bond conversation, newest first.
 * Queries BOTH bond IDs (mine + peer's) so both sides see all messages.
 * Supports cursor-based pagination.
 */
export async function getMessages(
  bondId: string,
  userId: string,
  limit: number = 50,
  beforeTimestamp?: Date,
): Promise<MessageRow[]> {
  const [myBondId, peerBondId] = await resolveBondPair(bondId, userId);
  const filter = bondIdFilter(myBondId, peerBondId);

  let query = db.select().from(messages)
    .where(
      beforeTimestamp
        ? and(filter, lt(messages.sentAt, beforeTimestamp))
        : filter
    )
    .orderBy(desc(messages.sentAt))
    .limit(limit);

  const rows = await query;
  return rows.map(r => ({
    ...r,
    ciphertext: r.ciphertext ? Buffer.from(r.ciphertext as Buffer) : null,
  })) as MessageRow[];
}

/**
 * Marks all unread messages in a bond as read for the given user.
 * Only marks messages sent by OTHER users (not your own).
 * Marks across both bond IDs so read receipts work correctly.
 */
export async function markRead(bondId: string, userId: string): Promise<number> {
  const [myBondId, peerBondId] = await resolveBondPair(bondId, userId);
  const filter = bondIdFilter(myBondId, peerBondId);

  const result = await db.update(messages)
    .set({ readAt: new Date() })
    .where(
      and(
        filter,
        ne(messages.senderId, userId),
        isNull(messages.readAt),
      )
    );
  return 0; // SQLite doesn't return update count easily
}

/**
 * Gets total unread message count across all of a user's bonds.
 * For each bond, also checks the peer's bond ID for messages they sent.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  // Get all bond IDs for this user, along with target info for peer resolution
  const userBonds = await db.select({
    id: bonds.id,
    targetId: bonds.targetId,
    targetType: bonds.targetType,
  }).from(bonds)
    .where(eq(bonds.userId, userId));

  if (userBonds.length === 0) return 0;

  let totalUnread = 0;
  for (const bond of userBonds) {
    // Find peer bond ID for user-type bonds
    let peerBondId: string | null = null;
    if (bond.targetType === 'user') {
      const [peerBond] = await db.select({ id: bonds.id })
        .from(bonds)
        .where(and(eq(bonds.userId, bond.targetId), eq(bonds.targetId, userId)))
        .limit(1);
      peerBondId = peerBond?.id ?? null;
    }

    const filter = bondIdFilter(bond.id, peerBondId);

    const [result] = await db.select({
      count: sql<number>`count(*)`,
    }).from(messages)
      .where(
        and(
          filter,
          ne(messages.senderId, userId),
          isNull(messages.readAt),
        )
      );
    totalUnread += result?.count ?? 0;
  }

  return totalUnread;
}

/**
 * Gets the latest message in a bond for preview display.
 * Checks both bond IDs to find the actual latest message.
 */
export async function getLatestMessage(bondId: string): Promise<{
  preview: string;
  sentAt: Date | null;
  senderId: string | null;
} | null> {
  // For this function we don't have userId, so look up both directions
  const [myBond] = await db.select({
    targetId: bonds.targetId,
    userId: bonds.userId,
    targetType: bonds.targetType,
  }).from(bonds).where(eq(bonds.id, bondId)).limit(1);

  let peerBondId: string | null = null;
  if (myBond?.targetType === 'user') {
    const [peerBond] = await db.select({ id: bonds.id })
      .from(bonds)
      .where(and(eq(bonds.userId, myBond.targetId), eq(bonds.targetId, myBond.userId)))
      .limit(1);
    peerBondId = peerBond?.id ?? null;
  }

  const filter = bondIdFilter(bondId, peerBondId);

  const [latest] = await db.select({
    senderId: messages.senderId,
    plaintext: messages.plaintext,
    ciphertext: messages.ciphertext,
    attachmentFileId: messages.attachmentFileId,
    sentAt: messages.sentAt,
  }).from(messages)
    .where(filter)
    .orderBy(desc(messages.sentAt))
    .limit(1);

  if (!latest) return null;

  return {
    preview: latest.plaintext
      ?? (latest.attachmentFileId ? '📎 Encrypted attachment' : null)
      ?? (latest.ciphertext ? '🔒 Encrypted message' : ''),
    sentAt: latest.sentAt,
    senderId: latest.senderId,
  };
}

/**
 * Gets messages within a date range for search.
 * Returns encrypted messages; client handles decryption.
 */
export async function getMessagesByDateRange(
  bondId: string,
  userId: string,
  startDate: Date,
  endDate: Date,
  limit: number = 200,
): Promise<MessageRow[]> {
  const [myBondId, peerBondId] = await resolveBondPair(bondId, userId);
  const filter = bondIdFilter(myBondId, peerBondId);

  const rows = await db.select().from(messages)
    .where(
      and(
        filter,
        sql`${messages.sentAt} >= ${startDate}`,
        sql`${messages.sentAt} <= ${endDate}`,
      )
    )
    .orderBy(desc(messages.sentAt))
    .limit(limit);

  return rows.map(r => ({
    ...r,
    ciphertext: r.ciphertext ? Buffer.from(r.ciphertext as Buffer) : null,
  })) as MessageRow[];
}
