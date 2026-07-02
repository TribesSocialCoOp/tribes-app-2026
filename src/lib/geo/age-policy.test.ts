import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  resolveNsfwAccess,
  regionTier,
  lawRegionTier,
  walletVerifyEnabled,
  VERIFY_REGIONS,
  BLOCKED_REGIONS,
} from './age-policy';

const base = { isNsfw: true, hasOptIn: false, hasVerified: false, regionCode: '', surface: 'web' as const };

/** Run a block with Google Wallet verification turned ON (Stage 2 re-enabled). */
function withWalletEnabled(fn: () => void) {
  vi.stubEnv('NEXT_PUBLIC_WALLET_VERIFY_ENABLED', 'true');
  try { fn(); } finally { vi.unstubAllEnvs(); }
}

/** Run a block with the iOS Declared Age Range method turned ON (Wallet stays parked). */
function withIosAgeEnabled(fn: () => void) {
  vi.stubEnv('NEXT_PUBLIC_IOS_AGE_VERIFY_ENABLED', 'true');
  try { fn(); } finally { vi.unstubAllEnvs(); }
}

afterEach(() => vi.unstubAllEnvs());

// ── Pure legal classification (flag-independent) ─────────────────────────────
describe('lawRegionTier (geographic/legal classification)', () => {
  it('classifies law states as verify (incl. KS/WY/SD)', () => {
    expect(lawRegionTier('US-TX')).toBe('verify');
    expect(lawRegionTier('US-KS')).toBe('verify');
    expect(lawRegionTier('US-WY')).toBe('verify');
    expect(lawRegionTier('US-SD')).toBe('verify');
    expect(lawRegionTier('US-FL')).toBe('verify');
  });
  it('classifies the UK as blocked (country match)', () => {
    expect(lawRegionTier('GB')).toBe('blocked');
    expect(lawRegionTier('GB-ENG')).toBe('blocked');
  });
  it('classifies no-law regions + unknown as open', () => {
    expect(lawRegionTier('US-CA')).toBe('open');   // no AV law
    expect(lawRegionTier('US-WA')).toBe('open');
    expect(lawRegionTier('DE')).toBe('open');
    expect(lawRegionTier('')).toBe('open');         // unknown → permissive
  });
});

// ── Effective tier (staged rollout: Wallet parked by default) ────────────────
describe('regionTier (effective — Google Wallet PARKED by default)', () => {
  it('defaults to parked (walletVerifyEnabled === false)', () => {
    expect(walletVerifyEnabled()).toBe(false);
  });
  it('geo-blocks law states while Wallet is parked (no verify method to offer)', () => {
    expect(regionTier('US-TX')).toBe('blocked');
    expect(regionTier('US-KS')).toBe('blocked');
    expect(regionTier('US-FL')).toBe('blocked');
  });
  it('leaves the UK blocked and no-law regions open regardless of the flag', () => {
    expect(regionTier('GB')).toBe('blocked');
    expect(regionTier('US-CA')).toBe('open');
    expect(regionTier('')).toBe('open');
  });
  it('re-opens the verify tier when NEXT_PUBLIC_WALLET_VERIFY_ENABLED=true (Stage 2)', () => {
    withWalletEnabled(() => {
      expect(regionTier('US-TX')).toBe('verify');
      expect(regionTier('US-KS')).toBe('verify');
      expect(regionTier('GB')).toBe('blocked');   // UK stays blocked
      expect(regionTier('US-CA')).toBe('open');
    });
  });
});

// The iOS Declared Age Range method re-opens the verify tier for iOS-native users only,
// independent of the Google Wallet flag.
describe('regionTier (iOS Declared Age Range — surface-aware)', () => {
  it('keeps a law state blocked on iOS when the iOS method is OFF (default)', () => {
    expect(regionTier('US-TX', 'ios')).toBe('blocked');
  });
  it('re-opens a law state to verify on iOS when the iOS method is ON', () => {
    withIosAgeEnabled(() => {
      expect(regionTier('US-TX', 'ios')).toBe('verify');
      expect(regionTier('US-KS', 'ios')).toBe('verify');
    });
  });
  it('does NOT re-open a law state on web/android with only the iOS method ON', () => {
    withIosAgeEnabled(() => {
      expect(regionTier('US-TX', 'web')).toBe('blocked');
      expect(regionTier('US-TX', 'android')).toBe('blocked');
      expect(regionTier('US-TX')).toBe('blocked');   // no surface → wallet-only
    });
  });
  it('leaves the UK blocked and open regions open regardless of surface/flag', () => {
    withIosAgeEnabled(() => {
      expect(regionTier('GB', 'ios')).toBe('blocked');
      expect(regionTier('US-CA', 'ios')).toBe('open');
    });
  });
  it('Wallet ON keeps law states verify on every surface (wallet is surface-agnostic)', () => {
    withWalletEnabled(() => {
      expect(regionTier('US-TX', 'web')).toBe('verify');
      expect(regionTier('US-TX', 'ios')).toBe('verify');
    });
  });
});

