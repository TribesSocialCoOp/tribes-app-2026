/**
 * Unit tests for the shared OS age-signal decision core (os-age-policy.ts) — the single
 * gate both the iOS (Apple Declared Age Range) and Android (Play Age Signals) providers
 * run through, so they can't drift.
 */
import { describe, it, expect } from 'vitest';
import { evaluateOsAgeSignal, type OsAgePolicyFlags } from './os-age-policy';

const defaults: OsAgePolicyFlags = {
  blockOnParentalControls: true,
  requireDefinitiveSignal: true,
  requireConfirmed: false,
};

describe('evaluateOsAgeSignal', () => {
  it('allows a plain 18+ signal (self-declared adult) under defaults', () => {
    expect(evaluateOsAgeSignal({ over18: true, parentalControlsActive: false, confirmed: false }, defaults))
      .toEqual({ verified: true });
  });

  it('blocks an under-18 band (the kid gate)', () => {
    expect(evaluateOsAgeSignal({ over18: false, parentalControlsActive: false, confirmed: false }, defaults))
      .toEqual({ verified: false, reasonCode: 'under_18' });
  });

  it('blocks a supervised / managed child account even when 18+', () => {
    expect(evaluateOsAgeSignal({ over18: true, parentalControlsActive: true, confirmed: false }, defaults))
      .toEqual({ verified: false, reasonCode: 'supervised' });
  });

  it('allows a supervised 18+ device when the block flag is off', () => {
    expect(evaluateOsAgeSignal({ over18: true, parentalControlsActive: true, confirmed: false },
      { ...defaults, blockOnParentalControls: false }))
      .toEqual({ verified: true });
  });

  it('blocks a missing signal when definitive is required (default, fail closed)', () => {
    expect(evaluateOsAgeSignal({ over18: undefined, parentalControlsActive: false, confirmed: false }, defaults))
      .toEqual({ verified: false, reasonCode: 'no_signal' });
  });

  it('rejects self-declared / unconfirmed when confirmation is required', () => {
    expect(evaluateOsAgeSignal({ over18: true, parentalControlsActive: false, confirmed: false },
      { ...defaults, requireConfirmed: true }))
      .toEqual({ verified: false, reasonCode: 'unconfirmed' });
    expect(evaluateOsAgeSignal({ over18: true, parentalControlsActive: false, confirmed: true },
      { ...defaults, requireConfirmed: true }))
      .toEqual({ verified: true });
  });

  it('the kid gate wins over confirmation and parental checks (order)', () => {
    // Under 18 blocks first, regardless of other flags.
    expect(evaluateOsAgeSignal({ over18: false, parentalControlsActive: true, confirmed: true },
      { ...defaults, requireConfirmed: true }).reasonCode).toBe('under_18');
  });
});
