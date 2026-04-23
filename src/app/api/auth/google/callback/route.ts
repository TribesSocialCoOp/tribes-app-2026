import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users, oauthAccounts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { createSession } from '@/lib/auth/session';
import { cookies } from 'next/headers';
import { loginLimiter, getClientIp } from '@/lib/auth/rate-limit';

/**
 * Google OAuth 2.0 — Callback Handler
 * 
 * Exchanges the authorization code for tokens, extracts user info from the ID token,
 * and creates or links a local user account.
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export async function GET(request: NextRequest) {
  // SECURITY: Rate-limit the callback by IP to prevent email enumeration.
  // An attacker repeatedly hitting this endpoint can learn whether a given
  // email is registered by observing the different response paths.
  const ip = getClientIp(request.headers);
  try {
    await loginLimiter.check(ip);
  } catch {
    return NextResponse.redirect(new URL('/login?error=too_many_attempts', request.url));
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/login?error=google_denied', request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no_code', request.url));
  }

  // Verify CSRF state
  const cookieStore = await cookies();
  const savedState = cookieStore.get('oauth_state')?.value;
  cookieStore.set('oauth_state', '', { expires: new Date(0), path: '/' });

  if (!savedState || savedState !== state) {
    return NextResponse.redirect(new URL('/login?error=invalid_state', request.url));
  }

  // Retrieve invite code from cookie (set during OAuth initiation)
  const inviteCode = cookieStore.get('oauth_invite_code')?.value;
  cookieStore.set('oauth_invite_code', '', { expires: new Date(0), path: '/' });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:9002/api/auth/google/callback';

  if (!clientId || !clientSecret) {
    console.error('[Google OAuth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured.');
    return NextResponse.redirect(new URL('/login?error=sso_misconfigured', request.url));
  }

  try {
    // 1. Exchange authorization code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      console.error('[Google OAuth] Token exchange failed:', err);
      return NextResponse.redirect(new URL('/login?error=token_exchange_failed', request.url));
    }

    const tokens = await tokenResponse.json();

    // 2. Fetch user info using access token
    const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      console.error('[Google OAuth] Userinfo fetch failed');
      return NextResponse.redirect(new URL('/login?error=userinfo_failed', request.url));
    }

    const googleUser = await userInfoResponse.json();
    const { sub: googleId, email, name, picture } = googleUser;

    // 3. Find existing OAuth link
    const existingOAuth = await db.query.oauthAccounts.findFirst({
      where: and(
        eq(oauthAccounts.provider, 'google'),
        eq(oauthAccounts.providerAccountId, googleId),
      ),
    });

    let userId: string;

    if (existingOAuth) {
      // User already has a linked Google account — sign them in
      userId = existingOAuth.userId;
    } else {
      // Check if a user with this email already exists (link accounts)
      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, email),
      });

      if (existingUser) {
        userId = existingUser.id;
      } else {
        // Enforce invite code for new users
        const inviteOnly = process.env.NEXT_PUBLIC_INVITE_ONLY === 'true';
        if (inviteOnly) {
          if (!inviteCode) {
            return NextResponse.redirect(new URL('/signup?error=invite_required', request.url));
          }
          try {
            const { validateInviteCode } = await import('@/lib/services/invite-service');
            await validateInviteCode(inviteCode);
          } catch {
            return NextResponse.redirect(new URL('/signup?error=invalid_invite', request.url));
          }
        }

        // Create a new user
        userId = crypto.randomUUID();
        await db.insert(users).values({
          id: userId,
          name: name || 'Google User',
          email,
          role: 'Human_Free',
          avatar: picture || null,
          reputationStatus: 'Newcomer',
          reputationScore: 0,
          createdAt: new Date(),
        });

        // Auto-redeem invite code
        if (inviteCode) {
          try {
            const { redeemInviteCode } = await import('@/lib/services/invite-service');
            await redeemInviteCode(userId, inviteCode);
          } catch (e) {
            console.warn('[Google OAuth] Invite redemption failed:', e);
          }
        }
      }

      // Link the Google account to this user
      await db.insert(oauthAccounts).values({
        id: `oauth-google-${googleId}`,
        userId,
        provider: 'google',
        providerAccountId: googleId,
        createdAt: new Date(),
      });
    }

    // 4. Create session and redirect
    await createSession(userId);

    return NextResponse.redirect(new URL('/your-comms', request.url));
  } catch (err) {
    console.error('[Google OAuth] Error:', err);
    return NextResponse.redirect(new URL('/login?error=sso_failed', request.url));
  }
}
