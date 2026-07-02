/**
 * Google Wallet age-verification provider — OpenID4VP / mso_mdoc over the Digital
 * Credentials API, verified server-side against IACA trust anchors (issue #32).
 *
 * Enabled once the Google Wallet *sandbox* RP credentials are in env (GOOGLE_WALLET_*).
 * Those are issued by Google's sandbox and are drop-in — see ./config and
 * https://developers.google.com/wallet/identity/verify/sandbox
 *
 * Selective disclosure of age_over_18 (privacy-preserving). ZKP mode (mso_mdoc_zk /
 * longfellow-zk) is a future enhancement layered on the same flow.
 */
import type { AgeVerificationProvider, AgeVerificationRequest, AgeVerificationResult, AgeVerificationContext } from '../types';
import { ProviderUnavailableError } from '../types';
import { loadWalletConfig } from '../config';
import { walletVerifyEnabled } from '@/lib/geo/age-policy';

export const googleWalletProvider: AgeVerificationProvider = {
  id: 'google_wallet',
  label: 'Verify with Google Wallet',
  isAvailable() {
    // PARKED (2026-07): Google Wallet verification isn't launched — no production RP
    // creds until we can device-test it. Gated behind the same NEXT_PUBLIC_WALLET_VERIFY_ENABLED
    // flag that re-opens the law-state `verify` tier, so provider + tier ungate together.
    // Still also requires the GOOGLE_WALLET_* config to be present.
    return walletVerifyEnabled() && loadWalletConfig('GOOGLE_WALLET') !== null;
  },
  async verify(req: AgeVerificationRequest, ctx: AgeVerificationContext): Promise<AgeVerificationResult> {
    const cfg = loadWalletConfig('GOOGLE_WALLET');
    if (!cfg) throw new ProviderUnavailableError('google_wallet');

    const data = req.attestation as { verifierState?: string; origin?: string; response?: unknown } | undefined;
    if (!data?.verifierState || !data?.origin) throw new Error('Missing attestation envelope.');

    const { verifyAgeResponse } = await import('../oid4vp');
    const { verified, nonce } = await verifyAgeResponse(cfg, {
      attestation: data.response ?? data,
      verifierState: data.verifierState,
      origin: data.origin,
      expectedUserId: ctx.expectedUserId,
    });
    return { verified, method: 'google_zkp', nonce };
  },
};
