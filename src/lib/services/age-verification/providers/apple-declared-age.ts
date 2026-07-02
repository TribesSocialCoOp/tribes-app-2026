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

const isProd = () => process.env.NODE_ENV === 'production';

/**
 * Phase-2 gate: has the App Attest anti-forgery verification been implemented + enabled?
 * While false, an unattested boolean is never trusted in production. Flip to true only
 * once the App Attest assertion is verified below (and set the backing env in prod).
 */
function appAttestProdTrusted(): boolean {
  return process.env.IOS_AGE_APP_ATTEST_ENABLED === 'true';
}

/**
 * Declaration levels (normalized by the native plugin) that count as high-assurance
 * for a US law state. Bare self-declaration is the SAME assurance as the web opt-in we
 * geo-block those states to avoid, so it is NOT accepted here. `other` is excluded
 * conservatively. ⚠️ Confirm this set with counsel before prod (Decision 2).
 */
const CONFIRMED_DECLARATIONS = new Set(['government_id', 'payment']);

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
    if (att.over18 !== true) {
      return { verified: false, method: 'apple_declared_age_range', nonce: att.nonce };
    }

    const declaration = typeof att.declaration === 'string' ? att.declaration : 'unknown';
    if (!CONFIRMED_DECLARATIONS.has(declaration)) {
      // Self-declared / guardian / other → not high-assurance enough for a law state.
      // Return not-verified (a soft "didn't succeed") rather than throw (which the action
      // maps to "method unavailable" — misleading; the method ran, the age just isn't
      // confirmed). The client explains that iOS must have a confirmed age.
      return { verified: false, method: 'apple_declared_age_range', nonce: att.nonce };
    }

    // ── App Attest boundary ──────────────────────────────────────────────────────
    // Phase 2: verify att.appAttest is a valid DCAppAttest assertion from a genuine
    // instance of this app over `att.nonce`, then trust. Until implemented, an
    // unattested boolean is accepted ONLY outside production (dev/staging testing).
    if (isProd() && !appAttestProdTrusted()) {
      throw new Error('iOS age verification is not enabled in production yet (App Attest pending).');
    }
    // TODO(app-attest): verify DCAppAttest assertion `att.appAttest` binds a genuine app
    // instance to `att.nonce`; reject on failure. Then appAttestProdTrusted() can be true.

    return { verified: true, method: 'apple_declared_age_range', nonce: att.nonce };
  },
};
