import { isNative, platform } from '@/lib/capacitor/platform';

/**
 * StoreKit 2 Service (Phase 1: Architecture & Platform Gating)
 * 
 * This service handles native Apple In-App Purchases via the Capacitor StoreKit 2 plugin.
 * For now, we are implementing the platform-aware gating and transaction placeholders.
 */

export interface IAPProduct {
  id: string;
  name: string;
  price: string;
  description: string;
}

export const APPLE_PRODUCTS = {
  INDIVIDUAL_COOP: 'app.tribes.individual_coop',
  CREATOR: 'app.tribes.creator',
};

/**
 * Check if the current environment requires StoreKit (iOS Native).
 */
export function requiresStoreKit(): boolean {
  return isNative && platform === 'ios';
}

/**
 * Check if the current environment allows Stripe (Web or Android).
 * Note: Android also technically requires Play Store billing for digital goods,
 * but Apple is much stricter on the initial review.
 */
export function allowsStripe(): boolean {
  return !requiresStoreKit();
}

/**
 * Placeholder for StoreKit transaction flow.
 * In Phase 2, this will call:
 * await StoreKit2.purchase({ productId });
 */
export async function purchaseSubscription(productId: string): Promise<void> {
  if (!requiresStoreKit()) {
    throw new Error('StoreKit is only available on native iOS.');
  }
  
  console.log(`[StoreKit] Initiating purchase for: ${productId}`);
  // TODO: Implement actual plugin call
  throw new Error('StoreKit implementation is pending Capacitor plugin installation.');
}
