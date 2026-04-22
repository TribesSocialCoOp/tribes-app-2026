/**
 * POST /api/checkout — Creates a Stripe Checkout session.
 * Phase 3: Auth-gated checkout for plan upgrades.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/session';
import { createCheckoutSession } from '@/lib/services/payment-service';
import { checkoutLimiter } from '@/lib/auth/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await checkoutLimiter.check(userId);

    const body = await request.json();
    const { planId, interval = 'monthly' } = body;

    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }

    if (!['monthly', 'yearly'].includes(interval)) {
      return NextResponse.json({ error: 'interval must be monthly or yearly' }, { status: 400 });
    }

    const result = await createCheckoutSession(userId, planId, interval);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('[api/checkout] Error:', err);
    return NextResponse.json({ error: ((err instanceof Error) ? err.message : 'An error occurred') }, { status: 500 });
  }
}
