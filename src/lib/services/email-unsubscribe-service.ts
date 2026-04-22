/**
 * @fileoverview Email Unsubscribe Service (P4-2).
 * 
 * Generates HMAC-signed unsubscribe URLs and validates them.
 * Each URL encodes a userId + category so the recipient can
 * opt out of a specific email category without logging in.
 */

import { createHmac } from 'crypto';

// ============================================================
// TYPES
// ============================================================

/** Maps email template types to notification preference columns. */
export type UnsubscribeCategory =
  | 'bondMessages'     // bondMessagesEnabled
  | 'eventReminders'   // eventRemindersEnabled
  | 'tribeActivity'    // tribeActivityEnabled
  | 'all';             // emailEnabled (master kill)

export const CATEGORY_LABELS: Record<UnsubscribeCategory, string> = {
  bondMessages: 'bond & family notifications',
  eventReminders: 'event reminders',
  tribeActivity: 'tribe activity updates',
  all: 'all email notifications',
};

/** Maps category to the notification_preferences column name. */
export const CATEGORY_TO_COLUMN: Record<UnsubscribeCategory, string> = {
  bondMessages: 'bondMessagesEnabled',
  eventReminders: 'eventRemindersEnabled',
  tribeActivity: 'tribeActivityEnabled',
  all: 'emailEnabled',
};

// ============================================================
// URL GENERATION
// ============================================================

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not configured');
  return secret;
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:9002';
}

/**
 * Generates a signed unsubscribe URL for a user + category.
 * The URL is self-contained — no login required to unsubscribe.
 */
export function generateUnsubscribeUrl(userId: string, category: UnsubscribeCategory): string {
  const payload = JSON.stringify({ userId, category, ts: Date.now() });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const signature = createHmac('sha256', getSecret())
    .update(`unsub:${payloadB64}`)
    .digest('base64url');

  const token = `${payloadB64}.${signature}`;
  return `${getAppUrl()}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

// ============================================================
// TOKEN VALIDATION
// ============================================================

export interface UnsubscribePayload {
  userId: string;
  category: UnsubscribeCategory;
}

/**
 * Validates an unsubscribe token. No DB lookup needed — HMAC-only.
 * @returns The decoded payload if valid, null if tampered or malformed.
 */
export function validateUnsubscribeToken(token: string): UnsubscribePayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, signature] = parts;

    const expectedSig = createHmac('sha256', getSecret())
      .update(`unsub:${payloadB64}`)
      .digest('base64url');

    if (signature !== expectedSig) return null;

    const payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString('utf-8'));
    const { userId, category } = payload;

    // Validate category
    if (!userId || !CATEGORY_TO_COLUMN[category as UnsubscribeCategory]) return null;

    return { userId, category: category as UnsubscribeCategory };
  } catch {
    return null;
  }
}
