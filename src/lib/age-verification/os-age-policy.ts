/**
 * Shared OS age-signal policy (issue #32) — the SINGLE decision core used by BOTH the
 * iOS Apple Declared Age Range provider and the Android Play Age Signals provider, so
 * the two platforms can't drift. Pure: no env reads, no I/O. Each provider does its own
 * platform-specific normalization (into `OsAgeSignal`) + attestation binding, then calls
 * `evaluateOsAgeSignal`.
 *
 * The goal is KEEPING MINORS OUT: the age BAND is the hard gate, a supervised/managed
 * child account is blocked, and an 18+ result is accepted regardless of HOW the platform
 * established the age (self-declared is the common adult case on both platforms).
 */

/** Neutral, normalized age signal from either OS. */
export interface OsAgeSignal {
  /** Apple/Google says the user is 18+ (age band). `undefined` = no definitive answer. */
  over18?: boolean;
  /** Supervised / managed child account (Apple parental controls, Google Family Link). */
  parentalControlsActive: boolean;
  /** High-assurance: the platform independently verified (gov-ID / payment / VERIFIED),
   *  not a bare self-declaration. */
  confirmed: boolean;
}

/** Policy toggles (each provider reads its own platform env and passes them in). */
export interface OsAgePolicyFlags {
  /** Block supervised/managed child accounts even if the band claims 18+. */
  blockOnParentalControls: boolean;
  /** Require a definitive age band; a missing/unknown signal is blocked (fail closed). */
  requireDefinitiveSignal: boolean;
  /** Require platform-confirmed assurance, rejecting bare self-declared. */
  requireConfirmed: boolean;
}

export type OsAgeReasonCode = 'no_signal' | 'under_18' | 'supervised' | 'unconfirmed';

export interface OsAgeDecision {
  verified: boolean;
  reasonCode?: OsAgeReasonCode;
}

/**
 * The shared gate. Order matters and is identical across platforms:
 *   1. no definitive signal (fail closed) → block
 *   2. under-18 age band (the kid gate) → block
 *   3. supervised/managed child account → block (default)
 *   4. not platform-confirmed, when confirmation is required → block
 *   5. otherwise → allow
 */
export function evaluateOsAgeSignal(sig: OsAgeSignal, flags: OsAgePolicyFlags): OsAgeDecision {
  if (flags.requireDefinitiveSignal && typeof sig.over18 !== 'boolean') {
    return { verified: false, reasonCode: 'no_signal' };
  }
  if (sig.over18 !== true) {
    return { verified: false, reasonCode: 'under_18' };
  }
  if (flags.blockOnParentalControls && sig.parentalControlsActive) {
    return { verified: false, reasonCode: 'supervised' };
  }
  if (flags.requireConfirmed && !sig.confirmed) {
    return { verified: false, reasonCode: 'unconfirmed' };
  }
  return { verified: true };
}

/**
 * "Real" production = a production build that is NOT the staging box. Staging runs
 * NODE_ENV=production but sets TRIBES_ENV=staging (same precedent as the geo override in
 * resolve-region.ts), and must be able to device-test these flows before the native
 * attestation (App Attest / Play Integrity) lands.
 */
export const isRealProd = () =>
  process.env.NODE_ENV === 'production' && process.env.TRIBES_ENV !== 'staging';
