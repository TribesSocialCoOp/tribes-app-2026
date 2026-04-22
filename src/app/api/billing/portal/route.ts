/**
 * GET /api/billing/portal — Redirects to Stripe Customer Portal.
 * Phase 3: Auth-gated billing management.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/session';
import { createBillingPortalSession } from '@/lib/services/payment-service';

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const result = await createBillingPortalSession(userId);
    return NextResponse.redirect(result.url);
  } catch (err: unknown) {
    console.error('[api/billing/portal] Error:', err);
    // If no subscription found, redirect to settings with error
    const settingsUrl = new URL('/settings', request.url);
    settingsUrl.searchParams.set('error', 'no-subscription');
    return NextResponse.redirect(settingsUrl);
  }
}