describe('resolveNsfwAccess — iOS law state via Declared Age Range', () => {
  it('unverified iOS law-state user → needs_verify (offered the OS check)', () => {
    withIosAgeEnabled(() => {
      const r = resolveNsfwAccess({ ...base, regionCode: 'US-KS', surface: 'ios' });
      expect(r.decision).toBe('needs_verify');
    });
  });
  it('verified + opted-in iOS law-state user → allow', () => {
    withIosAgeEnabled(() => {
      const r = resolveNsfwAccess({ ...base, regionCode: 'US-KS', surface: 'ios', hasVerified: true, hasOptIn: true });
      expect(r.decision).toBe('allow');
    });
  });
  it('same user on web (no iOS method) → blocked', () => {
    withIosAgeEnabled(() => {
      const r = resolveNsfwAccess({ ...base, regionCode: 'US-KS', surface: 'web', hasVerified: true, hasOptIn: true });
      expect(r.decision).toBe('blocked');
    });
  });
});

describe('resolveNsfwAccess (flag-independent cases)', () => {
  it('allows non-NSFW unconditionally', () => {
    expect(resolveNsfwAccess({ ...base, isNsfw: false }).decision).toBe('allow');
  });

  it('fully blocks NSFW in a blocked region regardless of opt-in/verify', () => {
    expect(resolveNsfwAccess({ ...base, regionCode: 'GB', hasOptIn: true }).decision).toBe('blocked');
    expect(resolveNsfwAccess({ ...base, regionCode: 'GB', hasVerified: true }).decision).toBe('blocked');
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
    const r = resolveNsfwAccess({ ...base, regionCode: 'US-CA', hasVerified: true });
    expect(r.decision).toBe('needs_optin');
  });
});

// While Wallet is parked, law states behave exactly like the UK — no access path.
describe('resolveNsfwAccess — law states while Wallet PARKED', () => {
  it('blocks law-state users regardless of opt-in/verify', () => {
    expect(resolveNsfwAccess({ ...base, regionCode: 'US-KS' }).decision).toBe('blocked');
    expect(resolveNsfwAccess({ ...base, regionCode: 'US-TX', hasOptIn: true }).decision).toBe('blocked');
    // Even a previously-verified user is blocked while the tier is parked.
    expect(resolveNsfwAccess({ ...base, regionCode: 'US-TX', hasVerified: true, hasOptIn: true }).decision).toBe('blocked');
  });
});

// Stage-2 behavior: kept green so re-enabling Wallet doesn't regress the verify flow.
describe('resolveNsfwAccess — law states with Wallet ENABLED (Stage 2)', () => {
  it('requires WALLET verify FIRST in a law state (before the content toggle)', () => {
    withWalletEnabled(() => {
      const fresh = resolveNsfwAccess({ ...base, regionCode: 'US-KS' });
      expect(fresh.decision).toBe('needs_verify');
      expect(fresh.remediation).toBe('verify_with_wallet');
      const optedIn = resolveNsfwAccess({ ...base, regionCode: 'US-TX', hasOptIn: true });
      expect(optedIn.decision).toBe('needs_verify');
    });
  });

  it('after wallet verify, a law state still requires the content toggle', () => {
    withWalletEnabled(() => {
      const verifiedNoToggle = resolveNsfwAccess({ ...base, regionCode: 'US-WY', hasVerified: true });
      expect(verifiedNoToggle.decision).toBe('needs_optin');
      const both = resolveNsfwAccess({ ...base, regionCode: 'US-TX', hasOptIn: true, hasVerified: true });
      expect(both.decision).toBe('allow');
      expect(both.reason).toBe('verified');
    });
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

  it('classifies EVERY law state as verify by law (list preserved for Stage 2)', () => {
    for (const code of VERIFY_REGIONS) expect(lawRegionTier(code)).toBe('verify');
  });

  it('while parked, geo-blocks every law state and the configured block set', () => {
    for (const code of VERIFY_REGIONS) expect(regionTier(code)).toBe('blocked');
    for (const code of BLOCKED_REGIONS) expect(regionTier(code)).toBe('blocked');
  });

  it('with Wallet enabled, blocks only the configured set, not the verify states', () => {
    withWalletEnabled(() => {
      for (const code of VERIFY_REGIONS) expect(regionTier(code)).not.toBe('blocked');
      for (const code of BLOCKED_REGIONS) expect(regionTier(code)).toBe('blocked');
    });
  });

  it('treats common no-law US states as open (not over-blocking)', () => {
    for (const code of ['US-CA', 'US-WA', 'US-NY', 'US-CO', 'US-OR', 'US-MA']) {
      expect(regionTier(code)).toBe('open');
    }
  });
});
