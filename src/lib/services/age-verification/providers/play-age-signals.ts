/**
 * Google Play Age Signals provider (issue #32) — Android OS-signal age verification.
 *
 * The Android analog of the iOS Apple Declared Age Range provider. A native Capacitor
 * plugin calls the Play Age Signals API (`AgeSignalsManager.checkAgeSignals`) and returns
 * the user's status + age band. This lets an Android-native user in a US law state satisfy
 * the 18+ gate WITHOUT Google Wallet — see src/lib/geo/age-policy.ts (surface-aware
 * regionTier) — independent of NEXT_PUBLIC_WALLET_VERIFY_ENABLED. Shares the decision core
 * with iOS (os-age-policy.ts) so the two platforms can't drift.
 *
 * Signal mapping (Play `AgeSignalsResult` → shared model):
 *   • userStatus VERIFIED  → confirmed (gov-ID / card / facial), 18+ if ageUpper == null
 *   • userStatus DECLARED  → self-declared adult (band-gated like Apple self_declared)
 *   • userStatus SUPERVISED / _APPROVAL_PENDING / _APPROVAL_DENIED → supervised child →
 *     parentalControlsActive = true (blocked by default, the Family Link equivalent)
 *   • userStatus UNKNOWN / null → no definitive signal → blocked when definitive required
 *   • age band: over18 = the band has no sub-18 upper bound (ageUpper null / >= 18)
 *
 * ── TRUST MODEL (read before enabling in prod) ───────────────────────────────────
 * The Play result is a CLIENT-TRUSTED VALUE (the API carries no server nonce). The
 * server-side anti-forgery boundary is **Play Integrity** (Phase 2), the Android analog
 * of iOS App Attest: verify an integrity token binding the response to a genuine,
 * unmodified instance of THIS app over the server-issued single-use `nonce`. Until that
 * lands, this provider is PROD-REJECTED: testable in dev/staging behind
 * NEXT_PUBLIC_PLAY_AGE_VERIFY_ENABLED, but cannot stamp an account in production.
 */
import type {
  AgeVerificationProvider,
  AgeVerificationRequest,
  AgeVerificationResult,
  AgeVerificationContext,
} from '../types';
import { playAgeSignalsEnabled } from '@/lib/geo/age-policy';
import { evaluateOsAgeSignal, isRealProd, type OsAgeReasonCode } from '@/lib/age-verification/os-age-policy';

// ── Child-safety policy flags (server-side env, runtime-tunable — no rebuild) ────────
const androidFlags = () => ({
  /** Block supervised (Family Link) child accounts even if the band claims 18+. Default ON. */
  blockOnParentalControls: process.env.ANDROID_AGE_BLOCK_ON_SUPERVISED !== 'false',
  /** Fail closed on a missing/unknown age signal. Default ON. */
  requireDefinitiveSignal: process.env.ANDROID_AGE_REQUIRE_DEFINITIVE_SIGNAL !== 'false',
  /** Require a Play-VERIFIED status (rejects a bare DECLARED age). Default OFF — most
   *  adults are not VERIFIED; enable only where counsel demands higher assurance. */
  requireConfirmed: process.env.ANDROID_AGE_REQUIRE_CONFIRMED === 'true',
});

/** Android-flavored copy for each shared reason code. */
const ANDROID_REASONS: Record<OsAgeReasonCode, string> = {
  no_signal: 'We couldn’t read a clear age signal from Google Play. Please make sure Play services are up to date and try again.',
  under_18: 'Your Google account shows you’re under 18, so this adult content isn’t available.',
  supervised: 'This is a supervised (Family Link) account, so adult content can’t be enabled here.',
  unconfirmed: 'Your Google account isn’t age-verified. Verify your age with Google, then try again.',
};

/**
 * Phase-2 Play Integrity verification. In REAL production the client result is worthless
 * without proof it came from a genuine, unmodified instance of THIS app — so this must
 * verify a Play Integrity token binding the response to `nonce`. NOT implemented yet, so
 * it throws unconditionally: no env var or flag can open the prod path until the code
 * exists (a bare "trust" switch would be a full client-forgery bypass).
 */
async function verifyPlayIntegrityOrThrow(_integrityToken: unknown, _nonce: string, _userId: string): Promise<void> {
  // TODO(play-integrity, Phase 2): validate the Play Integrity token — request hash binds
  // the server `nonce`, package name + cert digest match our app, verdict is genuine —
  // then bind to `_userId`. Reject on failure. Only then remove this throw.
  throw new Error('Android age verification is not enabled in production yet (Play Integrity pending).');
}

interface PlayAgeAttestation {
  nonce?: string;
  /** Apple-parity normalized band from the plugin (18+). */
  over18?: boolean;
  /** Play userStatus: VERIFIED | DECLARED | SUPERVISED | SUPERVISED_APPROVAL_PENDING |
   *  SUPERVISED_APPROVAL_DENIED | UNKNOWN. Recorded for audit. */
  userStatus?: string;
  /** Supervised (Family Link) child account — the parental-controls equivalent. */
  parentalControlsActive?: boolean;
  /** Play Integrity token envelope (Phase 2). */
  integrityToken?: unknown;
}

export const playAgeSignalsProvider: AgeVerificationProvider = {
  id: 'play_age_signals',
  label: 'Confirm your age with Google',
  isAvailable() {
    return playAgeSignalsEnabled();
  },
  async verify(req: AgeVerificationRequest, ctx: AgeVerificationContext): Promise<AgeVerificationResult> {
    const att = req.attestation as PlayAgeAttestation | undefined;
    if (!att || typeof att !== 'object') throw new Error('Missing Play Age Signals attestation.');

    if (!att.nonce || typeof att.nonce !== 'string') {
      throw new Error('Play Age Signals attestation missing its server nonce.');
    }
    // The nonce is the ONLY server-side binding (Play carries no signature), so its
    // consumption must fail CLOSED — an outage must not wave through an unbound nonce.
    const soft = (verified: boolean, reason?: string): AgeVerificationResult =>
      ({ verified, method: 'play_age_signals', nonce: att.nonce, nonceFailClosed: true, reason });

    // `confirmed` = a Play VERIFIED status (gov-ID / card / facial age estimation).
    const confirmed = att.userStatus === 'VERIFIED';
    const decision = evaluateOsAgeSignal(
      {
        over18: att.over18,
        parentalControlsActive: att.parentalControlsActive === true,
        confirmed,
      },
      androidFlags(),
    );
    if (!decision.verified) return soft(false, ANDROID_REASONS[decision.reasonCode!]);

    // ── Play Integrity boundary (Android analog of iOS App Attest) ────────────────
    // Real prod only trusts the result once a Play Integrity token proves a genuine app
    // instance (throws until implemented). Dev + staging (TRIBES_ENV=staging) skip it.
    if (isRealProd()) {
      await verifyPlayIntegrityOrThrow(att.integrityToken, att.nonce, ctx.expectedUserId);
    }

    return soft(true);
  },
};
