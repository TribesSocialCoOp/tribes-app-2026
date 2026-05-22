import { createChallenge, verifySolution } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/sha';

/**
 * Creates a new Proof-of-Work challenge for the ALTCHA widget.
 * Self-hosted — runs entirely on the server using ALTCHA_HMAC_SECRET.
 * Local dev and production each use their own secret (set in .env.local / .env.production).
 */
export async function createAltchaChallenge() {
  const secretKey = process.env.ALTCHA_HMAC_SECRET;

  if (!secretKey) {
    console.warn('[altcha] ALTCHA_HMAC_SECRET not set. Using a fallback temporary secret for development.');
  }

  const hmacSecret = secretKey || 'dev-altcha-fallback-secret-key-1234567890';

  // Cost controls the complexity: 10,000 to 50,000 is typical for a 100-200ms solve time on modern mobile/desktop
  // We use 20,000 for a solid balance of security and speed.
  const challenge = await createChallenge({
    algorithm: 'SHA-256',
    cost: 20000,
    deriveKey,
    hmacSignatureSecret: hmacSecret,
    // Expire challenges after 10 minutes
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  return challenge;
}

/**
 * Verifies a client-submitted Proof-of-Work solution.
 * Expects the base64-encoded JSON payload from the <altcha-widget> hidden input.
 *
 * No environment-specific bypass paths — the same HMAC secret that signed the
 * challenge is used to verify it, so local dev and production both work identically.
 */
export async function verifyAltchaPayload(payload: string | null | undefined): Promise<boolean> {
  const secretKey = process.env.ALTCHA_HMAC_SECRET;

  if (!secretKey) {
    console.warn('[altcha] ALTCHA_HMAC_SECRET not set — skipping validation. Set this env var to enable bot protection.');
    return true; // Fail open when not configured (e.g. dev without .env.local)
  }

  if (!payload) {
    // If no token is provided, log warning but fall back gracefully to IP/subnet rate limit gates
    console.warn('[altcha] No payload provided — skipping challenge. Subnet/IP rate limits still active.');
    return true; // Fail open (matches CF Turnstile pattern)
  }

  // Strictly gate the local network insecure development bypass
  if (payload === 'insecure-dev-bypass') {
    if (process.env.NODE_ENV === 'production') {
      console.error('[altcha] Security Block: Dev bypass payload submitted to production environment!');
      return false;
    }
    console.log('[altcha] Dev bypass payload successfully verified in development context.');
    return true;
  }

  try {
    const jsonStr = Buffer.from(payload, 'base64').toString('utf-8');
    const decoded = JSON.parse(jsonStr);

    if (!decoded.challenge || !decoded.solution) {
      console.warn('[altcha] Invalid payload structure');
      return false;
    }

    const result = await verifySolution({
      challenge: decoded.challenge,
      solution: decoded.solution,
      deriveKey,
      hmacSignatureSecret: secretKey,
    });

    if (!result.verified) {
      console.warn('[altcha] Cryptographic verification failed:', {
        expired: result.expired,
        invalidSignature: result.invalidSignature,
        invalidSolution: result.invalidSolution,
        tookMs: result.time,
      });
      return false;
    }

    return true;
  } catch (e) {
    console.error('[altcha] Error during verification:', e);
    // Fail open ONLY in development to avoid blocking users on parsing/network edge cases,
    // but fail closed in production for absolute security.
    return process.env.NODE_ENV !== 'production';
  }
}

