/**
 * @fileoverview Cloudflare Turnstile server-side validation service.
 *
 * Turnstile is a frictionless CAPTCHA replacement — no puzzles, no image grids.
 * It validates that a client completed a challenge, making scripted signups
 * significantly more expensive for bot operators.
 *
 * Setup:
 *   1. Create a widget at https://dash.cloudflare.com → Turnstile
 *   2. Add to .env:
 *        NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x...
 *        TURNSTILE_SECRET_KEY=0x...
 *   3. For development/testing, use the always-pass site key:
 *        NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
 *        TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
 *
 * In production, if TURNSTILE_SECRET_KEY is not set, validation is skipped
 * with a warning (so existing deployments don't break before the env var is added).
 */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

/**
 * Validates a Turnstile challenge token server-side.
 * Throws if the token is invalid or missing.
 *
 * @deprecated — ALTCHA is now the primary challenge. This function will be removed in a future release.
 * @param token - The `cf-turnstile-response` value from the client form submission
 * @param remoteIp - Optional: the client's IP address for additional Cloudflare context
 */
export async function validateTurnstileToken(token: string | null | undefined, remoteIp?: string): Promise<void> {
  console.warn('[turnstile] DEPRECATED — ALTCHA is now the primary challenge. This function will be removed in a future release.');
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    // Graceful degradation: warn but don't block if not configured yet
    console.warn('[turnstile] TURNSTILE_SECRET_KEY not set — skipping validation. Set this env var to enable bot protection.');
    return;
  }

  if (!token) {
    // Widget may not have fired (CSP restrictions, ad blockers, etc.)
    // Other layers (subnet rate limit, IP rate limit) still protect the endpoint.
    console.warn('[turnstile] No token provided — skipping challenge. Subnet/IP rate limits still active.');
    return;
  }

  const body: Record<string, string> = {
    secret: secretKey,
    response: token,
  };
  if (remoteIp) body.remoteip = remoteIp;

  let data: TurnstileResponse;
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Tokens expire after 5 minutes — don't cache
      cache: 'no-store',
    });
    data = await res.json();
  } catch (e) {
    console.error('[turnstile] Network error during verification:', e);
    // Fail open on network errors — don't block legit users due to Cloudflare outage
    return;
  }

  if (!data.success) {
    const codes = data['error-codes']?.join(', ') ?? 'unknown';
    console.warn(`[turnstile] Validation failed: ${codes}`);
    throw new Error('Bot check failed. Please refresh the page and try again.');
  }
}
