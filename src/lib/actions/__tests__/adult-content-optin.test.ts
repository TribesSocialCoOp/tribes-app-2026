/**
 * Unit tests for setAdultContentOptIn (age-actions.ts) — the two server-side guards:
 *   1. WEB-ONLY: the content toggle can only be enabled on the web (App Store hedge).
 *   2. VERIFY-FIRST: in law-state ("verify") regions, Google Wallet age verification is a
 *      prerequisite — the toggle can't be enabled until users.ageVerifiedAt is set.
 *
 * These guards are where a regression would silently let a native user, or an unverified
 * law-state user, opt in — so they're worth locking down. withPublicErrors returns
 * { serverError } (it does not throw) on a handled PublicError.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// age-actions now reaches nsfw-gate.ts (getUserNsfwFlags), which is `import 'server-only'`
// — no-op it in the test runtime.
vi.mock('server-only', () => ({}));

// ── Configurable mock state ────────────────────────────────────────
let mockSurface: 'web' | 'ios' | 'android' = 'web';
let mockRegion: { country: string | null; subdivision: string | null } = { country: 'US', subdivision: 'CA' };
let mockAgeVerifiedAt: Date | null = null;
let mockUpdateCalls: any[] = [];

vi.mock('@/lib/actions/shared', () => ({
  requireAuth: vi.fn(async () => 'user-1'),
  getCurrentUserId: vi.fn(async () => 'user-1'),
}));

vi.mock('@/lib/geo/resolve-region', () => ({
  getSurface: vi.fn(async () => mockSurface),
  getRequestRegion: vi.fn(async () => mockRegion),
  // Keep regionCode faithful so the REAL regionTier classifies it correctly.
  regionCode: (r: { country: string | null; subdivision: string | null }) =>
    !r.country ? '' : r.subdivision ? `${r.country}-${r.subdivision}` : r.country,
}));

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ ageVerifiedAt: mockAgeVerifiedAt }]),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((setObj: any) => ({
        where: vi.fn(async () => { mockUpdateCalls.push(setObj); }),
      })),
    })),
  },
}));

vi.mock('@/db/schema', () => ({
  users: { id: 'id', ageVerifiedAt: 'ageVerifiedAt', showAdultContentAt: 'showAdultContentAt' },
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn((_c: any, v: any) => `eq(${v})`) }));

// NOTE: @/lib/geo/age-policy is intentionally NOT mocked — the real regionTier runs.

import { setAdultContentOptIn } from '@/lib/actions/age-actions';

beforeEach(() => {
  mockSurface = 'web';
  mockRegion = { country: 'US', subdivision: 'CA' }; // open tier
  mockAgeVerifiedAt = null;
  mockUpdateCalls = [];
});

describe('setAdultContentOptIn', () => {
  it('rejects enabling on a native surface (web-only)', async () => {
    mockSurface = 'ios';
    const res = await setAdultContentOptIn(true);
    expect(res).toMatchObject({ serverError: expect.stringMatching(/website/i) });
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it('allows enabling on web in an open region (self-attest, no wallet needed)', async () => {
    mockRegion = { country: 'US', subdivision: 'CA' }; // open
    const res = await setAdultContentOptIn(true);
    expect(res).toEqual({ enabled: true });
    expect(mockUpdateCalls).toHaveLength(1);
    expect(mockUpdateCalls[0].showAdultContentAt).toBeInstanceOf(Date);
  });

  // VERIFY-FIRST guard is a Stage-2 (Wallet enabled) behavior: while Wallet is parked,
  // law states resolve to the `blocked` tier, not `verify`, so this branch is dormant.
  describe('with Google Wallet ENABLED (Stage 2)', () => {
    beforeEach(() => vi.stubEnv('NEXT_PUBLIC_WALLET_VERIFY_ENABLED', 'true'));
    afterEach(() => vi.unstubAllEnvs());

    it('blocks enabling in a law-state region when NOT age-verified', async () => {
      mockRegion = { country: 'US', subdivision: 'TX' }; // verify tier
      mockAgeVerifiedAt = null;
      const res = await setAdultContentOptIn(true);
      expect(res).toMatchObject({ serverError: expect.stringMatching(/verify your age/i) });
      expect(mockUpdateCalls).toHaveLength(0);
    });

    it('allows enabling in a law-state region once age-verified', async () => {
      mockRegion = { country: 'US', subdivision: 'TX' }; // verify tier
      mockAgeVerifiedAt = new Date();
      const res = await setAdultContentOptIn(true);
      expect(res).toEqual({ enabled: true });
      expect(mockUpdateCalls).toHaveLength(1);
    });
  });

  // While Wallet is PARKED a law-state region is `blocked`, so the verify-first guard
  // doesn't fire — the toggle is settable but inert (the NSFW gate blocks content
  // regardless), matching how the UK behaves today.
  it('while Wallet parked, enabling in a law-state region succeeds but is gate-inert', async () => {
    mockRegion = { country: 'US', subdivision: 'TX' };
    mockAgeVerifiedAt = null;
    const res = await setAdultContentOptIn(true);
    expect(res).toEqual({ enabled: true });
    expect(mockUpdateCalls).toHaveLength(1);
  });

  it('allows DISABLING in any region without verification (guard is enable-only)', async () => {
    mockRegion = { country: 'US', subdivision: 'TX' };
    mockAgeVerifiedAt = null;
    const res = await setAdultContentOptIn(false);
    expect(res).toEqual({ enabled: false });
    expect(mockUpdateCalls).toHaveLength(1);
    expect(mockUpdateCalls[0].showAdultContentAt).toBeNull();
  });
});
