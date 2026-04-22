/**
 * @fileoverview CSRF Protection — Double-Submit Cookie Pattern
 * 
 * How it works:
 * 1. Proxy sets a random CSRF token as a cookie (SameSite=Strict, NOT httpOnly)
 * 2. Client reads the cookie and sends the token with each mutating action
 * 3. Server validates the submitted token matches the cookie value
 * 
 * This prevents cross-site form submissions because:
 * - The attacker's site can trigger a POST that sends the cookie (browser does this automatically)
 * - But the attacker cannot READ the cookie value (SameSite=Strict blocks cross-site reads)
 * - So the attacker cannot include the token in the form body
 */

import { cookies } from 'next/headers';
import crypto from 'crypto';

export const CSRF_COOKIE_NAME = '__tribes_csrf';

/**
 * Generates a cryptographically secure CSRF token (32 hex chars).
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Server-side validation: compare submitted token against cookie value.
 * Call this at the top of every mutating server action.
 * 
 * @throws Error if tokens don't match or are missing
 */
export async function validateCsrfToken(submittedToken?: string): Promise<void> {
  // Skip in development for DX convenience during testing
  if (process.env.NODE_ENV === 'development' && process.env.ENFORCE_CSRF !== 'true') {
    return;
  }

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;

  if (!cookieToken || !submittedToken) {
    throw new Error('CSRF validation failed: missing token');
  }

  // Use timing-safe comparison to prevent timing attacks
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(submittedToken);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('CSRF validation failed: token mismatch');
  }
}
