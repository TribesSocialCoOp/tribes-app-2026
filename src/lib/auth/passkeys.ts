import { 
  generateRegistrationOptions, 
  verifyRegistrationResponse, 
  generateAuthenticationOptions, 
  verifyAuthenticationResponse 
} from '@simplewebauthn/server';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
import { db } from '@/db';
import { credentials, users, userAliases } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { createSession } from './session';
import { cookies } from 'next/headers';

const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'Tribes.app';
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:9002';

// -------------------------------------------------------------------------
// REGISTRATION
// -------------------------------------------------------------------------

export async function startRegistration(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) throw new Error('User not found');

  const userCredentials = await db.query.credentials.findMany({
    where: eq(credentials.userId, userId),
  });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: Uint8Array.from(user.id, (c) => c.charCodeAt(0)),
    userName: user.name,
    userDisplayName: user.name,
    attestationType: 'none',
    excludeCredentials: userCredentials.map((cred) => ({
      id: cred.id, // cred.id is the base64url credential ID
      type: 'public-key',
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
    },
    extensions: {
      prf: {}, // Request PRF support during registration
    } as unknown as Record<string, unknown>,
  });

  // Store challenge in a cookie for verification
  (await cookies()).set('webauthn_challenge', options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 5, // 5 minutes
  });

  return options;
}

export async function finishRegistration(userId: string, body: RegistrationResponseJSON) {
  const challenge = (await cookies()).get('webauthn_challenge')?.value;
  if (!challenge) throw new Error('Challenge not found');

  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge: challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });

  const { verified, registrationInfo } = verification;

  if (verified && registrationInfo) {
    const { credential } = registrationInfo;
    const { id, publicKey, counter } = credential;

    // credential.id is already a base64url string in v10 or needs to be encoded
    const credentialIdBase64 = typeof id === 'string' ? id : Buffer.from(id).toString('base64url');

    await db.insert(credentials).values({
      id: credentialIdBase64,
      userId,
      publicKey: Buffer.from(publicKey),
      counter,
      createdAt: new Date(),
    });

    // Auto-login after successful registration
    await createSession(userId);

    return { success: true };
  }

  throw new Error('Registration verification failed');
}

// -------------------------------------------------------------------------
// AUTHENTICATION
// -------------------------------------------------------------------------

export async function startAuthentication() {
  // NOTE: The PRF extension is NOT included here.
  // generateAuthenticationOptions returns JSON (PublicKeyCredentialRequestOptionsJSON),
  // and Node Buffer / Uint8Array values in extensions don't survive JSON serialization.
  // The PRF extension is injected client-side in the login page where a real
  // Uint8Array can be created in the browser's memory space.
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'preferred',
  });

  (await cookies()).set('webauthn_challenge', options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 5,
  });

  return options;
}

export async function finishAuthentication(body: AuthenticationResponseJSON) {
  const challenge = (await cookies()).get('webauthn_challenge')?.value;
  if (!challenge) throw new Error('Challenge not found');

  // We need to find the credential to get the public key
  const credentialId = body.id;
  const dbCredential = await db.query.credentials.findFirst({
    where: eq(credentials.id, credentialId),
  });

  if (!dbCredential) throw new Error('Credential not found');

  const verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge: challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: dbCredential.id,
      publicKey: new Uint8Array(dbCredential.publicKey as Buffer),
      counter: dbCredential.counter ?? 0,
    },
  });

  const { verified, authenticationInfo } = verification;

  if (verified && authenticationInfo) {
    const { newCounter } = authenticationInfo;

    // Update counter
    await db.update(credentials)
      .set({ counter: newCounter })
      .where(eq(credentials.id, dbCredential.id));

    // Create session
    await createSession(dbCredential.userId);

    return { success: true, userId: dbCredential.userId };
  }

  throw new Error('Authentication verification failed');
}
