/**
 * @fileoverview Passkey expiration status lifecycle.
 *
 * Bond durations reflect the natural cadence of human relationships:
 *
 * Duration model:
 * - Inner Circle:  365 days — your closest people, yearly investment
 * - Person bonds:  180 days — regular connections, semi-annual cadence
 * - Tribe bonds:    90 days — community membership (owner-configurable)
 * - Event bonds:   365 days — content access grants
 *
 * Status thresholds:
 * - `active`:   > 7 days until expiry
 * - `fading`:   1–7 days until expiry (nudge to interact)
 * - `dormant`:  past expiry — person bonds only (visible but content hidden, reconnectable)
 * - `expired`:  past expiry — tribe/event bonds (must re-join or get new pass)
 *
 * Auto-refresh philosophy:
 *   Sharing (posting, commenting, vibing, messaging) keeps bonds alive.
 *   Consumption alone does not. Bonds only fade when the relationship
 *   goes truly dormant.
 *
 * Legacy bond types (family, friend, professional, collaborator, follower, supporter)
 * are mapped transparently to the new duration model:
 *   - family → inner_circle duration (365d)
 *   - friend/professional/collaborator → person duration (180d)
 *   - follower/supporter → tribe duration (90d)
 */

import type { Bond, BondType } from '@/lib/types';

// ============================================================
// DURATION CONSTANTS
// ============================================================

/** Duration in days by bond category. */
const DURATION_DAYS = {
  inner_circle: 365,
  person: 180,
  tribe: 90,
  event: 365,
} as const;

/** Default tribe bond duration when the tribe owner hasn't configured one. */
export const DEFAULT_TRIBE_BOND_DURATION_DAYS = 90;

/** Minimum remaining days before auto-refresh will kick in. */
export const AUTO_REFRESH_THRESHOLD_DAYS = 7;

// ============================================================
// LEGACY TYPE MAPPING
// ============================================================

/**
 * Maps legacy bond type strings from the DB to the new duration category.
 * New bonds use 'person', 'tribe', 'event' directly.
 */
function legacyTypeToCategory(bondType: string, innerCircle?: boolean): keyof typeof DURATION_DAYS {
  if (innerCircle) return 'inner_circle';

  switch (bondType) {
    case 'family': return 'inner_circle';
    case 'friend': return 'person';
    case 'professional': return 'person';
    case 'collaborator': return 'person';
    case 'person': return 'person';
    case 'follower': return 'tribe';
    case 'supporter': return 'tribe';
    case 'tribe': return 'tribe';
    case 'event': return 'event';
    default: return 'person';
  }
}

/**
 * Maps a legacy bond type to the new canonical BondType.
 */
export function normalizeBondType(rawType: string): BondType {
  switch (rawType) {
    case 'person':
    case 'family':
    case 'friend':
    case 'professional':
    case 'collaborator':
      return 'person';
    case 'tribe':
    case 'follower':
    case 'supporter':
      return 'tribe';
    case 'event':
      return 'event';
    default:
      return 'person';
  }
}

// ============================================================
// STATUS COMPUTATION
// ============================================================

/**
 * Computes the current passkey status based on the bond's expiration date
 * and bond type. This is the canonical source of truth for passkey status.
 *
 * Person bonds (including legacy family/friend/professional/collaborator):
 *   active → fading → dormant (never hard-expire; reconnectable)
 *
 * Tribe/event bonds (including legacy follower/supporter):
 *   active → fading → expired (hard cutoff; must re-join)
 */
export function computePasskeyStatus(
  bond: Pick<Bond, 'expiresAt'>,
  rawBondType?: string,
  targetType?: string,
): Bond['passkeyStatus'] {
  const now = Date.now();
  const expiresMs = bond.expiresAt instanceof Date ? bond.expiresAt.getTime() : Number(bond.expiresAt);
  const daysUntilExp = (expiresMs - now) / 86_400_000;

  if (daysUntilExp <= 0) {
    // Past expiry: person bonds go dormant, tribe/event bonds expire
    const isPersonBond = !rawBondType || targetType === 'user' ||
      ['person', 'family', 'friend', 'professional', 'collaborator'].includes(rawBondType);
    return isPersonBond ? 'dormant' : 'expired';
  }
  if (daysUntilExp <= 7) return 'fading';
  return 'active';
}

