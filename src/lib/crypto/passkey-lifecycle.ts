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
 * - `family`:                365 days  — deepest trust, longest investment cycle
 * - `friend`:                180 days  — real friendships survive months apart
 * - `professional`:           90 days  — quarterly cadence, project-based
 * - `collaborator`:           90 days  — same as professional
 * - `follower` / `supporter`: 90 days  — tribe membership (overridable by tribe owner)
 *
 * Auto-refresh philosophy:
 *   Bonds are meant to be *active*, not passive. Sharing (posting, commenting,
 *   vibing, messaging) keeps the bond alive. Consumption alone does not.
 *   When a user shares within a tribe or messages a bonded user, the bond
 *   expiry is silently extended — so bonds only fade when the relationship
 *   goes truly dormant.
 */

import type { Bond, BondType } from '@/lib/types';

// ============================================================
// DURATION CONSTANTS (milliseconds)
// ============================================================

/** Duration map by bond type. Values in days. */
const BOND_DURATION_DAYS: Record<BondType, number> = {
  family:       365,
  friend:       180,
  professional:  90,
  collaborator:  90,
  follower:      90,
  supporter:     90,
};

/** Default tribe bond duration when the tribe owner hasn't configured one. */
export const DEFAULT_TRIBE_BOND_DURATION_DAYS = 90;

/** Minimum remaining days before auto-refresh will kick in. */
export const AUTO_REFRESH_THRESHOLD_DAYS = 7;

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
 * For tribe bonds (follower/supporter), an optional `tribeDurationDays`
 * override can be provided from the tribe's settings.
 */
export function getExpiryDuration(bondType: string, tribeDurationDays?: number | null): number {
  // If a tribe-owner override is provided for tribe-membership bond types, use it
  if (tribeDurationDays && (bondType === 'follower' || bondType === 'supporter')) {
    return tribeDurationDays * 86_400_000;
  }
  const days = BOND_DURATION_DAYS[bondType as BondType] ?? DEFAULT_TRIBE_BOND_DURATION_DAYS;
  return days * 86_400_000;
}

/**
 * Returns the duration in days for a given bond type.
 */
export function getExpiryDurationDays(bondType: string, tribeDurationDays?: number | null): number {
  if (tribeDurationDays && (bondType === 'follower' || bondType === 'supporter')) {
    return tribeDurationDays;
  }
  return BOND_DURATION_DAYS[bondType as BondType] ?? DEFAULT_TRIBE_BOND_DURATION_DAYS;
}

/**
 * Computes the new expiration date for a bond refresh.
 */
export function computeNewExpiry(bondType: string, tribeDurationDays?: number | null): Date {
  return new Date(Date.now() + getExpiryDuration(bondType, tribeDurationDays));
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
