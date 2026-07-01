import { describe, it, expect } from 'vitest';
import { resolveNsfwAccess, regionTier, VERIFY_REGIONS, BLOCKED_REGIONS } from './age-policy';

const base = { isNsfw: true, hasOptIn: false, hasVerified: false, regionCode: '', surface: 'web' as const };

describe('regionTier', () => {
  it('classifies law states as verify (incl. KS/WY/SD)', () => {
    expect(regionTier('US-TX')).toBe('verify');
    expect(regionTier('US-KS')).toBe('verify');
    expect(regionTier('US-WY')).toBe('verify');
    expect(regionTier('US-SD')).toBe('verify');
    expect(regionTier('US-FL')).toBe('verify');
  });
  it('classifies the UK as blocked (country match)', () => {
    expect(regionTier('GB')).toBe('blocked');
    expect(regionTier('GB-ENG')).toBe('blocked');
  });
  it('classifies no-law regions + unknown as open', () => {
    expect(regionTier('US-CA')).toBe('open');   // no AV law
    expect(regionTier('US-WA')).toBe('open');
    expect(regionTier('DE')).toBe('open');
    expect(regionTier('')).toBe('open');         // unknown → permissive
  });
});

describe('resolveNsfwAccess', () => {
  it('allows non-NSFW unconditionally', () => {
    expect(resolveNsfwAccess({ ...base, isNsfw: false }).decision).toBe('allow');
  });

  it('fully blocks NSFW in a blocked region regardless of opt-in/verify', () => {
    expect(resolveNsfwAccess({ ...base, regionCode: 'GB', hasOptIn: true }).decision).toBe('blocked');
    expect(resolveNsfwAccess({ ...base, regionCode: 'GB', hasVerified: true }).decision).toBe('blocked');
  });

  it('requires WALLET verify FIRST in a law state (before the content toggle)', () => {
    // Nothing set → verification is the first requirement in a law state.
    const fresh = resolveNsfwAccess({ ...base, regionCode: 'US-KS' });
    expect(fresh.decision).toBe('needs_verify');
    expect(fresh.remediation).toBe('verify_with_wallet');
    // Even if the toggle were somehow on, an unverified law-state user still needs verify.
    const optedIn = resolveNsfwAccess({ ...base, regionCode: 'US-TX', hasOptIn: true });
    expect(optedIn.decision).toBe('needs_verify');
  });

  it('after wallet verify, a law state still requires the content toggle', () => {
    // Verified but toggle off → now the web content toggle is the remaining step.
    const verifiedNoToggle = resolveNsfwAccess({ ...base, regionCode: 'US-WY', hasVerified: true });
    expect(verifiedNoToggle.decision).toBe('needs_optin');
    // Both verify + toggle → allowed.
    const both = resolveNsfwAccess({ ...base, regionCode: 'US-TX', hasOptIn: true, hasVerified: true });
    expect(both.decision).toBe('allow');
    expect(both.reason).toBe('verified');
  });

  it('requires opt-in (self-attest) in an open region when not attested', () => {
    const r = resolveNsfwAccess({ ...base, regionCode: 'US-CA' });
    expect(r.decision).toBe('needs_optin');
    expect(r.remediation).toBe('enable_on_web_here');
  });

  it('points native users to the web to opt in (open region)', () => {
    const r = resolveNsfwAccess({ ...base, regionCode: 'US-CA', surface: 'ios' });
    expect(r.decision).toBe('needs_optin');
    expect(r.remediation).toBe('enable_on_web_elsewhere');
  });

  it('allows self-attested users in open regions (incl. unknown)', () => {
    expect(resolveNsfwAccess({ ...base, hasOptIn: true, regionCode: '' }).decision).toBe('allow');
    expect(resolveNsfwAccess({ ...base, hasOptIn: true, regionCode: 'US-CA' }).reason).toBe('self_attested');
  });

  it('still requires the content toggle for a wallet-verified user in an open region', () => {
    // Verified but toggle off → the content toggle is still required (not bypassed).
    const r = resolveNsfwAccess({ ...base, regionCode: 'US-CA', hasVerified: true });
    expect(r.decision).toBe('needs_optin');
  });
});

// Guards against the verify list silently drifting. Update EXPECTED (with a counsel
// note in age-policy.ts) whenever a state's law takes effect / is repealed.
describe('verify-tier completeness (US AV-law states, verified June 2026)', () => {
  const EXPECTED = [
    'US-AL', 'US-AR', 'US-AZ', 'US-FL', 'US-GA', 'US-IA', 'US-ID', 'US-IN', 'US-KS',
    'US-KY', 'US-LA', 'US-MO', 'US-MS', 'US-MT', 'US-NC', 'US-ND', 'US-NE', 'US-OH',
    'US-OK', 'US-SC', 'US-SD', 'US-TN', 'US-TX', 'US-UT', 'US-VA', 'US-WV', 'US-WY',
  ];

  it('matches the expected state set exactly (no drift)', () => {
    expect([...VERIFY_REGIONS].sort()).toEqual([...EXPECTED].sort());
  });

  it('classifies EVERY law state as verify', () => {
    for (const code of VERIFY_REGIONS) expect(regionTier(code)).toBe('verify');
  });

  it('does not block any verify state, and only blocks the configured set', () => {
    for (const code of VERIFY_REGIONS) expect(regionTier(code)).not.toBe('blocked');
    for (const code of BLOCKED_REGIONS) expect(regionTier(code)).toBe('blocked');
  });

  it('treats common no-law US states as open (not over-blocking)', () => {
    for (const code of ['US-CA', 'US-WA', 'US-NY', 'US-CO', 'US-OR', 'US-MA']) {
      expect(regionTier(code)).toBe('open');
    }
  });
});
