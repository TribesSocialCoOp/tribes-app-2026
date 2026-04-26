/**
 * @fileoverview Message service for E2E encrypted bond messaging.
 * Phase P3: Messages are stored as ciphertext — encryption/decryption
 * happens client-side using the shared ECDH secret.
 */

import { db } from '@/db';
import { messages, bonds } from '@/db/schema';
import { eq, and, desc, lt, isNull, ne, sql } from 'drizzle-orm';

export interface MessageRow {
  id: string;
  bondId: string;
  senderId: string;
  ciphertext: Buffer | null;
  plaintext: string | null;
  sentAt: Date | null;
  readAt: Date | null;
}

/**
 * Stores an encrypted message for a bond.
 * The ciphertext is produced client-side via AES-256-GCM.
 */
export async function sendMessage(
  bondId: string,
  senderId: string,
  ciphertextBase64: string,
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
  import('./bond-service').then(async ({ touchBondOnActivity }) => {
    const [bond] = await db.select({ targetId: bonds.targetId, targetType: bonds.targetType })
      .from(bonds).where(eq(bonds.id, bondId)).limit(1);
    if (bond?.targetId) {
      await touchBondOnActivity(senderId, bond.targetId, (bond.targetType as 'user' | 'tribe') ?? 'user');
    }
  }).catch(() => {});

  return { id, bondId, senderId, ciphertext, plaintext: null, sentAt, readAt: null };
}

/**
 * Returns messages for a bond, newest first.
 * Supports cursor-based pagination.
 */
export async function getMessages(
  bondId: string,
  userId: string,
  limit: number = 50,
  beforeTimestamp?: Date,
): Promise<MessageRow[]> {
  // Verify user is in this bond
  const [bond] = await db.select().from(bonds)
    .where(and(eq(bonds.id, bondId), eq(bonds.userId, userId)))
    .limit(1);
  if (!bond) throw new Error('Not a member of this bond');

  let query = db.select().from(messages)
    .where(
      beforeTimestamp
        ? and(eq(messages.bondId, bondId), lt(messages.sentAt, beforeTimestamp))
        : eq(messages.bondId, bondId)
    )
    .orderBy(desc(messages.sentAt))
    .limit(limit);

  const rows = await query;
  return rows.map(r => ({
    ...r,
    ciphertext: r.ciphertext ? Buffer.from(r.ciphertext as string) : null,
  })) as MessageRow[];
}

/**
 * Marks all unread messages in a bond as read for the given user.
 * Only marks messages sent by OTHER users (not your own).
 */
export async function markRead(bondId: string, userId: string): Promise<number> {
  const result = await db.update(messages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(messages.bondId, bondId),
        ne(messages.senderId, userId),
        isNull(messages.readAt),
      )
    );
  return 0; // SQLite doesn't return update count easily
}

/**
 * Gets total unread message count across all of a user's bonds.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  // Get all bond IDs for this user
  const userBonds = await db.select({ id: bonds.id })
    .from(bonds)
    .where(eq(bonds.userId, userId));

  if (userBonds.length === 0) return 0;
  const bondIds = userBonds.map(b => b.id);

  // Count unread messages across all bonds (sent by others)
  let totalUnread = 0;
  for (const bondId of bondIds) {
    const [result] = await db.select({
      count: sql<number>`count(*)`,
    }).from(messages)
      .where(
        and(
          eq(messages.bondId, bondId),
          ne(messages.senderId, userId),
          isNull(messages.readAt),
        )
      );
    totalUnread += result?.count ?? 0;
  }

  return totalUnread;
}

/**
 * Gets the latest message in a bond for Intercom preview display.
 * Returns plaintext preview if available, or ciphertext indicator.
 */
export async function getLatestMessage(bondId: string): Promise<{
  preview: string;
  sentAt: Date | null;
  senderId: string | null;
} | null> {
  const [latest] = await db.select({
    senderId: messages.senderId,
    plaintext: messages.plaintext,
    ciphertext: messages.ciphertext,
    sentAt: messages.sentAt,
  }).from(messages)
    .where(eq(messages.bondId, bondId))
    .orderBy(desc(messages.sentAt))
    .limit(1);

  if (!latest) return null;

  return {
    preview: latest.plaintext ?? (latest.ciphertext ? '🔒 Encrypted message' : ''),
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
  // Verify user is in this bond
  const [bond] = await db.select().from(bonds)
    .where(and(eq(bonds.id, bondId), eq(bonds.userId, userId)))
    .limit(1);
  if (!bond) throw new Error('Not a member of this bond');

  const rows = await db.select().from(messages)
    .where(
      and(
        eq(messages.bondId, bondId),
        sql`${messages.sentAt} >= ${startDate}`,
        sql`${messages.sentAt} <= ${endDate}`,
      )
    )
    .orderBy(desc(messages.sentAt))
    .limit(limit);

  return rows.map(r => ({
    ...r,
    ciphertext: r.ciphertext ? Buffer.from(r.ciphertext as string) : null,
  })) as MessageRow[];
}

