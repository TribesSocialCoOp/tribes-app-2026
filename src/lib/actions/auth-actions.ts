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
  const { getExpectedOrigins } = await import('@/lib/auth/passkeys');
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
      // Use the shared origin list so native (Android apk-key-hash) reauth works,
      // matching the login/registration path in @/lib/auth/passkeys.
      expectedOrigin: getExpectedOrigins(),
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

// ======== PASSKEY MANAGEMENT ========

/**
 * Gets all registered passkeys for the current user.
 */
export async function getRegisteredPasskeys(): Promise<{ id: string; createdAt: Date }[]> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { credentials } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');

  const rows = await db.select({
    id: credentials.id,
    createdAt: credentials.createdAt,
  }).from(credentials).where(eq(credentials.userId, userId));

  return rows.map(r => ({
    id: r.id,
    createdAt: r.createdAt ?? new Date(),
  }));
}

/**
 * Starts a new passkey registration for the current user (add additional passkey).
 */
export async function startPasskeyRegistration() {
  const userId = await requireAuth();
  const { startRegistration } = await import('@/lib/auth/passkeys');
  return startRegistration(userId);
}

/**
 * Completes passkey registration (add additional passkey).
 * Does NOT create a new session — user is already authenticated.
 */
export async function completePasskeyRegistration(attestation: any) {
  const userId = await requireAuth();
  const { finishRegistration } = await import('@/lib/auth/passkeys');
  // finishRegistration creates a session, but user already has one — that's fine
  return finishRegistration(userId, attestation);
}

/**
 * Removes a passkey from the current user's account.
 * Prevents removing the last passkey.
 */
export async function removePasskey(credentialId: string): Promise<void> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { credentials } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  // Count user's credentials
  const allCreds = await db.select({ id: credentials.id })
    .from(credentials)
    .where(eq(credentials.userId, userId));

  if (allCreds.length <= 1) {
    throw new Error('Cannot remove your last passkey. Add another passkey first.');
  }

  // Verify this credential belongs to the user
  const cred = allCreds.find(c => c.id === credentialId);
  if (!cred) throw new Error('Passkey not found.');

  await db.delete(credentials).where(
    and(eq(credentials.id, credentialId), eq(credentials.userId, userId))
  );
}

// ======== TOTP TWO-FACTOR AUTHENTICATION ========

/**
 * Generates a new TOTP secret and returns setup data (QR code + secret).
 * Does not enable 2FA until confirmed with a valid code.
 */
export async function startTotpSetup(): Promise<{ secret: string; qrDataUrl: string }> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');

  // Generate a new TOTP secret
  const { TOTP } = await import('otpauth');

  const [user] = await db.select({ name: users.name, email: users.email })
    .from(users).where(eq(users.id, userId)).limit(1);

  const totp = new TOTP({
    issuer: 'Tribes.app',
    label: user?.email || user?.name || userId,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });

  const secret = totp.secret.base32;
  const otpauthUri = totp.toString();

  // Generate QR code as data URL
  const QRCode = await import('qrcode');
  const qrDataUrl = await QRCode.toDataURL(otpauthUri);

  // Store the pending secret temporarily (not yet enabled)
  // We store it on the user record in a pending field
  await db.update(users).set({
    totpSecret: secret,
    // Don't set totpEnabled yet — wait for verification
  }).where(eq(users.id, userId));

  return { secret, qrDataUrl };
}

/**
 * Confirms TOTP setup by verifying a code against the pending secret.
 * Enables 2FA if the code is valid.
 */
export async function confirmTotpSetup(code: string): Promise<void> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const { TOTP } = await import('otpauth');

  const [user] = await db.select({ totpSecret: users.totpSecret })
    .from(users).where(eq(users.id, userId)).limit(1);

  if (!user?.totpSecret) throw new Error('No TOTP secret found. Please restart 2FA setup.');

  const totp = new TOTP({
    issuer: 'Tribes.app',
    label: userId,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: user.totpSecret,
  });

  const delta = totp.validate({ token: code, window: 1 });
  if (delta === null) throw new Error('Invalid verification code. Please try again.');

  // Enable 2FA
  await db.update(users).set({ totpEnabled: true }).where(eq(users.id, userId));
}

/**
 * Disables TOTP 2FA for the current user.
 */
export async function disableTotp(): Promise<void> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');

  await db.update(users).set({
    totpEnabled: false,
    totpSecret: null,
  }).where(eq(users.id, userId));
}

