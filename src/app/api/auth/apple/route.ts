import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';

/**
 * Apple Sign-In — OAuth 2.0 Authorization Code Flow (Initiation)
 *
 * Redirects the user to Apple's authorization page.
 * Uses env vars: APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY_PATH
 *
 * Key differences from Google OAuth:
 * - Apple uses `response_mode=form_post` (POSTs the callback, not GET)
 * - Apple requires a `client_secret` JWT signed with a .p8 key
 */

const APPLE_AUTH_URL = 'https://appleid.apple.com/auth/authorize';

export async function GET(request: NextRequest) {
  const clientId = process.env.APPLE_CLIENT_ID;
  const redirectUri = process.env.APPLE_REDIRECT_URI || `${process.env.WEBAUTHN_ORIGIN || 'http://localhost:9002'}/api/auth/apple/callback`;
  const inviteCode = request.nextUrl.searchParams.get('invite');

  // Guard: if credentials are not configured, return a helpful error
  if (!clientId) {
    return NextResponse.json(
      {
        error: 'Apple Sign-In not configured',
        message: 'Set APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY_PATH in .env.local.',
      },
      { status: 503 }
    );
  }

  // Generate CSRF state token
  const state = randomBytes(32).toString('hex');
  const cookieStore = await cookies();
  cookieStore.set('apple_oauth_state', state, {
    httpOnly: true,
    secure: true, // Required for sameSite: 'none'
    maxAge: 60 * 10,
    sameSite: 'none', // Apple form_post is a cross-origin POST — 'lax' won't send the cookie back
    path: '/',
  });

  // Store invite code for the callback to pick up
  if (inviteCode) {
    cookieStore.set('apple_oauth_invite_code', inviteCode.trim().toUpperCase(), {
      httpOnly: true,
      secure: true,
      maxAge: 60 * 10,
      sameSite: 'none',
      path: '/',
    });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code id_token',
    response_mode: 'form_post',
    scope: 'name email',
    state,
  });

  return NextResponse.redirect(`${APPLE_AUTH_URL}?${params.toString()}`);
}
