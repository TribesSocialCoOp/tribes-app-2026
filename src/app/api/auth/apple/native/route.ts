import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users, oauthAccounts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { encrypt, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { loginLimiter, getClientIp } from '@/lib/auth/rate-limit';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Apple Sign-In — Native Token Verification Endpoint
 *
 * Used by the Capacitor native app after the iOS-native Apple Sign-In sheet
 * returns an identity token. This avoids the web redirect OAuth flow which
 * fails in native WebViews due to cross-origin cookie isolation.
 *
 * POST /api/auth/apple/native
 * Body: { identityToken, givenName?, familyName?, email?, inviteCode? }
 */

const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';

export async function POST(request: NextRequest) {
  console.log('[Apple Native] Token verification request received');

  // Rate-limit
  const ip = getClientIp(request.headers);
  try {
    await loginLimiter.check(ip);
  } catch {
    return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 });
  }

  const body = await request.json();
  const { identityToken, givenName, familyName, email, inviteCode } = body;

  if (!identityToken) {
    return NextResponse.json({ error: 'missing_token' }, { status: 400 });
  }

  const clientId = process.env.APPLE_CLIENT_ID;
  if (!clientId) {
    console.error('[Apple Native] APPLE_CLIENT_ID not configured');
    return NextResponse.json({ error: 'sso_misconfigured' }, { status: 503 });
  }

  try {
    // 1. Verify the identity token against Apple's JWKS
    // The audience will be the iOS Bundle ID for native sign-ins, and the Web Service ID for web sign-ins.
    const validAudiences = [clientId, 'app.tribes.TribesApp', 'app.tribes.android'];
    
    const JWKS = createRemoteJWKSet(new URL(APPLE_JWKS_URL));
    const { payload } = await jwtVerify(identityToken, JWKS, {
      issuer: APPLE_ISSUER,
      audience: validAudiences,
    });

    const appleId = payload.sub;
    const tokenEmail = payload.email as string | undefined;
    const userEmail = email || tokenEmail;

    if (!appleId) {
      console.error('[Apple Native] No sub in identity token');
      return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
    }

    console.log('[Apple Native] Token verified for Apple ID:', appleId.substring(0, 8) + '...');

    // 2. Find existing OAuth link
    const existingOAuth = await db.query.oauthAccounts.findFirst({
      where: and(
        eq(oauthAccounts.provider, 'apple'),
        eq(oauthAccounts.providerAccountId, appleId),
      ),
    });

    let userId: string;

    if (existingOAuth) {
      userId = existingOAuth.userId;
      console.log('[Apple Native] Existing OAuth link found for user:', userId);
    } else {
      // Check if a user with this email already exists (link accounts)
      const existingUser = userEmail
        ? await db.query.users.findFirst({ where: eq(users.email, userEmail) })
        : null;

      if (existingUser) {
        userId = existingUser.id;
        console.log('[Apple Native] Linking Apple to existing user by email:', userId);
      } else {
        // Enforce invite code for new users
        const inviteOnly = process.env.NEXT_PUBLIC_INVITE_ONLY === 'true';
        if (inviteOnly) {
          if (!inviteCode) {
            return NextResponse.json({ error: 'invite_required' }, { status: 403 });
          }
          try {
            const { validateInviteCode } = await import('@/lib/services/invite-service');
            await validateInviteCode(inviteCode);
          } catch {
            return NextResponse.json({ error: 'invalid_invite' }, { status: 403 });
          }
        }

        // Build user name
        const userName = [givenName, familyName].filter(Boolean).join(' ') || 'Apple User';

        // Create new user
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
          email: userEmail || null,
          role: 'Human_Free',
          avatar: null,
          reputationStatus: 'Newcomer',
          reputationScore: 0,
          slug: userSlug,
          createdAt: new Date(),
        });

        console.log('[Apple Native] Created new user:', userId);
      }

      // Auto-redeem invite code (runs for both new users AND email-linked existing users)
      if (inviteCode) {
        try {
          const { redeemInviteCode } = await import('@/lib/services/invite-service');
          await redeemInviteCode(userId, inviteCode);
        } catch (e) {
          console.warn('[Apple Native] Invite redemption failed:', e);
        }
      }

      // Auto-join welcome tribe (runs for both new AND email-linked users)
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
        console.warn('[Apple Native] Auto-join welcome tribe failed:', e);
      }

      // Link the Apple account
      await db.insert(oauthAccounts).values({
        id: `oauth-apple-${appleId}`,
        userId,
        provider: 'apple',
        providerAccountId: appleId,
        createdAt: new Date(),
      });
    }

    // 3. Create session — return the session cookie in the JSON response
    //    The native app will set this cookie on the WebView
    const { sessions } = await import('@/db/schema');

    const sessionId = crypto.randomUUID();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const userAgent = request.headers.get('user-agent');

    await db.insert(sessions).values({
      id: sessionId,
      userId,
      expiresAt: expires,
      createdAt: new Date(),
      userAgent,
    });

    // Check for pending deletion
    const [sessionUser] = await db.select({ deletionRequestedAt: users.deletionRequestedAt })
      .from(users).where(eq(users.id, userId)).limit(1);

    const sessionToken = await encrypt({
      userId,
      sessionId,
      expires,
      deletionRequestedAt: sessionUser?.deletionRequestedAt?.toISOString() ?? null,
    });

    console.log('[Apple Native] Session created for user:', userId);

    // Return the session as a Set-Cookie header AND in the JSON body
    // The WebView will receive the cookie from the header
    const response = NextResponse.json({ success: true, redirectTo: '/your-comms' });
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      expires,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('[Apple Native] Error:', err);
    return NextResponse.json({ error: 'sso_failed' }, { status: 500 });
  }
}
