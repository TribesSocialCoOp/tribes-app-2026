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
import type { RegionTier, Surface } from '@/lib/geo/age-policy';

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

/** Current user's web-set "show adult content" 18+ self-attest opt-in state. */
export async function getAdultContentOptIn(): Promise<{ enabled: boolean }> {
  const userId = await getCurrentUserId();
  if (!userId) return { enabled: false };
  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [u] = await db.select({ showAdultContentAt: users.showAdultContentAt })
    .from(users).where(eq(users.id, userId)).limit(1);
  return { enabled: !!u?.showAdultContentAt };
}

export interface NsfwGateStatus {
  /** Region policy tier for this request (coarse geo, not sensitive). */
  regionTier: RegionTier;
  /** web / ios / android — drives inline-toggle vs "enable on web" guidance. */
  surface: Surface;
  /** users.showAdultContentAt — the web-set content toggle. */
  hasOptIn: boolean;
  /** users.ageVerifiedAt — high-assurance (Google Wallet) age verification. */
  hasVerified: boolean;
  /** Available verification providers (wallets + dev in non-prod). */
  providers: { id: string; label: string }[];
}

/**
 * Everything the age-gate modal needs to show the user exactly what's required for
 * their region × surface, up front — rather than discovering each requirement by
 * trial-and-error. Order of steps: open → [toggle]; law state → [verify, toggle].
 */
export async function getNsfwGateStatus(): Promise<NsfwGateStatus> {
  const { getSurface, getRequestRegion, regionCode } = await import('@/lib/geo/resolve-region');
  const { regionTier } = await import('@/lib/geo/age-policy');
  const { availableAgeProviders } = await import('@/lib/services/age-verification');

  const [surface, region] = await Promise.all([getSurface(), getRequestRegion()]);
  const tier = regionTier(regionCode(region));
  const providers = availableAgeProviders();

  const userId = await getCurrentUserId();
  if (!userId) {
    return { regionTier: tier, surface, hasOptIn: false, hasVerified: false, providers };
  }

  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [u] = await db
    .select({ showAdultContentAt: users.showAdultContentAt, ageVerifiedAt: users.ageVerifiedAt })
    .from(users).where(eq(users.id, userId)).limit(1);

  return {
    regionTier: tier,
    surface,
    hasOptIn: !!u?.showAdultContentAt,
    hasVerified: !!u?.ageVerifiedAt,
    providers,
  };
}

/**
 * Set/clear the 18+ "show adult content" self-attestation opt-in. WEB-ONLY by
 * design (Apple Reddit-pattern: the enable switch must live on the website, never
 * an in-app toggle). Holds no PII — just the opt-in timestamp.
 *
 * In law-state ("verify") regions, high-assurance age verification (Google Wallet)
 * is a prerequisite: you must verify before you can enable the content toggle.
 */
export const setAdultContentOptIn = withPublicErrors(async (enabled: boolean): Promise<{ enabled: boolean }> => {
  const userId = await requireAuth();
  const { getSurface, getRequestRegion, regionCode } = await import('@/lib/geo/resolve-region');
  if ((await getSurface()) !== 'web') {
    throw new PublicError('Please enable adult content from the website (tribes.app), not the app.');
  }

  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');

  if (enabled) {
    // Law states require Google Wallet verification BEFORE the toggle can be enabled.
    const { regionTier } = await import('@/lib/geo/age-policy');
    const tier = regionTier(regionCode(await getRequestRegion()));
    if (tier === 'verify') {
      const [u] = await db.select({ ageVerifiedAt: users.ageVerifiedAt })
        .from(users).where(eq(users.id, userId)).limit(1);
      if (!u?.ageVerifiedAt) {
        throw new PublicError('Verify your age with Google Wallet before enabling adult content.');
      }
    }
  }

  await db.update(users).set({ showAdultContentAt: enabled ? new Date() : null }).where(eq(users.id, userId));
  return { enabled };
});

/** Current user's "blur adult media" view preference (default ON — Reddit pattern). */
export async function getBlurAdultContent(): Promise<{ enabled: boolean }> {
  const userId = await getCurrentUserId();
  if (!userId) return { enabled: true };
  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [u] = await db.select({ blurAdultContent: users.blurAdultContent })
    .from(users).where(eq(users.id, userId)).limit(1);
  return { enabled: u?.blurAdultContent ?? true };
}

/**
 * Set the "blur adult media" view preference. Default ON; unlike the 18+ opt-in this
 * is a display preference (no PII, no attestation), so it may be set on any surface.
 */
export const setBlurAdultContent = withPublicErrors(async (enabled: boolean): Promise<{ enabled: boolean }> => {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  await db.update(users).set({ blurAdultContent: enabled }).where(eq(users.id, userId));
  return { enabled };
});

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
