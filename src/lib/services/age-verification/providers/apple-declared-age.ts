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
import { CONFIRMED_AGE_DECLARATIONS, UNCONFIRMED_AGE_GUIDANCE } from '@/lib/age-verification/declared-age-policy';

// ── Child-safety policy flags (server-side env, runtime-tunable — no rebuild) ────────
/** Block when the device reports ANY active parental control (managed / child account).
 *  Default ON — a strong minor signal even if the age band claims 18+. */
const blockOnParentalControls = () => process.env.IOS_AGE_BLOCK_ON_PARENTAL_CONTROLS !== 'false';
/** Require a definitive age band from Apple; a missing/unreadable signal is blocked
 *  (fail closed for child safety). Default ON. */
const requireDefinitiveSignal = () => process.env.IOS_AGE_REQUIRE_DEFINITIVE_SIGNAL !== 'false';
/** Require an Apple-CONFIRMED declaration (gov-ID / payment / other), rejecting bare
 *  self_declared. Default OFF — Apple returns self_declared for most adults, so this
 *  rejects them; turn on only where counsel demands higher assurance. */
const requireConfirmedDeclaration = () => process.env.IOS_AGE_REQUIRE_CONFIRMED === 'true';

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

// POLICY — the goal is KEEPING MINORS OUT, so the age BAND is the gate, not the
// declaration method (2026-07-02):
//   • Under-18 age band → BLOCK. This is the real child gate; a minor's account (esp. in
//     Family Sharing, where a parent set the real birthday) reports an under-18 band.
//   • Active parental controls → BLOCK by default (managed/child device), even if the
//     band claims 18+ (flag IOS_AGE_BLOCK_ON_PARENTAL_CONTROLS).
//   • 18+ band → ALLOW regardless of declaration METHOD. Apple returns `selfDeclared` for
//     essentially all adult accounts (confirmed/checked levels are for minors in Family
//     Sharing or new accounts in enforcing law-states). The method doesn't change whether
//     someone is a minor, so requiring "confirmed" rejects real adults without catching a
//     single extra kid. `declaration` is recorded for audit; require it only via the
//     opt-in IOS_AGE_REQUIRE_CONFIRMED flag where counsel demands higher assurance.
// ⚠️ Compliance-posture call; revisit with counsel. Anti-forgery is unchanged: the App
// Attest boundary still gates real production.

interface DeclaredAgeAttestation {
  nonce?: string;
  over18?: boolean;
  /** Normalized declaration level from the plugin: self_declared | guardian_declared |
   *  government_id | payment | other | unknown. */
  declaration?: string;
  /** True if the device has any active parental control (managed / child account). */
  parentalControlsActive?: boolean;
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
    const soft = (verified: boolean, reason?: string): AgeVerificationResult =>
      ({ verified, method: 'apple_declared_age_range', nonce: att.nonce, nonceFailClosed: true, reason });

    // (1) Definitive signal required (fail closed for child safety): Apple must have
    //     returned a real 18+/under-18 answer, not a missing/unreadable one.
    if (requireDefinitiveSignal() && typeof att.over18 !== 'boolean') {
      return soft(false, 'We couldn’t read a clear age signal from your iPhone. Please try again.');
    }

    // (2) The KID GATE: an under-18 age band is blocked. This is the primary child gate.
    if (att.over18 !== true) {
      return soft(false, 'Your Apple Account shows you’re under 18, so this adult content isn’t available.');
    }

    // (3) Managed / child device: block on any active parental control (default on).
    if (blockOnParentalControls() && att.parentalControlsActive === true) {
      return soft(false, 'This device has parental controls (a managed or child account), so adult content can’t be enabled here.');
    }

    // (4) Optional higher-assurance gate: require an Apple-CONFIRMED declaration. OFF by
    //     default (Apple reports self_declared for most adults); on only where counsel
    //     requires it. The age band already keeps minors out regardless.
    if (requireConfirmedDeclaration()) {
      const declaration = typeof att.declaration === 'string' ? att.declaration : 'unknown';
      if (!CONFIRMED_AGE_DECLARATIONS.has(declaration)) {
        return soft(false, UNCONFIRMED_AGE_GUIDANCE);
      }
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
