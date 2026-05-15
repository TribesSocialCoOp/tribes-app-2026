/**
 * GET /api/auth/recover?token=xxx
 * Validates the passkey recovery token, creates a temporary session,
 * and redirects to the signup page for passkey re-registration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildUrl } from '@/lib/url';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(buildUrl('/login?error=missing-token', request));
  }

  try {
    const { validateAndConsumeToken } = await import('@/lib/services/email-token-service');
    const result = await validateAndConsumeToken(token);

    if (result.type !== 'passkey_recovery') {
      return NextResponse.redirect(buildUrl('/login?error=invalid-token-type', request));
    }

    // Create a session for the recovered user so they can register a new passkey
    const { createSession } = await import('@/lib/auth/session');
    await createSession(result.userId);

    // Redirect to signup with recover flag — the page will detect
    // the existing session and offer passkey re-registration
    return NextResponse.redirect(buildUrl('/signup?recover=true', request));
  } catch (err: unknown) {
    const message = encodeURIComponent(((err instanceof Error) ? err.message : 'An error occurred') || 'Recovery failed');
    return NextResponse.redirect(buildUrl(`/login?error=${message}`, request));
  }
}
