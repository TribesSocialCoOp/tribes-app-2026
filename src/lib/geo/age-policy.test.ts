import { describe, it, expect } from 'vitest';
import { resolveNsfwAccess, regionTier } from './age-policy';

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

  it('requires WALLET verify (not self-attest) in a law state', () => {
    const optedIn = resolveNsfwAccess({ ...base, regionCode: 'US-TX', hasOptIn: true });
    expect(optedIn.decision).toBe('needs_verify');          // opt-in is NOT enough here
    expect(optedIn.remediation).toBe('verify_with_wallet');
    expect(resolveNsfwAccess({ ...base, regionCode: 'US-KS' }).decision).toBe('needs_verify');
  });

  it('allows a wallet-verified user in any law state', () => {
    expect(resolveNsfwAccess({ ...base, regionCode: 'US-WY', hasVerified: true }).reason).toBe('verified');
    expect(resolveNsfwAccess({ ...base, regionCode: 'US-TX', hasVerified: true }).decision).toBe('allow');
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
});
