/**
 * Apple Wallet age-verification provider — ID-in-Wallet (state mDL or the nationwide
 * US-passport Digital ID) presented over OpenID4VP, verified the same way as Google
 * (issue #32). On native iOS the attestation comes from a Capacitor plugin; on web it
 * comes from the Digital Credentials API. Shares the OID4VP/mdoc verifier.
 *
 * Enabled once APPLE_WALLET_* sandbox/RP credentials are in env. See ./config.
 */
import type { AgeVerificationProvider, AgeVerificationRequest, AgeVerificationResult, AgeVerificationContext } from '../types';
import { ProviderUnavailableError } from '../types';
import { loadWalletConfig } from '../config';

export const appleWalletProvider: AgeVerificationProvider = {
  id: 'apple_wallet',
  label: 'Verify with Apple Wallet',
  isAvailable() {
    // DISABLED (2026-07): Apple prohibits using Apple Wallet / its Digital ID for adult
    // (18+) content age-gating, so we must never offer it as an age-verification method
    // for NSFW access — regardless of whether APPLE_WALLET_* creds are configured. The
    // verify() path is kept for the OID4VP/mdoc shape but is unreachable while disabled.
    return false;
  },
  async verify(req: AgeVerificationRequest, ctx: AgeVerificationContext): Promise<AgeVerificationResult> {
    const cfg = loadWalletConfig('APPLE_WALLET');
    if (!cfg) throw new ProviderUnavailableError('apple_wallet');

    const data = req.attestation as { verifierState?: string; origin?: string; response?: unknown } | undefined;
    if (!data?.verifierState || !data?.origin) throw new Error('Missing attestation envelope.');

    const { verifyAgeResponse } = await import('../oid4vp');
    const { verified, docType, nonce } = await verifyAgeResponse(cfg, {
      attestation: data.response ?? data,
      verifierState: data.verifierState,
      origin: data.origin,
      expectedUserId: ctx.expectedUserId,
    });
    // Derive the method from the CRYPTOGRAPHICALLY VERIFIED docType, not a client
    // envelope field — the recorded method must reflect what was actually proven.
    const method = docType?.toLowerCase().includes('passport') ? 'apple_wallet_passport' : 'apple_wallet_mdl';
    return { verified, method, nonce };
  },
};
