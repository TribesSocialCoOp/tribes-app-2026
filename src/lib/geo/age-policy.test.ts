import { describe, it, expect } from 'vitest';
import { resolveNsfwAccess, isBlockedRegion } from './age-policy';

const base = { isNsfw: true, hasOptIn: false, hasVerified: false, regionCode: '', surface: 'web' as const };

describe('isBlockedRegion', () => {
  it('blocks the listed states + UK', () => {
    expect(isBlockedRegion('US-KS')).toBe(true);
    expect(isBlockedRegion('US-WY')).toBe(true);
    expect(isBlockedRegion('US-SD')).toBe(true);
    expect(isBlockedRegion('GB')).toBe(true);
    expect(isBlockedRegion('GB-ENG')).toBe(true); // country match blocks subdivisions
  });
  it('does NOT block 1/3-threshold states, other regions, or unknown', () => {
    expect(isBlockedRegion('US-TX')).toBe(false);
    expect(isBlockedRegion('US-CA')).toBe(false);
    expect(isBlockedRegion('US')).toBe(false);     // country US not listed
    expect(isBlockedRegion('DE')).toBe(false);
    expect(isBlockedRegion('')).toBe(false);       // unknown → permissive
  });
});

describe('resolveNsfwAccess', () => {
  it('allows non-NSFW unconditionally', () => {
    expect(resolveNsfwAccess({ ...base, isNsfw: false }).decision).toBe('allow');
  });

  it('blocks NSFW in a blocked region regardless of opt-in/verify', () => {
    expect(resolveNsfwAccess({ ...base, regionCode: 'US-KS', hasOptIn: true }).decision).toBe('blocked');
    expect(resolveNsfwAccess({ ...base, regionCode: 'GB', hasVerified: true }).decision).toBe('blocked');
  });

  it('requires opt-in when not attested, in an allowed region', () => {
    const r = resolveNsfwAccess({ ...base, regionCode: 'US-TX' });
    expect(r.decision).toBe('needs_optin');
    expect(r.remediation).toBe('enable_on_web_here'); // web surface
  });

  it('points native users to the web to opt in', () => {
    const r = resolveNsfwAccess({ ...base, regionCode: 'US-TX', surface: 'ios' });
    expect(r.decision).toBe('needs_optin');
    expect(r.remediation).toBe('enable_on_web_elsewhere');
  });

  it('allows self-attested users in allowed regions (incl. unknown)', () => {
    expect(resolveNsfwAccess({ ...base, hasOptIn: true, regionCode: '' }).decision).toBe('allow');
    expect(resolveNsfwAccess({ ...base, hasOptIn: true, regionCode: 'US-TX' }).reason).toBe('self_attested');
    expect(resolveNsfwAccess({ ...base, hasOptIn: true, surface: 'ios' }).decision).toBe('allow'); // iOS works where self-attest applies
  });

  it('allows verified users (verify reason) in allowed regions', () => {
    expect(resolveNsfwAccess({ ...base, hasVerified: true, regionCode: 'US-CA' }).reason).toBe('verified');
  });
});
