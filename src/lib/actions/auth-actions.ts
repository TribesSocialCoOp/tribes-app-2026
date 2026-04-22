'use server';

import { requireAuth } from './shared';

// ======== SESSION MANAGEMENT ========
export async function getActiveSessions() {
  const userId = await requireAuth();
  const { getCurrentSessionId } = await import('@/lib/auth/session');
  const currentSessionId = await getCurrentSessionId();
  const { getActiveSessions: fn } = await import('@/lib/services/session-service');
  return fn(userId, currentSessionId ?? undefined);
}

export async function revokeSession(sessionId: string) {
  const userId = await requireAuth();
  const { revokeSession: fn } = await import('@/lib/services/session-service');
  return fn(sessionId, userId);
}

export async function revokeAllOtherSessions() {
  const userId = await requireAuth();
  const { getCurrentSessionId } = await import('@/lib/auth/session');
  const currentSessionId = await getCurrentSessionId();
  if (!currentSessionId) throw new Error('No active session');
  const { revokeAllOtherSessions: fn } = await import('@/lib/services/session-service');
  return fn(userId, currentSessionId);
}

// ======== WEBSOCKET TOKEN ========
export async function getWsToken(): Promise<string> {
  const userId = await requireAuth();
  const { SignJWT } = await import('jose');
  const { getSessionSecret } = await import('@/lib/auth/session');
  const key = new TextEncoder().encode(getSessionSecret());
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
  return token;
}

// ======== CAPTCHA ========
export async function getCaptchaChallenge(): Promise<{ challenge: string; difficulty: number }> {
  const { generateChallenge } = await import('@/lib/auth/captcha');
  return generateChallenge();
}

// ======== RE-AUTHENTICATION (for destructive operations) ========

/**
 * Generates a passkey authentication challenge for re-authentication.
 * Used as a security gate before destructive operations (e.g., account deletion).
 * Does NOT create a new session — only verifies the user still possesses their passkey.
 */
export async function startReauthChallenge() {
  await requireAuth(); // Must already be logged in
  const { startAuthentication } = await import('@/lib/auth/passkeys');
  return startAuthentication();
}

/**
 * Verifies a passkey response for re-authentication purposes.
 * Returns true if the passkey is valid for the current user, false otherwise.
 * Does NOT create a new session.
 */
export async function verifyReauthChallenge(response: import('@simplewebauthn/server').AuthenticationResponseJSON): Promise<boolean> {
  const currentUserId = await requireAuth();

  const { cookies } = await import('next/headers');
  const { verifyAuthenticationResponse } = await import('@simplewebauthn/server');
  const { db } = await import('@/db');
  const { credentials } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');

  const challenge = (await cookies()).get('webauthn_challenge')?.value;
  if (!challenge) throw new Error('Challenge not found or expired');

  const credentialId = response.id;
  const dbCredential = await db.query.credentials.findFirst({
    where: eq(credentials.id, credentialId),
  });

  if (!dbCredential) return false;

  // Ensure the credential belongs to the current user
  if (dbCredential.userId !== currentUserId) return false;

  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:9002',
      expectedRPID: process.env.WEBAUTHN_RP_ID || 'localhost',
      credential: {
        id: dbCredential.id,
        publicKey: new Uint8Array(dbCredential.publicKey as Buffer),
        counter: dbCredential.counter ?? 0,
      },
    });

    if (verification.verified) {
      // Update counter but don't create a session
      await db.update(credentials)
        .set({ counter: verification.authenticationInfo.newCounter })
        .where(eq(credentials.id, dbCredential.id));
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

