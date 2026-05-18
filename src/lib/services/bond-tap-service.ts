/**
 * @fileoverview Bond Tap Token service for NFC/QR bond formation.
 * Phase 2E: Token-based physical proximity bond initiation.
 *
 * Flow:
 * 1. Initiator creates a tap token (HMAC-signed, 1-year TTL)
 * 2. Token is encoded as URL: /bond/tap/{token}
 * 3. Displayed as QR code + optional NFC broadcast
 * 4. Recipient scans/taps → lands on redemption page
 * 5. Recipient confirms → bond created via 2A pipeline
 */

import { db } from '@/db';
import { bondRequests, users } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { createHmac, randomBytes } from 'crypto';
import type { BondType } from '@/lib/types';
import { getBaseUrl } from '@/lib/url';

// ============================================================
// CONSTANTS
// ============================================================

const TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 365 days (1 year)
const TOKEN_VERSION = 1;

function getHmacSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not configured');
  return secret;
}

// ============================================================
// TOKEN FORMAT
// ============================================================

/**
 * Token payload (encoded as base64url JSON).
 */
interface TapTokenPayload {
  v: number;       // version
  uid: string;     // initiator user ID
  bt: string;      // bond type
  n: string;       // nonce
  exp: number;     // expiry timestamp (ms)
  rid: string;     // bond request ID in DB
}

// ============================================================
// TOKEN OPERATIONS
// ============================================================

/**
 * Creates an HMAC-signed tap token for bond initiation.
 * Stores a pending bond request in the DB for tracking.
 *
 * @returns { token, url, expiresAt } — token string, full redemption URL, expiry time
 */
export async function createTapToken(
  userId: string,
  bondType: BondType,
): Promise<{ token: string; url: string; expiresAt: Date }> {
  const baseUrl = await getBaseUrl();

  // Check for existing valid token
  const existingReqs = await db.query.bondRequests.findMany({
    where: and(
      eq(bondRequests.fromUserId, userId),
      eq(bondRequests.toUserId, userId), // Self-referential = placeholder
      eq(bondRequests.formationMethod, 'rfid_tap'),
      eq(bondRequests.status, 'pending')
    ),
    orderBy: (requests, { desc }) => [desc(requests.createdAt)],
    limit: 1,
  });

  const existing = existingReqs[0];
  if (existing && existing.createdAt && existing.message) {
    const existingExpiry = new Date(existing.createdAt.getTime() + TOKEN_TTL_MS);
    if (existingExpiry > new Date()) {
      // Re-use existing token
      const token = existing.message;
      const url = `${baseUrl}/bond/tap/${encodeURIComponent(token)}`;
      return { token, url, expiresAt: existingExpiry };
    }
  }

  const nonce = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  // Create a placeholder bond request for the tap
  // Use initiator's own ID as placeholder — will be updated to the actual acceptor on redemption
  // The self-bond validation in redeemTapToken prevents the initiator from accepting their own token
  const requestId = `tap-${Date.now()}-${nonce.substring(0, 8)}`;
  
  // Build payload
  const payload: TapTokenPayload = {
    v: TOKEN_VERSION,
    uid: userId,
    bt: bondType,
    n: nonce,
    exp: expiresAt.getTime(),
    rid: requestId,
  };

  // Encode and sign
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', getHmacSecret()).update(payloadStr).digest('base64url');
  const token = `${payloadStr}.${signature}`;

  await db.insert(bondRequests).values({
    id: requestId,
    fromUserId: userId,
    toUserId: userId, // Placeholder — updated on redemption
    bondType,
    formationMethod: 'rfid_tap',
    status: 'pending',
    message: token, // Store token here for reuse
    createdAt: new Date(),
  });

  const url = `${baseUrl}/bond/tap/${encodeURIComponent(token)}`;

  return { token, url, expiresAt };
}

/**
 * Validates a tap token — checks signature, expiry, and not-redeemed status.
 *
 * @returns Token payload if valid, or throws an error
 */
export async function validateTapToken(token: string): Promise<{
  initiatorId: string;
  initiatorName: string;
  initiatorAvatar?: string;
  bondType: BondType;
  requestId: string;
  expiresAt: Date;
}> {
  // Split token into payload and signature
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Invalid token format');
  const [payloadStr, signature] = parts;

  // Verify HMAC signature
  const expectedSig = createHmac('sha256', getHmacSecret()).update(payloadStr!).digest('base64url');
  if (signature !== expectedSig) throw new Error('Invalid token signature');

  // Parse payload
  const payload: TapTokenPayload = JSON.parse(
    Buffer.from(payloadStr!, 'base64url').toString('utf-8'),
  );

  // Version check
  if (payload.v !== TOKEN_VERSION) throw new Error('Unsupported token version');

  // Expiry check
  if (Date.now() > payload.exp) throw new Error('Token has expired');

  // Check if the bond request is still pending
  const [request] = await db.select().from(bondRequests)
    .where(and(eq(bondRequests.id, payload.rid), eq(bondRequests.status, 'pending')))
    .limit(1);

  if (!request) throw new Error('Token has already been used or cancelled');

  // Look up initiator info
  const [initiator] = await db.select().from(users)
    .where(eq(users.id, payload.uid))
    .limit(1);

  if (!initiator) throw new Error('Initiator not found');

  return {
    initiatorId: payload.uid,
    initiatorName: initiator.name ?? 'Unknown',
    initiatorAvatar: initiator.avatar ?? undefined,
    bondType: payload.bt as BondType,
    requestId: payload.rid,
    expiresAt: new Date(payload.exp),
  };
}

/**
 * Redeems a tap token — creates a bond between the initiator and acceptor.
 * Single-use: marks the bond request as accepted after redemption.
 *
 * Uses the standard acceptBondRequest flow from Phase 2A.
 */
export async function redeemTapToken(token: string, acceptorId: string): Promise<void> {
  // Validate first
  const validated = await validateTapToken(token);

  // Can't bond with yourself
  if (validated.initiatorId === acceptorId) {
    throw new Error('Cannot bond with yourself');
  }

  // Update the placeholder bond request with the actual acceptor
  await db.update(bondRequests).set({
    toUserId: acceptorId,
  }).where(eq(bondRequests.id, validated.requestId));

  // Use the standard accept flow from Phase 2A
  const { acceptBondRequest } = await import('@/lib/services/bond-service');
  await acceptBondRequest(validated.requestId, acceptorId);
}
