/**
 * GET /api/auth/recover?token=xxx
 * Validates the passkey recovery token, creates a temporary session,
 * and redirects to the signup page for passkey re-registration.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=missing-token', request.url));
  }

  try {
    const { validateAndConsumeToken } = await import('@/lib/services/email-token-service');
    const result = await validateAndConsumeToken(token);

    if (result.type !== 'passkey_recovery') {
      return NextResponse.redirect(new URL('/login?error=invalid-token-type', request.url));
    }

    // Create a session for the recovered user so they can register a new passkey
    const { createSession } = await import('@/lib/auth/session');
    await createSession(result.userId);

    // Redirect to signup with recover flag — the page will detect
    // the existing session and offer passkey re-registration
    return NextResponse.redirect(new URL('/signup?recover=true', request.url));
  } catch (err: unknown) {
    const message = encodeURIComponent(((err instanceof Error) ? err.message : 'An error occurred') || 'Recovery failed');
    return NextResponse.redirect(new URL(`/login?error=${message}`, request.url));
  }
}
