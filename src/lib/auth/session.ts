import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// SESSION SECRET — fail-fast in production if not set
// ============================================================

const DEV_FALLBACK = 'dev-only-fallback-secret-32-chars!';

/**
 * Returns the session signing key. Throws in production if SESSION_SECRET is missing.
 * Exported so captcha.ts and auth-actions.ts can share the same secret derivation.
 */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;

  // Accept a real secret that isn't the dev placeholder
  if (secret && secret !== DEV_FALLBACK) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL: SESSION_SECRET environment variable is not set or is using the dev fallback. ' +
      'Refusing to start with a weak secret in production. ' +
      'Generate one with: openssl rand -hex 32'
    );
  }

  return DEV_FALLBACK;
}

const key = new TextEncoder().encode(getSessionSecret());

export const SESSION_COOKIE_NAME = 'tribes_session';

// ============================================================
// JWT PAYLOAD TYPE
// ============================================================

export interface SessionPayload {
  userId: string;
  sessionId: string;
  expires: Date;
  deletionRequestedAt?: string | null; // ISO string if pending deletion
}

export async function encrypt(payload: SessionPayload) {
  return await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);
}

export async function decrypt(input: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(input, key, {
    algorithms: ['HS256'],
  });
  return payload as unknown as SessionPayload;
}

export async function createSession(userId: string) {
  const { db } = await import('@/db');
  const { sessions } = await import('@/db/schema');

  const sessionId = crypto.randomUUID();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Read user-agent for device tracking
  let userAgent: string | null = null;
  try {
    const hdrs = await headers();
    userAgent = hdrs.get('user-agent');
  } catch { /* headers not available in some contexts */ }

  // Write session row to DB
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt: expires,
    createdAt: new Date(),
    userAgent,
  });

  // Check if user has pending deletion
  const { users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [user] = await db.select({ deletionRequestedAt: users.deletionRequestedAt })
    .from(users).where(eq(users.id, userId)).limit(1);

  // Embed sessionId in the JWT cookie
  const session = await encrypt({
    userId,
    sessionId,
    expires,
    deletionRequestedAt: user?.deletionRequestedAt?.toISOString() ?? null,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, session, {
    expires,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

export async function deleteSession() {
  // Revoke the DB session if we can read it
  try {
    const session = await getSession();
    if (session?.sessionId) {
      const { db } = await import('@/db');
      const { sessions } = await import('@/db/schema');
      const { eq } = await import('drizzle-orm');
      await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.sessionId));
    }
  } catch { /* best effort */ }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, '', { expires: new Date(0), path: '/' });
}

export async function getSession() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!session) return null;
  try {
    return await decrypt(session);
  } catch {
    return null;
  }
}

export async function updateSession(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!session) return;

  // Refresh the session so it doesn't expire
  const parsed = await decrypt(session);
  parsed.expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const res = NextResponse.next();
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: await encrypt(parsed),
    httpOnly: true,
    expires: parsed.expires,
  });
  return res;
}
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  return session.userId as string;
}

export async function getCurrentSessionId(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  return (session.sessionId as string) || null;
}
