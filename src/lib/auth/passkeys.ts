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
const ANDROID_ORIGIN = process.env.WEBAUTHN_ANDROID_ORIGIN || '';

function getExpectedOrigins(): string[] {
  const origins = [ORIGIN];
  if (ANDROID_ORIGIN) {
    const androidOrigins = ANDROID_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);
    origins.push(...androidOrigins);
  }
  return origins;
}

// -------------------------------------------------------------------------
// REGISTRATION
// -------------------------------------------------------------------------

export async function startRegistration(userId: string, name?: string, email?: string) {
  let userDisplayName = name;
  let userName = email || name;

  if (!userDisplayName || !userName) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) throw new Error('User not found');
    userDisplayName = user.name;
    userName = user.email || user.name;
  }

  const userCredentials = await db.query.credentials.findMany({
    where: eq(credentials.userId, userId),
  });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: Uint8Array.from(userId, (c) => c.charCodeAt(0)),
    userName: userName!,
    userDisplayName: userDisplayName!,
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

export async function finishRegistration(
  userId: string,
  body: RegistrationResponseJSON,
  name?: string,
  email?: string
) {
  const challenge = (await cookies()).get('webauthn_challenge')?.value;
  if (!challenge) throw new Error('Challenge not found');

  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge: challenge,
    expectedOrigin: getExpectedOrigins(),
    expectedRPID: RP_ID,
  });

  const { verified, registrationInfo } = verification;

  if (verified && registrationInfo) {
    const { credential } = registrationInfo;
    const { id, publicKey, counter } = credential;

    // credential.id is already a base64url string in v10 or needs to be encoded
    const credentialIdBase64 = typeof id === 'string' ? id : Buffer.from(id).toString('base64url');

    // Run user insert (if deferred) and credential insert in a transaction
    await db.transaction(async (tx) => {
      if (name && email) {
        const existingUser = await tx.query.users.findFirst({
          where: eq(users.id, userId),
        });

        if (!existingUser) {
          const { generateUniqueSlug } = await import('@/lib/utils/slugify');
          const userSlug = await generateUniqueSlug(name, async (candidate) => {
            const existing = await tx.query.users.findFirst({
              where: eq(users.slug, candidate),
            });
            return !!existing;
          });

          await tx.insert(users).values({
            id: userId,
            name,
            email,
            role: 'Human_Free',
            ageConfirmedAt: new Date(),
            slug: userSlug,
            createdAt: new Date(),
          });
        }
      }

      await tx.insert(credentials).values({
        id: credentialIdBase64,
        userId,
        publicKey: Buffer.from(publicKey),
        counter,
        createdAt: new Date(),
      });
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
    expectedOrigin: getExpectedOrigins(),
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
