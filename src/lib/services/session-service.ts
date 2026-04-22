/**
 * @fileoverview Session management service.
 * Lists active sessions, supports single/bulk revocation.
 */

import { db } from '@/db';
import { sessions } from '@/db/schema';
import { eq, and, isNull, gt, ne, sql } from 'drizzle-orm';

export interface ActiveSession {
  id: string;
  userAgent: string | null;
  createdAt: Date | null;
  isCurrent: boolean;
}

/**
 * Get all active (non-revoked, non-expired) sessions for a user.
 */
export async function getActiveSessions(userId: string, currentSessionId?: string): Promise<ActiveSession[]> {
  const now = new Date();
  const rows = await db
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      )
    )
    .orderBy(sessions.createdAt);

  return rows.map(row => ({
    id: row.id,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
    isCurrent: row.id === currentSessionId,
  }));
}

/**
 * Revoke a single session (must belong to the user).
 */
export async function revokeSession(sessionId: string, userId: string): Promise<void> {
  const result = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.userId, userId),
      )
    );
}

/**
 * Revoke all sessions for a user except the current one.
 */
export async function revokeAllOtherSessions(userId: string, currentSessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.userId, userId),
        ne(sessions.id, currentSessionId),
        isNull(sessions.revokedAt),
      )
    );
}