/**
 * Returns the expiry duration in milliseconds for a given bond type.
 * For tribe bonds, an optional `tribeDurationDays` override can be provided.
 */
export function getExpiryDuration(
  bondType: string,
  options?: { innerCircle?: boolean; tribeDurationDays?: number | null },
): number {
  // Tribe-owner override for tribe-type bonds
  if (options?.tribeDurationDays && (bondType === 'follower' || bondType === 'supporter' || bondType === 'tribe')) {
    return options.tribeDurationDays * 86_400_000;
  }
  const category = legacyTypeToCategory(bondType, options?.innerCircle);
  return DURATION_DAYS[category] * 86_400_000;
}

/**
 * Returns the duration in days for a given bond type.
 */
export function getExpiryDurationDays(
  bondType: string,
  options?: { innerCircle?: boolean; tribeDurationDays?: number | null },
): number {
  if (options?.tribeDurationDays && (bondType === 'follower' || bondType === 'supporter' || bondType === 'tribe')) {
    return options.tribeDurationDays;
  }
  const category = legacyTypeToCategory(bondType, options?.innerCircle);
  return DURATION_DAYS[category];
}

/**
 * Computes the new expiration date for a bond refresh.
 */
export function computeNewExpiry(
  bondType: string,
  options?: { innerCircle?: boolean; tribeDurationDays?: number | null },
): Date {
  return new Date(Date.now() + getExpiryDuration(bondType, options));
}

// ============================================================
// STATUS HELPERS
// ============================================================

/**
 * Returns a human-readable description of the passkey status.
 */
export function getStatusDescription(status: Bond['passkeyStatus']): string {
  switch (status) {
    case 'active': return 'Bond is active and secure';
    case 'fading': return 'Bond is fading — interact to keep it alive';
    case 'dormant': return 'Bond is dormant — send a reconnect request to restore';
    case 'expired': return 'Bond has expired — re-join the tribe or get a new event pass';
  }
}

/**
 * Returns the status indicator emoji.
 */
export function getStatusIndicator(status: Bond['passkeyStatus']): string {
  switch (status) {
    case 'active': return '🔑';
    case 'fading': return '⏳';
    case 'dormant': return '💤';
    case 'expired': return '❌';
  }
}

/**
 * Returns CSS color class name for the status.
 */
export function getStatusColor(status: Bond['passkeyStatus']): string {
  switch (status) {
    case 'active': return 'text-green-500';
    case 'fading': return 'text-yellow-500';
    case 'dormant': return 'text-muted-foreground';
    case 'expired': return 'text-red-500';
  }
}

/**
 * Checks if a bond is in a degraded state (chat/intro features should be disabled).
 */
export function isBondDegraded(status: Bond['passkeyStatus']): boolean {
  return status === 'dormant' || status === 'expired';
}

/**
 * Returns the number of days until expiry (negative if past expiry).
 */
export function daysUntilExpiry(bond: Pick<Bond, 'expiresAt'>): number {
  const expiresMs = bond.expiresAt instanceof Date ? bond.expiresAt.getTime() : Number(bond.expiresAt);
  return Math.floor((expiresMs - Date.now()) / 86_400_000);
}

/**
 * Convenience check: returns true if a bond is active or fading (i.e. usable).
 * Centralises the repeated `computePasskeyStatus` + active/fading filter pattern.
 */
export function isActiveBond(
  bond: Pick<Bond, 'expiresAt'>,
  rawBondType?: string,
  targetType?: string,
): boolean {
  const status = computePasskeyStatus(bond, rawBondType, targetType);
  return status === 'active' || status === 'fading';
}
