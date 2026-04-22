import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';

/**
 * Google OAuth 2.0 Authorization Code Flow — Initiation
 * 
 * Redirects the user to Google's consent page.
 * Uses env vars: GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:9002/api/auth/google/callback';

  // Guard: if credentials are not configured, return a helpful error
  if (!clientId || clientId === 'your-google-client-id') {
    return NextResponse.json(
      { 
        error: 'Google OAuth not configured',
        message: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local. See the implementation plan for setup steps.',
      },
      { status: 503 }
    );
  }

  // Generate CSRF state token
  const state = randomBytes(32).toString('hex');
  const cookieStore = await cookies();
  cookieStore.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10, // 10 minutes
    sameSite: 'lax',
    path: '/',
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  return NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
}
