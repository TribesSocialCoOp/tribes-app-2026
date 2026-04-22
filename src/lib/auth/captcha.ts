/**
 * @fileoverview Proof-of-Work CAPTCHA system.
 * 
 * Vendor-free bot protection. Client must compute a SHA-256 hash
 * that meets a difficulty target before form submission.
 * 
 * Designed for easy swap to Cloudflare Turnstile:
 *   - Replace generateChallenge() with Turnstile widget render
 *   - Replace verifyCaptchaToken() with Turnstile siteverify API call
 *   - Component interface stays identical: onVerify(token: string)
 */

import { createHmac, randomBytes } from 'crypto';
import { getSessionSecret } from './session';

const CAPTCHA_SECRET = getSessionSecret();
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DIFFICULTY = 18; // Number of leading zero bits (18 ≈ 1-2s on modern hardware)

/**
 * Generate a PoW challenge for the client to solve.
 */
export function generateChallenge(): { challenge: string; difficulty: number } {
  const timestamp = Date.now().toString(36);
  const nonce = randomBytes(16).toString('hex');
  const payload = `${timestamp}:${nonce}`;
  const hmac = createHmac('sha256', CAPTCHA_SECRET).update(payload).digest('hex');
  
  // Challenge = payload:hmac (client gets this, finds a solution nonce)
  const challenge = `${payload}:${hmac}`;
  
  return { challenge, difficulty: DIFFICULTY };
}

/**
 * Verify a PoW solution token from the client.
 * Token format: "pow:challenge:solutionNonce"
 * 
 * To swap to Turnstile later, replace this function body with:
 *   const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
 *     method: 'POST',
 *     body: JSON.stringify({ secret: TURNSTILE_SECRET_KEY, response: token }),
 *   });
 *   return (await res.json()).success;
 */
export async function verifyCaptchaToken(token: string): Promise<boolean> {
  if (!token) return false;
  
  try {
    const parts = token.split(':');
    if (parts.length !== 4) return false;
    
    const [timestamp36, originalNonce, hmac, solutionNonce] = parts;
    
    // 1. Verify HMAC (prevents forged challenges)
    const payload = `${timestamp36}:${originalNonce}`;
    const expectedHmac = createHmac('sha256', CAPTCHA_SECRET).update(payload).digest('hex');
    if (hmac !== expectedHmac) return false;
    
    // 2. Check timestamp (prevent replay with old challenges)
    const timestamp = parseInt(timestamp36, 36);
    if (Date.now() - timestamp > CHALLENGE_TTL_MS) return false;
    
    // 3. Verify the hash meets difficulty target
    const hashInput = `${timestamp36}:${originalNonce}:${hmac}:${solutionNonce}`;
    // Use Web Crypto compatible approach - hash with node crypto
    const { createHash } = await import('crypto');
    const hash = createHash('sha256').update(hashInput).digest();
    
    // Check leading zero bits
    let zeroBits = 0;
    for (const byte of hash) {
      if (byte === 0) {
        zeroBits += 8;
      } else {
        // Count leading zero bits in this byte
        let b = byte;
        while ((b & 0x80) === 0 && zeroBits < DIFFICULTY) {
          zeroBits++;
          b <<= 1;
        }
        break;
      }
      if (zeroBits >= DIFFICULTY) break;
    }
    
    return zeroBits >= DIFFICULTY;
  } catch (err) {
    console.error('[captcha] Verification error:', err);
    return false;
  }
}
