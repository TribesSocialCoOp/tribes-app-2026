/**
 * Google Wallet age-verification provider (Digital Credentials API / OpenID4VP).
 *
 * STUB — not yet configured. This is where the real high-assurance verification goes:
 *   1. Decrypt the OpenID4VP JWE response with our private key.
 *   2. Rebuild the ISO 18013-5 session transcript from our nonce + key thumbprint.
 *   3. Validate the issuer cert chain against IACA roots; verify MSO + device signatures.
 *   4. For ZKP mode (mso_mdoc_zk): verify the proof with longfellow-zk.
 *   5. Confirm the asserted claim is exactly age_over_18 = true; discard everything else.
 *
 * Becomes available once GOOGLE_WALLET_RP_* env (RP id, decryption key, IACA trust store)
 * is configured. Until then isAvailable() returns false so the client won't offer it.
 */
import type { AgeVerificationProvider, AgeVerificationRequest, AgeVerificationResult } from '../types';
import { ProviderUnavailableError } from '../types';

export const googleWalletProvider: AgeVerificationProvider = {
  id: 'google_wallet',
  label: 'Verify with Google Wallet',
  isAvailable() {
    // Requires RP onboarding + decryption key + IACA trust store. Not yet wired.
    return Boolean(process.env.GOOGLE_WALLET_RP_ID && process.env.GOOGLE_WALLET_DECRYPT_KEY);
  },
  async verify(_req: AgeVerificationRequest): Promise<AgeVerificationResult> {
    // TODO(#32): implement OpenID4VP/mdoc + ZKP (longfellow-zk) verification.
    throw new ProviderUnavailableError('google_wallet');
  },
};
