/**
 * POST /api/webhooks/stripe — Handles Stripe webhook events.
 * Phase 3: Subscription lifecycle processing.
 *
 * ⚠️ This route must NOT be auth-gated — Stripe sends requests here directly.
 * Security is provided by the webhook signature verification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleWebhookEvent } from '@/lib/services/payment-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    const result = await handleWebhookEvent(body, signature);
    console.log(`[stripe webhook] ${result.type} — ${result.handled ? 'processed' : 'ignored'}`);

    return NextResponse.json({ received: true, type: result.type });
  } catch (err: unknown) {
    console.error('[stripe webhook] Error:', ((err instanceof Error) ? err.message : 'An error occurred'));
    return NextResponse.json({ error: ((err instanceof Error) ? err.message : 'An error occurred') }, { status: 400 });
  }
}
