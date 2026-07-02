/**
 * Apple Declared Age Range provider (issue #32) — iOS OS-signal age verification.
 *
 * On iOS 26.2+ native, the app asks iOS (`AgeRangeService.requestAgeRange`) for the
 * signed-in Apple Account's declared age band. A native Capacitor plugin returns the
 * band + the DECLARATION LEVEL (how Apple established it: self-declared vs
 * government-ID / payment confirmed). This lets an iOS user in a US law state satisfy
 * the 18+ gate WITHOUT Google Wallet — see src/lib/geo/age-policy.ts (surface-aware
 * regionTier) — independent of NEXT_PUBLIC_WALLET_VERIFY_ENABLED.
 *
 * ── TRUST MODEL (read before enabling in prod) ───────────────────────────────────
 * Apple's result is a CLIENT-TRUSTED VALUE — it is NOT cryptographically signed, so a
 * modified app could POST `over18: true` without ever calling iOS. The server-side
 * anti-forgery boundary is therefore **App Attest** (Phase 2): a DCAppAttest assertion
 * binding the result to a genuine instance of THIS app over the server-issued, single-
 * use `nonce`. Until that lands, this provider is PROD-REJECTED (like the privately
 * stub): the feature is testable in dev/staging behind NEXT_PUBLIC_IOS_AGE_VERIFY_ENABLED,
 * but cannot stamp an account in production. The nonce binding (C1 single-use + C2
 * userId) is already wired so App Attest only needs to add the "genuine app" half.
 */
import type {
  AgeVerificationProvider,
  AgeVerificationRequest,
  AgeVerificationResult,
  AgeVerificationContext,
} from '../types';
import { iosDeclaredAgeEnabled } from '@/lib/geo/age-policy';
import { CONFIRMED_AGE_DECLARATIONS } from '@/lib/age-verification/declared-age-policy';

/**
 * "Real" production = a production build that is NOT the staging box. Staging runs
 * NODE_ENV=production builds but sets TRIBES_ENV=staging (same precedent as the geo
 * override in resolve-region.ts), and must be able to device-test this flow before
 * App Attest lands.
 */
const isRealProd = () =>
  process.env.NODE_ENV === 'production' && process.env.TRIBES_ENV !== 'staging';

/**
 * Phase-2 App Attest verification. In REAL production the client boolean is worthless
 * without proof it came from a genuine, unmodified instance of THIS app — so this must
 * verify a DCAppAttest assertion binding `appAttest` to `nonce`. It is NOT implemented
 * yet, so it throws unconditionally: this is deliberate, and it means NO env var or flag
 * can open the prod path until the code below actually exists. (A single env-var "trust"
 * switch with no verification behind it would be a full client-forgery bypass.)
 */
async function verifyAppAttestOrThrow(_appAttest: unknown, _nonce: string, _userId: string): Promise<void> {
  // TODO(app-attest, Phase 2): validate the DCAppAttest assertion:
  //   - assertion signs the server `nonce` (freshness/replay),
  //   - the attested key belongs to a genuine instance of our App ID,
  //   - bind to `_userId`. Reject on any failure. Only then remove this throw.
  throw new Error('iOS age verification is not enabled in production yet (App Attest pending).');
}

// Declaration levels that count as high-assurance for a US law state live in
// @/lib/age-verification/ios-declared-age.ts (CONFIRMED_AGE_DECLARATIONS — shared with
// the client pre-check). Bare self-declaration is the SAME assurance as the web opt-in
// we geo-block those states to avoid, so it is NOT accepted; `other` is excluded
// conservatively. ⚠️ Confirm the set with counsel before prod (Decision 2).

interface DeclaredAgeAttestation {
  nonce?: string;
  over18?: boolean;
  /** Normalized declaration level from the plugin: self_declared | guardian_declared |
   *  government_id | payment | other | unknown. */
  declaration?: string;
  /** App Attest assertion envelope (Phase 2). */
  appAttest?: unknown;
}

export const appleDeclaredAgeProvider: AgeVerificationProvider = {
  id: 'apple_declared_age_range',
  label: 'Confirm your age with iPhone',
  isAvailable() {
    // Config-level availability; surface (iOS-only) is enforced client-side via
    // providerSupport() and server-side via the surface-aware gate. Off by default.
    return iosDeclaredAgeEnabled();
  },
  async verify(req: AgeVerificationRequest, ctx: AgeVerificationContext): Promise<AgeVerificationResult> {
    const att = req.attestation as DeclaredAgeAttestation | undefined;
    if (!att || typeof att !== 'object') throw new Error('Missing Declared Age Range attestation.');

    // The server-issued nonce is the ONLY binding to this user + single-use guard for a
    // non-cryptographic signal, so it is mandatory. submitAgeVerification consumes it.
    if (!att.nonce || typeof att.nonce !== 'string') {
      throw new Error('Declared Age Range attestation missing its server nonce.');
    }
    // This nonce is the ONLY server-side binding (the signal isn't signed), so its
    // consumption must fail CLOSED — an outage must not wave through an unbound nonce.
    const soft = (verified: boolean): AgeVerificationResult =>
      ({ verified, method: 'apple_declared_age_range', nonce: att.nonce, nonceFailClosed: true });

    if (att.over18 !== true) return soft(false);

    const declaration = typeof att.declaration === 'string' ? att.declaration : 'unknown';
    if (!CONFIRMED_AGE_DECLARATIONS.has(declaration)) {
      // Self-declared / guardian / other → not high-assurance enough for a law state.
      // Return not-verified (a soft "didn't succeed") rather than throw (which the action
      // maps to "method unavailable" — misleading; the method ran, the age just isn't
      // confirmed). The client explains that iOS must have a confirmed age.
      return soft(false);
    }

    // ── App Attest boundary ──────────────────────────────────────────────────────
    // In real production, the unsigned client result is only trusted once an App Attest
    // assertion proves it came from a genuine app instance (throws until implemented, so
    // no env flag can open this path). Dev + staging (TRIBES_ENV=staging) skip it for
    // device testing; the feature is still config-gated and prod-safe.
    if (isRealProd()) {
      await verifyAppAttestOrThrow(att.appAttest, att.nonce, ctx.expectedUserId);
    }

    return soft(true);
  },
};
