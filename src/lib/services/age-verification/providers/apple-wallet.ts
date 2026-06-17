/**
 * Apple Wallet age-verification provider (ID-in-Wallet: mDL or US passport).
 *
 * STUB — not yet configured. Real flow mirrors the Google provider: an OpenID4VP
 * presentment of a selective-disclosure age_over_18 claim from Apple Wallet's Digital ID
 * (state mDL where available, or the nationwide US-passport Digital ID), verified
 * server-side against IACA roots + device signature.
 *
 * Native iOS triggers presentment through a custom Capacitor plugin; the resulting
 * attestation is POSTed here for verification. Method is recorded as apple_wallet_mdl
 * or apple_wallet_passport based on the credential doctype.
 *
 * Becomes available once APPLE_WALLET_RP_* env is configured.
 */
import type { AgeVerificationProvider, AgeVerificationRequest, AgeVerificationResult } from '../types';
import { ProviderUnavailableError } from '../types';

export const appleWalletProvider: AgeVerificationProvider = {
  id: 'apple_wallet',
  label: 'Verify with Apple Wallet',
  isAvailable() {
    return Boolean(process.env.APPLE_WALLET_RP_ID && process.env.APPLE_WALLET_DECRYPT_KEY);
  },
  async verify(_req: AgeVerificationRequest): Promise<AgeVerificationResult> {
    // TODO(#32): implement OpenID4VP/mdoc verification; map doctype → method.
    throw new ProviderUnavailableError('apple_wallet');
  },
};
