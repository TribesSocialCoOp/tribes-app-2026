'use server';

/**
 * Age-verification server actions (issue #32).
 * One server-side decision point: validate a wallet attestation, and on success
 * stamp users.ageVerifiedAt / .ageVerificationMethod. Stores ONLY the outcome.
 */

import { requireAuth, getCurrentUserId } from './shared';
import { PublicError } from './error-utils';
import { withPublicErrors } from './error-utils';
import type { AgeVerificationRequest } from '@/lib/services/age-verification/types';

export interface AgeVerificationStatus {
  verified: boolean;
  /** Providers offered to this client (e.g. wallet providers + dev in non-prod). */
  providers: { id: string; label: string }[];
}

/** Current user's verification state + which providers are available to attempt. */
export async function getAgeVerificationStatus(): Promise<AgeVerificationStatus> {
  const { availableAgeProviders } = await import('@/lib/services/age-verification');
  const providers = availableAgeProviders();

  const userId = await getCurrentUserId();
  if (!userId) return { verified: false, providers };

  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [u] = await db.select({ ageVerifiedAt: users.ageVerifiedAt })
    .from(users).where(eq(users.id, userId)).limit(1);

  return { verified: Boolean(u?.ageVerifiedAt), providers };
}

/**
 * Build a signed OpenID4VP request for a wallet provider. The client passes the result
 * to navigator.credentials.get(); the returned verifierState is echoed back to
 * submitAgeVerification along with the wallet response. `origin` is the caller's
 * window.location.origin (bound into the session transcript).
 */
export const createAgeVerificationRequest = withPublicErrors(async (
  provider: 'google_wallet' | 'apple_wallet',
  origin: string,
): Promise<{ request: unknown; verifierState: string }> => {
  const userId = await requireAuth();
  const prefix = provider === 'google_wallet' ? 'GOOGLE_WALLET' : 'APPLE_WALLET';
  const { loadWalletConfig } = await import('@/lib/services/age-verification/config');
  const cfg = loadWalletConfig(prefix);
  if (!cfg) throw new PublicError('That verification method is not available right now.');

  // Origin allowlist (defense-in-depth): if APP_ORIGIN is set, require a match.
  const allowed = process.env.APP_ORIGIN;
  if (allowed && origin !== allowed) throw new PublicError('Unrecognized request origin.');

  const { buildAgeRequest } = await import('@/lib/services/age-verification/oid4vp');
  const built = await buildAgeRequest(cfg, origin, userId);

  // Record the issued nonce (Valkey TTL in prod, in-memory in dev) bound to this
  // user, for SINGLE-USE replay protection — consumed in submitAgeVerification.
  const { issueNonce } = await import('@/lib/services/age-verification/nonce-store');
  await issueNonce(built.nonce, userId, 10 * 60); // matches STATE_TTL ('10m')

  // Never return the bare nonce to the client — it stays sealed inside verifierState.
  return { request: built.request, verifierState: built.verifierState };
});

/**
 * Submit a wallet attestation for verification. On success, permanently marks the
 * account 18+ verified (one-and-done per policy v2). Returns the resolved method.
 */
export const submitAgeVerification = withPublicErrors(async (
  req: AgeVerificationRequest,
): Promise<{ verified: boolean; method: string }> => {
  const userId = await requireAuth();

  const { verifyAge } = await import('@/lib/services/age-verification');
  let result;
  try {
    // Pass the authenticated userId so the verifier enforces that the wallet
    // response was issued to THIS account (binding sealed in the verifier state).
    result = await verifyAge(req, userId);
  } catch {
    throw new PublicError('That verification method is not available right now.');
  }
  if (!result.verified) {
    throw new PublicError('Age verification did not succeed. Please try again.');
  }

  // SINGLE-USE: atomically consume the server-issued nonce BEFORE stamping the
  // account, so a wallet response can't be replayed within its TTL. Only the first
  // valid submission wins; a replay returns false. Wallet providers carry a nonce;
  // the dev provider has none.
  if (result.nonce) {
    const { consumeNonce } = await import('@/lib/services/age-verification/nonce-store');
    const ok = await consumeNonce(result.nonce, userId);
    if (!ok) {
      throw new PublicError('This verification request has expired or already been used. Please start again.');
    }
  }

  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  await db.update(users)
    .set({ ageVerifiedAt: new Date(), ageVerificationMethod: result.method })
    .where(eq(users.id, userId));

  return { verified: true, method: result.method };
});
