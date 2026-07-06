/**
 * On-device age-verification provider (issue #32) — Privately SDK.
 *
 * Unlike the wallet providers, the age check runs ON THE DEVICE (camera + model),
 * so it works on iOS/Android/web alike and never touches Apple/Google Wallet. The
 * device produces a SIGNED credential (Privately/Privado verifiable credential)
 * that this provider validates server-side — we never trust a raw client boolean.
 *
 * Until the certified Privately SDK is wired in, a DEV STUB lets us exercise the
 * full gate → verify → unlock flow via Capacitor. The stub is HARD-REJECTED in
 * production, so it can never become a rubber stamp.
 */
import type {
  AgeVerificationProvider,
  AgeVerificationRequest,
  AgeVerificationResult,
  AgeVerificationContext,
} from '../types';
import { ProviderUnavailableError } from '../types';

const isProd = () => process.env.NODE_ENV === 'production';

/** True once the real Privately/Privado credential-verification keys are configured. */
function privatelyConfigured(): boolean {
  return !!process.env.PRIVATELY_VERIFY_PUBLIC_KEY;
}

export const privatelyProvider: AgeVerificationProvider = {
  id: 'privately',
  label: 'Verify with on-device age check',
  isAvailable() {
    // PARKED (2026-07): the on-device age-estimation path is pulled for now. The
    // open-source model choice + weights licensing + hardware-attestation trust model
    // aren't settled yet (see memory: ondevice-age-model-pivot). Returning false hides
    // the "on-device age check" button everywhere (dev + prod), leaving wallet + dev.
    // To revive: restore `return privatelyConfigured() || !isProd();`.
    return false;
  },
  async verify(req: AgeVerificationRequest, ctx: AgeVerificationContext): Promise<AgeVerificationResult> {
    const att = req.attestation as { kind?: string; ageOver18?: boolean; userId?: string } | undefined;
    if (!att || typeof att !== 'object') throw new Error('Missing on-device attestation.');

    // ── DEV STUB ── never accepted in production.
    if (att.kind === 'stub') {
      if (isProd()) throw new Error('Stub on-device attestation rejected in production.');
      if (att.userId !== ctx.expectedUserId) throw new Error('Attestation not bound to this user.');
      return { verified: att.ageOver18 === true, method: 'privately' };
    }

    // ── REAL signed on-device credential (Privately/Privado) ──
    if (!privatelyConfigured()) throw new ProviderUnavailableError('privately');
    // TODO(privately-sdk): verify the credential signature against
    // PRIVATELY_VERIFY_PUBLIC_KEY, confirm its server-issued challenge maps to
    // ctx.expectedUserId (C2 binding) and is single-use (C1), then read age_over_18.
    throw new Error('Privately on-device credential verification not yet implemented (SDK pending).');
  },
};
