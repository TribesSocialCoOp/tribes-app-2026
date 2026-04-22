/**
 * @fileoverview Passkey expiration status lifecycle.
 * Phase 2D: Check-on-read pattern for bond passkey status.
 *
 * The passkey status is computed dynamically from the bond's `expiresAt`
 * timestamp every time a bond is read, rather than stored statically.
 * This ensures status is always accurate without needing background jobs.
 *
 * Status thresholds:
 * - `active`:        > 7 days until expiry
 * - `expires_soon`:  3–7 days until expiry
 * - `needs_refresh`: 0–3 days until expiry
 * - `expired`:       past expiry date
 *
 * Expiry durations by bond type:
 * - `family`:  365 days
 * - All others: 30 days
 */

import type { Bond } from '@/lib/types';

// ============================================================
// STATUS COMPUTATION
// ============================================================

/**
 * Computes the current passkey status based on the bond's expiration date.
 * This is the canonical source of truth for passkey status.
 */
export function computePasskeyStatus(bond: Pick<Bond, 'expiresAt'>): Bond['passkeyStatus'] {
  const now = Date.now();
  const expiresMs = bond.expiresAt instanceof Date ? bond.expiresAt.getTime() : Number(bond.expiresAt);
  const daysUntilExpiry = (expiresMs - now) / 86_400_000;

  if (daysUntilExpiry <= 0) return 'expired';
  if (daysUntilExpiry <= 3) return 'needs_refresh';
  if (daysUntilExpiry <= 7) return 'expires_soon';
  return 'active';
}

/**
 * Returns the expiry duration in milliseconds for a given bond type.
 */
export function getExpiryDuration(bondType: string): number {
  return bondType === 'family' ? 365 * 86_400_000 : 30 * 86_400_000;
}

/**
 * Computes the new expiration date for a bond refresh.
 */
export function computeNewExpiry(bondType: string): Date {
  return new Date(Date.now() + getExpiryDuration(bondType));
}

// ============================================================
// STATUS HELPERS
// ============================================================

/**
 * Returns a human-readable description of the passkey status.
 */
export function getStatusDescription(status: Bond['passkeyStatus']): string {
  switch (status) {
    case 'active': return 'Passkey is valid and active';
    case 'expires_soon': return 'Passkey expires within 7 days';
    case 'needs_refresh': return 'Passkey expires within 3 days — refresh recommended';
    case 'expired': return 'Passkey has expired — bond functionality is degraded';
  }
}

/**
 * Returns the status indicator emoji.
 */
export function getStatusIndicator(status: Bond['passkeyStatus']): string {
  switch (status) {
    case 'active': return '🔑';
    case 'expires_soon': return '⏳';
    case 'needs_refresh': return '⚠️';
    case 'expired': return '❌';
  }
}

/**
 * Returns CSS color class name for the status.
 */
export function getStatusColor(status: Bond['passkeyStatus']): string {
  switch (status) {
    case 'active': return 'text-green-500';
    case 'expires_soon': return 'text-yellow-500';
    case 'needs_refresh': return 'text-orange-500';
    case 'expired': return 'text-red-500';
  }
}

/**
 * Checks if a bond is in a degraded state (chat/intro features should be disabled).
 */
export function isBondDegraded(status: Bond['passkeyStatus']): boolean {
  return status === 'expired';
}

/**
 * Returns the number of days until expiry (negative if expired).
 */
export function daysUntilExpiry(bond: Pick<Bond, 'expiresAt'>): number {
  const expiresMs = bond.expiresAt instanceof Date ? bond.expiresAt.getTime() : Number(bond.expiresAt);
  return Math.floor((expiresMs - Date.now()) / 86_400_000);
}
