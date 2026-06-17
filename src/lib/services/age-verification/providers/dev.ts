/**
 * Dev/staging age-verification provider.
 *
 * Lets us exercise the REAL gate loop (gate → verify → flag set → gate opens)
 * locally without a wallet credential or manual DB edits. It performs no real
 * attestation, so it is HARD-DISABLED in production.
 *
 * Enabled when NODE_ENV !== 'production', or explicitly via AGE_VERIFICATION_ALLOW_DEV=true
 * (e.g. to test on a staging deployment). Never set that flag in production.
 */
import type { AgeVerificationProvider, AgeVerificationResult } from '../types';

export const devProvider: AgeVerificationProvider = {
  id: 'dev',
  label: 'Dev: simulate 18+ verification',
  isAvailable() {
    if (process.env.AGE_VERIFICATION_ALLOW_DEV === 'true') return true;
    return process.env.NODE_ENV !== 'production';
  },
  async verify(): Promise<AgeVerificationResult> {
    return { verified: true, method: 'dev' };
  },
};
