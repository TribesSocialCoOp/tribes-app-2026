/**
 * GET /api/auth/verify-email?token=xxx
 * Validates the email verification token, marks user as verified,
 * and redirects to settings with a success message.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildUrl } from '@/lib/url';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(buildUrl('/settings?error=missing-token', request));
  }

  try {
    const { validateAndConsumeToken, markEmailVerified } = await import(
      '@/lib/services/email-token-service'
    );

    const result = await validateAndConsumeToken(token);

    if (result.type !== 'verify_email') {
      return NextResponse.redirect(buildUrl('/settings?error=invalid-token-type', request));
    }

    await markEmailVerified(result.userId);

    return NextResponse.redirect(buildUrl('/settings?verified=true', request));
  } catch (err: unknown) {
    const message = encodeURIComponent(((err instanceof Error) ? err.message : 'An error occurred') || 'Verification failed');
    return NextResponse.redirect(buildUrl(`/settings?error=${message}`, request));
  }
}
