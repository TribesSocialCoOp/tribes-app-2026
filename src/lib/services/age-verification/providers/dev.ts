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
    // SECURITY: a simulated "always 18+" provider must NEVER be reachable in
    // production, regardless of any env flag — hard-off in prod. (Staging that
    // needs it must not run with NODE_ENV=production.)
    if (process.env.NODE_ENV === 'production') return false;
    return true;
  },
  async verify(): Promise<AgeVerificationResult> {
    return { verified: true, method: 'dev' };
  },
};
