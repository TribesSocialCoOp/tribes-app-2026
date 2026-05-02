/**
 * @fileoverview Stripe payment integration service.
 * Phase 3B: Checkout sessions, billing portal, webhook handling.
 *
 * Handles:
 * 1. Creating Stripe Checkout sessions for plan upgrades
 * 2. Managing the Stripe Customer Portal for self-service billing
 * 3. Processing Stripe webhook events (subscription lifecycle)
 * 4. Syncing subscription status → user role
 */

import Stripe from 'stripe';
import { db } from '@/db';
import { users, plans, subscriptions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

// ============================================================
// STRIPE CLIENT
// ============================================================

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(key, { apiVersion: '2026-03-25.dahlia' });
}

// ============================================================
// CHECKOUT
// ============================================================

/**
 * Creates a Stripe Checkout Session for upgrading to a paid plan.
 */
export async function createCheckoutSession(
  userId: string,
  planId: string,
  interval: 'monthly' | 'yearly' = 'monthly',
  returnUrl: string = '/settings',
): Promise<{ url: string }> {
  const stripe = getStripe();

  // Get the plan
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!plan) throw new Error('Plan not found');

  const priceId = interval === 'yearly' ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
  if (!priceId) throw new Error(`No ${interval} price configured for plan ${planId}`);

  // Get or create Stripe customer
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error('User not found');

  // Check if user already has a subscription with a stripeCustomerId
  const [existingSub] = await db.select().from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  let customerId = existingSub?.stripeCustomerId;

  if (!customerId) {
    // Create a new Stripe customer
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.name,
      metadata: { tribesUserId: userId },
    });
    customerId = customer.id;
  }

  // Create checkout session
  const origin = process.env.WEBAUTHN_ORIGIN || 'http://localhost:9002';
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}${returnUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${returnUrl}?checkout=canceled`,
    metadata: { tribesUserId: userId, planId },
    subscription_data: {
      metadata: { tribesUserId: userId, planId },
    },
  });

  if (!session.url) throw new Error('Checkout session URL not generated');
  return { url: session.url };
}

// ============================================================
// BILLING PORTAL
// ============================================================

/**
 * Creates a Stripe Customer Portal session for managing billing.
 */
export async function createBillingPortalSession(
  userId: string,
  returnUrl: string = '/settings',
): Promise<{ url: string }> {
  // Check for a Stripe customer ID BEFORE initializing the Stripe client.
  // Founding/earned members won't have one, and STRIPE_SECRET_KEY may not
  // be configured — we should redirect gracefully rather than throw.
  const [sub] = await db.select().from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (!sub?.stripeCustomerId) {
    return { url: '/billing' };
  }

  const stripe = getStripe();
  const origin = process.env.WEBAUTHN_ORIGIN || 'http://localhost:9002';
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${origin}${returnUrl}`,
  });

  return { url: session.url };
}

// ============================================================
// WEBHOOK PROCESSING
// ============================================================

/**
 * Processes a Stripe webhook event.
 * Returns the event type for logging.
 */
export async function handleWebhookEvent(
  body: string,
  signature: string,
): Promise<{ type: string; handled: boolean }> {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET not configured');

  // Verify signature
  const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
      return { type: event.type, handled: true };

    case 'customer.subscription.updated':
      await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
      return { type: event.type, handled: true };

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      return { type: event.type, handled: true };

    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      return { type: event.type, handled: true };

    default:
      return { type: event.type, handled: false };
  }
}

// ============================================================
// WEBHOOK HANDLERS
// ============================================================

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.tribesUserId;
  const planId = session.metadata?.planId;
  if (!userId || !planId) return;

  const stripeSubscriptionId = session.subscription as string;
  const stripeCustomerId = session.customer as string;

  await db.transaction(async (tx) => {
    // Get the plan to determine the target role
    const [plan] = await tx.select().from(plans).where(eq(plans.id, planId)).limit(1);
    if (!plan) return;

    // Upsert subscription
    const [existing] = await tx.select().from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    if (existing) {
      await tx.update(subscriptions).set({
        planId,
        status: 'active',
        stripeCustomerId,
        stripeSubscriptionId,
        updatedAt: new Date(),
      }).where(eq(subscriptions.id, existing.id));
    } else {
      await tx.insert(subscriptions).values({
        id: `sub-${userId}-${Date.now()}`,
        userId,
        planId,
        status: 'active',
        stripeCustomerId,
        stripeSubscriptionId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Upgrade user role
    await tx.update(users).set({ role: plan.targetRole }).where(eq(users.id, userId));
    console.log(`[stripe] User ${userId} upgraded to ${plan.name} (role: ${plan.targetRole})`);
  });
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.tribesUserId;
  if (!userId) return;

  const status = subscription.status; // 'active', 'past_due', 'canceled', etc.
  const cancelAtPeriodEnd = subscription.cancel_at_period_end;

  // Find and update our subscription record
  const [sub] = await db.select().from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
    .limit(1);

  if (sub) {
    await db.update(subscriptions).set({
      status,
      cancelAtPeriodEnd,
      currentPeriodStart: subscription.items.data[0]?.current_period_start
        ? new Date(subscription.items.data[0].current_period_start * 1000)
        : undefined,
      currentPeriodEnd: subscription.items.data[0]?.current_period_end
        ? new Date(subscription.items.data[0].current_period_end * 1000)
        : undefined,
      updatedAt: new Date(),
    }).where(eq(subscriptions.id, sub.id));
  }

  // If subscription went past_due, we could downgrade or show warnings
  if (status === 'past_due') {
    console.log(`[stripe] User ${userId} subscription is past due`);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.tribesUserId;
  if (!userId) return;

  await db.transaction(async (tx) => {
    // Downgrade user to free tier
    await tx.update(users).set({ role: 'Human_Free' }).where(eq(users.id, userId));

    // Update subscription status
    const [sub] = await tx.select().from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
      .limit(1);

    if (sub) {
      await tx.update(subscriptions).set({
        status: 'canceled',
        updatedAt: new Date(),
      }).where(eq(subscriptions.id, sub.id));
    }
  });

  console.log(`[stripe] User ${userId} downgraded to Free (subscription canceled)`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  console.log(`[stripe] Payment failed for customer ${customerId}`);
  // Could send notification, update subscription to 'past_due', etc.
}

// ============================================================
// SUBSCRIPTION QUERIES
// ============================================================

/**
 * Gets the current subscription and plan for a user.
 */
export async function getSubscriptionForUser(userId: string): Promise<{
  subscription: typeof subscriptions.$inferSelect | null;
  plan: typeof plans.$inferSelect;
}> {
  // Check for active subscription
  const [sub] = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.userId, userId)))
    .limit(1);

  if (sub && sub.status === 'active') {
    const [plan] = await db.select().from(plans).where(eq(plans.id, sub.planId)).limit(1);
    return { subscription: sub, plan: plan! };
  }

  // Default to free plan
  const [freePlan] = await db.select().from(plans).where(eq(plans.id, 'free')).limit(1);
  return { subscription: null, plan: freePlan! };
}

/**
 * Gets all available plans.
 */
export async function getAvailablePlans() {
  return db.select().from(plans).orderBy(plans.sortOrder);
}
