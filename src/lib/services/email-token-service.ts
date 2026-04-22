/**
 * @fileoverview Email Verification Token Service (P4-1).
 * 
 * Creates and validates HMAC-signed tokens for:
 *   - Email verification (24h TTL)
 *   - Passkey recovery magic links (15min TTL)
 * 
 * Tokens are stored in the email_verification_tokens table
 * and marked as used (single-use) upon validation.
 */

import { db } from '@/db';
import { emailVerificationTokens, users } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { createHmac, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// CONSTANTS
// ============================================================

const TTL: Record<string, number> = {
  verify_email: 24 * 60 * 60 * 1000,     // 24 hours
  passkey_recovery: 15 * 60 * 1000,       // 15 minutes
};

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not configured');
  return secret;
}

// ============================================================
// TOKEN CREATION
// ============================================================

/**
 * Creates a signed verification token and stores it in the DB.
 * @returns The signed token string (to be embedded in a URL)
 */
export async function createVerificationToken(
  userId: string,
  type: 'verify_email' | 'passkey_recovery',
): Promise<string> {
  const nonce = randomBytes(16).toString('hex');
  const ttl = TTL[type] ?? TTL.verify_email;
  const expiresAt = new Date(Date.now() + ttl);
  const id = uuidv4();

  // Create HMAC-signed token
  const payload = JSON.stringify({ id, userId, type, nonce });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const signature = createHmac('sha256', getSecret()).update(payloadB64).digest('base64url');
  const token = `${payloadB64}.${signature}`;

  // Store in DB
  await db.insert(emailVerificationTokens).values({
    id,
    userId,
    token,
    type,
    expiresAt,
    createdAt: new Date(),
  });

  return token;
}

// ============================================================
// TOKEN VALIDATION
// ============================================================

/**
 * Validates and consumes a verification token (single-use).
 * @returns { userId, type } if valid
 * @throws Error if invalid, expired, or already used
 */
export async function validateAndConsumeToken(token: string): Promise<{
  userId: string;
  type: string;
}> {
  // Verify signature
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Invalid token format');
  const [payloadB64, signature] = parts;

  const expectedSig = createHmac('sha256', getSecret()).update(payloadB64!).digest('base64url');
  if (signature !== expectedSig) throw new Error('Invalid token signature');

  // Parse payload
  const payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString('utf-8'));
  const { id, userId, type } = payload;

  // Look up in DB — must exist, not yet used
  const [row] = await db.select().from(emailVerificationTokens)
    .where(and(
      eq(emailVerificationTokens.id, id),
      eq(emailVerificationTokens.token, token),
      isNull(emailVerificationTokens.usedAt),
    ))
    .limit(1);

  if (!row) throw new Error('Token not found or already used');

  // Expiry check
  if (row.expiresAt.getTime() < Date.now()) {
    throw new Error('Token has expired');
  }

  // Mark as used (single-use)
  await db.update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(emailVerificationTokens.id, id));

  return { userId, type };
}

// ============================================================
// EMAIL VERIFICATION
// ============================================================

/**
 * Marks a user's email as verified.
 */
export async function markEmailVerified(userId: string): Promise<void> {
  await db.update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, userId));
}

/**
 * Checks if a user's email is verified.
 */
export async function isEmailVerified(userId: string): Promise<boolean> {
  const [user] = await db.select({ emailVerified: users.emailVerified })
    .from(users).where(eq(users.id, userId)).limit(1);
  return user?.emailVerified ?? false;
}
