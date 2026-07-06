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
import { evaluateOsAgeSignal, isRealProd, type OsAgeReasonCode } from '@/lib/age-verification/os-age-policy';
import { iosAppAttestEnabled, assertAttestation } from '@/lib/services/age-verification/app-attest';
import { buildAppAttestPayload } from '@/lib/age-verification/app-attest-payload';

// ── Child-safety policy flags (server-side env, runtime-tunable — no rebuild) ────────
// The shared decision lives in os-age-policy.ts (also used by Android Play Age Signals);
// here we just read the iOS-specific env and map reason codes to iOS copy.
const iosFlags = () => ({
  /** Block managed/child devices even if the band claims 18+. Default ON. */
  blockOnParentalControls: process.env.IOS_AGE_BLOCK_ON_PARENTAL_CONTROLS !== 'false',
  /** Require an Apple-CONFIRMED declaration (rejects bare self_declared). Default OFF —
   *  Apple returns self_declared for most adults, so ON rejects them; enable only where
   *  counsel demands higher assurance. */
  requireConfirmed: process.env.IOS_AGE_REQUIRE_CONFIRMED === 'true',
});

/** iOS-flavored copy for each shared reason code. */
const IOS_REASONS: Record<OsAgeReasonCode, string> = {
  no_signal: 'We couldn’t read a clear age signal from your iPhone. Please try again.',
  under_18: 'Your Apple Account shows you’re under 18, so this adult content isn’t available.',
  supervised: 'This device has parental controls (a managed or child account), so adult content can’t be enabled here.',
  unconfirmed: 'Your Apple Account isn’t independently age-confirmed. Add a card to your Apple Account or complete an ID check, then try again.',
};

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
  /** App Attest: the device's attested key id + assertion (base64) over SHA256 of the
   *  canonical payload (nonce + claims — see app-attest-payload.ts). */
  keyId?: string;
  assertion?: string;
}

export const appleDeclaredAgeProvider: AgeVerificationProvider = {
  id: 'apple_declared_age_range',
  label: 'Confirm your age with the App Store',
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

    // Normalize Apple's signal into the shared model, then run the shared decision so iOS
    // and Android stay identical. `confirmed` = an Apple-verified declaration level.
    const declaration = typeof att.declaration === 'string' ? att.declaration : 'unknown';
    const decision = evaluateOsAgeSignal(
      {
        over18: att.over18,
        parentalControlsActive: att.parentalControlsActive === true,
        confirmed: CONFIRMED_AGE_DECLARATIONS.has(declaration),
      },
      iosFlags(),
    );
    if (!decision.verified) return soft(false, IOS_REASONS[decision.reasonCode!]);

    // ── App Attest boundary ──────────────────────────────────────────────────────
    // When enabled, REQUIRE a valid App Attest assertion — a real cryptographic proof
    // that a genuine, unmodified instance of our app produced THIS EXACT submission:
    // the signature covers the canonical payload (nonce + over18 + declaration +
    // parental-controls), rebuilt here from the submitted fields, so swapping any
    // claim after signing invalidates it. Enforced on staging AND prod (TestFlight
    // attests in the production environment). `assertAttestation` throws on any
    // failure (missing/unregistered key, bad signature, replayed counter).
    if (iosAppAttestEnabled()) {
      await assertAttestation({
        keyId: att.keyId,
        assertionBase64: att.assertion,
        payload: buildAppAttestPayload({
          nonce: att.nonce,
          over18: att.over18,
          declaration: att.declaration,
          parentalControlsActive: att.parentalControlsActive,
        }),
        userId: ctx.expectedUserId,
      });
    } else if (isRealProd()) {
      // Attest not enabled yet — never trust an unsigned result in real production.
      // Dev + staging (TRIBES_ENV=staging) still trust it here for pre-attest testing.
      throw new Error('iOS age verification is not enabled in production yet (App Attest pending).');
    }

    return soft(true);
  },
};
