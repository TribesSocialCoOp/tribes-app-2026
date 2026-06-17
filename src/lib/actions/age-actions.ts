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
    result = await verifyAge(req);
  } catch {
    throw new PublicError('That verification method is not available right now.');
  }
  if (!result.verified) {
    throw new PublicError('Age verification did not succeed. Please try again.');
  }

  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  await db.update(users)
    .set({ ageVerifiedAt: new Date(), ageVerificationMethod: result.method })
    .where(eq(users.id, userId));

  return { verified: true, method: result.method };
});
