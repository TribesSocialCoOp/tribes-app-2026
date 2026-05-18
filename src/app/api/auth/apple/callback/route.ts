import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users, oauthAccounts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { buildUrl } from '@/lib/url';
import { cookies } from 'next/headers';
import { loginLimiter, getClientIp } from '@/lib/auth/rate-limit';
import { SignJWT, importPKCS8, createRemoteJWKSet, jwtVerify } from 'jose';
import { readFileSync } from 'fs';

/**
 * Apple Sign-In — OAuth 2.0 Callback Handler (POST)
 *
 * Key differences from Google OAuth:
 * 1. Apple POSTs the callback (form_post), not a GET redirect
 * 2. The id_token JWT must be verified against Apple's JWKS
 * 3. Apple only sends the user's name on the FIRST authorization
 * 4. Apple may relay a private email (xxxxx@privaterelay.appleid.com)
 * 5. The client_secret is itself a JWT signed with the .p8 key
 */

const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_ISSUER = 'https://appleid.apple.com';

/**
 * Generate an Apple client_secret JWT.
 * Apple requires this instead of a static secret — signed with the .p8 private key.
 */
async function generateAppleClientSecret(): Promise<string> {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const clientId = process.env.APPLE_CLIENT_ID;
  const keyPath = process.env.APPLE_PRIVATE_KEY_PATH;

  if (!teamId || !keyId || !clientId || !keyPath) {
    throw new Error('Apple Sign-In env vars not fully configured (TEAM_ID, KEY_ID, CLIENT_ID, PRIVATE_KEY_PATH)');
  }

  // Read the .p8 key file
  let pemKey: string;
  try {
    // Support both file path and inline key (for Docker/production)
    if (keyPath.startsWith('-----')) {
      pemKey = keyPath;
    } else {
      pemKey = readFileSync(keyPath, 'utf8');
    }
  } catch {
    throw new Error(`Cannot read Apple private key at ${keyPath}`);
  }

  const privateKey = await importPKCS8(pemKey, 'ES256');

  // Apple client secrets are valid for up to 6 months, but we generate fresh ones
  const secret = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setAudience(APPLE_ISSUER)
    .setSubject(clientId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

  return secret;
}

export async function POST(request: NextRequest) {
  console.log('[Apple OAuth] Callback POST received');

  // SECURITY: Rate-limit by IP to prevent abuse
  const ip = getClientIp(request.headers);
  try {
    await loginLimiter.check(ip);
  } catch {
    console.warn('[Apple OAuth] Rate limited:', ip);
    return NextResponse.redirect(buildUrl('/login?error=too_many_attempts', request));
  }

  // Apple sends form-encoded POST body
  const formData = await request.formData();
  const code = formData.get('code') as string | null;
  const idToken = formData.get('id_token') as string | null;
  const state = formData.get('state') as string | null;
  const errorParam = formData.get('error') as string | null;
  // Apple sends user info only on first authorization as a JSON string
  const userInfoRaw = formData.get('user') as string | null;

  console.log('[Apple OAuth] Form data:', { hasCode: !!code, hasIdToken: !!idToken, hasState: !!state, errorParam, hasUser: !!userInfoRaw });

  if (errorParam) {
    console.error('[Apple OAuth] Apple returned error:', errorParam);
    return NextResponse.redirect(buildUrl('/login?error=apple_denied', request));
  }

  if (!code || !idToken) {
    console.error('[Apple OAuth] Missing code or id_token');
    return NextResponse.redirect(buildUrl('/login?error=no_code', request));
  }

  // Verify CSRF state
  const cookieStore = await cookies();
  const savedState = cookieStore.get('apple_oauth_state')?.value;
  console.log('[Apple OAuth] State check:', { savedState: savedState ? savedState.substring(0, 8) + '...' : 'MISSING', formState: state ? state.substring(0, 8) + '...' : 'MISSING', match: savedState === state });
  cookieStore.set('apple_oauth_state', '', { expires: new Date(0), path: '/' });

  if (!savedState || savedState !== state) {
    console.error('[Apple OAuth] CSRF state mismatch — cookie was not sent back. savedState:', savedState ? 'present' : 'MISSING');
    return NextResponse.redirect(buildUrl('/login?error=invalid_state', request));
  }

  // Retrieve invite code from cookie
  const inviteCode = cookieStore.get('apple_oauth_invite_code')?.value;
  cookieStore.set('apple_oauth_invite_code', '', { expires: new Date(0), path: '/' });

  const clientId = process.env.APPLE_CLIENT_ID;
  if (!clientId) {
    console.error('[Apple OAuth] APPLE_CLIENT_ID not configured.');
    return NextResponse.redirect(buildUrl('/login?error=sso_misconfigured', request));
  }

  try {
    // 1. Verify the id_token JWT against Apple's public keys
    const JWKS = createRemoteJWKSet(new URL(APPLE_JWKS_URL));
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: APPLE_ISSUER,
      audience: clientId,
    });

    const appleId = payload.sub;
    const email = payload.email as string | undefined;

    if (!appleId) {
      console.error('[Apple OAuth] No sub in id_token');
      return NextResponse.redirect(buildUrl('/login?error=sso_failed', request));
    }

    // 2. Exchange the authorization code for tokens (optional: for refresh tokens)
    //    We already have the id_token, but exchanging validates the code server-side
    const clientSecret = await generateAppleClientSecret();
    const redirectUri = process.env.APPLE_REDIRECT_URI || `${process.env.WEBAUTHN_ORIGIN || 'http://localhost:9002'}/api/auth/apple/callback`;

    const tokenResponse = await fetch(APPLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      console.error('[Apple OAuth] Token exchange failed:', err);
      // We already have the id_token verified, so we can proceed even if token exchange fails
      // This is a defense-in-depth measure, not a hard requirement
    }

    // 3. Parse user info (only sent on first auth)
    let userName = 'Apple User';
    if (userInfoRaw) {
      try {
        const userInfo = JSON.parse(userInfoRaw);
        const firstName = userInfo.name?.firstName || '';
        const lastName = userInfo.name?.lastName || '';
        userName = [firstName, lastName].filter(Boolean).join(' ') || 'Apple User';
      } catch {
        console.warn('[Apple OAuth] Could not parse user info JSON');
      }
    }

    // 4. Find existing OAuth link
    const existingOAuth = await db.query.oauthAccounts.findFirst({
      where: and(
        eq(oauthAccounts.provider, 'apple'),
        eq(oauthAccounts.providerAccountId, appleId),
      ),
    });

    let userId: string;

    if (existingOAuth) {
      // User already has a linked Apple account — sign them in
      userId = existingOAuth.userId;
    } else {
      // Check if a user with this email already exists (link accounts)
      const existingUser = email
        ? await db.query.users.findFirst({ where: eq(users.email, email) })
        : null;

      if (existingUser) {
        userId = existingUser.id;
      } else {
        // Enforce invite code for new users
        const inviteOnly = process.env.NEXT_PUBLIC_INVITE_ONLY === 'true';
        if (inviteOnly) {
          if (!inviteCode) {
            return NextResponse.redirect(buildUrl('/signup?error=invite_required', request));
          }
          try {
            const { validateInviteCode } = await import('@/lib/services/invite-service');
            await validateInviteCode(inviteCode);
          } catch {
            return NextResponse.redirect(buildUrl('/signup?error=invalid_invite', request));
          }
        }

        // Create a new user
        userId = crypto.randomUUID();
        const { generateUniqueSlug } = await import('@/lib/utils/slugify');
        const userSlug = await generateUniqueSlug(userName, async (candidate) => {
          const existing = await db.query.users.findFirst({
            where: eq(users.slug, candidate),
          });
          return !!existing;
        });

        await db.insert(users).values({
          id: userId,
          name: userName,
          email: email || null,
          role: 'Human_Free',
          avatar: null, // Apple doesn't provide profile photos
          reputationStatus: 'Newcomer',
          reputationScore: 0,
          slug: userSlug,
          createdAt: new Date(),
        });
      }

      // Auto-redeem invite code (runs for both new users AND email-linked existing users)
      if (inviteCode) {
        try {
          const { redeemInviteCode } = await import('@/lib/services/invite-service');
          await redeemInviteCode(userId, inviteCode);
        } catch (e) {
          console.warn('[Apple OAuth] Invite redemption failed:', e);
        }
      }

      // Auto-join the welcome tribe (runs for both new AND email-linked users)
      try {
        const { joinTribeDirectly } = await import('@/lib/services/tribe-service');
        const { tribes: tribesTable } = await import('@/db/schema');
        const [welcomeTribe] = await db.select({ id: tribesTable.id })
          .from(tribesTable)
          .where(eq(tribesTable.slug, 'welcome-to-tribes'))
          .limit(1);
        if (welcomeTribe) {
          await joinTribeDirectly(userId, welcomeTribe.id);
        }
      } catch (e) {
        console.warn('[Apple OAuth] Auto-join welcome tribe failed:', e);
      }

      // Link the Apple account to this user
      await db.insert(oauthAccounts).values({
        id: `oauth-apple-${appleId}`,
        userId,
        provider: 'apple',
        providerAccountId: appleId,
        createdAt: new Date(),
      });
    }

    // 5. Create session and redirect
    //
    // CRITICAL: We cannot use the standard `createSession()` helper here.
    // That helper sets the session cookie via `cookies()` from next/headers
    // with `sameSite: 'lax'`. But this callback is a cross-origin POST from
    // appleid.apple.com — browsers will NOT set a `sameSite: 'lax'` cookie
    // on a response to a cross-origin POST.
    //
    // Instead, we create the session row in DB and set the cookie directly
    // on the NextResponse.redirect() object. The 302 redirect transitions
    // the browser to a same-site GET navigation, at which point the cookie
    // is established.
    const { db: sessionDb } = await import('@/db');
    const { sessions } = await import('@/db/schema');

    const sessionId = crypto.randomUUID();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Read user-agent for device tracking
    const userAgent = request.headers.get('user-agent');

    // Write session row to DB
    await sessionDb.insert(sessions).values({
      id: sessionId,
      userId,
      expiresAt: expires,
      createdAt: new Date(),
      userAgent,
    });

    // Check for pending deletion
    const [sessionUser] = await db.select({ deletionRequestedAt: users.deletionRequestedAt })
      .from(users).where(eq(users.id, userId)).limit(1);

    const { encrypt, SESSION_COOKIE_NAME } = await import('@/lib/auth/session');
    const sessionToken = await encrypt({
      userId,
      sessionId,
      expires,
      deletionRequestedAt: sessionUser?.deletionRequestedAt?.toISOString() ?? null,
    });

    // CRITICAL: We cannot use a 302 redirect here.
    // Apple's form_post is a cross-origin POST. Browsers treat the 302 response
    // as still in a cross-site context and may refuse to set sameSite:'lax' cookies.
    // Instead, we return an HTML page with the Set-Cookie header. The browser
    // processes the cookie on this same-origin response, then the page does a
    // client-side redirect to /your-comms with the cookie already established.
    const redirectTo = buildUrl('/your-comms', request).toString();
    const html = `<!DOCTYPE html>
<html><head>
<meta http-equiv="refresh" content="0;url=${redirectTo}">
<title>Signing in...</title>
</head><body>
<p>Signing in...</p>
<script>window.location.replace("${redirectTo}");</script>
</body></html>`;

    const response = new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      expires,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });

    console.log('[Apple OAuth] Session created, returning landing page for user:', userId);
    return response;
  } catch (err) {
    console.error('[Apple OAuth] Error:', err);
    return NextResponse.redirect(buildUrl('/login?error=sso_failed', request));
  }
}
