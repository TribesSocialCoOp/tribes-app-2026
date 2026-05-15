/**
 * GET /api/billing/portal — Redirects to Stripe Customer Portal.
 * Phase 3: Auth-gated billing management.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/session';
import { createBillingPortalSession } from '@/lib/services/payment-service';
import { buildUrl } from '@/lib/url';

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.redirect(buildUrl('/login', request));
    }

    const result = await createBillingPortalSession(userId);
    return NextResponse.redirect(result.url);
  } catch (err: unknown) {
    console.error('[api/billing/portal] Error:', err);
    // If no subscription found, redirect to settings with error
    const settingsUrl = buildUrl('/settings', request);
    settingsUrl.searchParams.set('error', 'no-subscription');
    return NextResponse.redirect(settingsUrl);
  }
}
