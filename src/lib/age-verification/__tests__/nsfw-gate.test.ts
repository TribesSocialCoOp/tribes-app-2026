/**
 * Unit tests for the two NSFW visibility helpers (nsfw-gate.ts):
 *   canSeeNsfw     = decision === 'allow'      → may VIEW adult content
 *   canDiscoverNsfw = decision !== 'blocked'   → listed adult tribes show in discovery/search
 *
 * The distinction is the whole point: a user who merely needs to opt-in or verify should
 * still SEE listed adult tribes (and be led to the gate), while only geo-blocked regions
 * hide them. resolveNsfwAccess is exercised directly elsewhere; here we lock in the mapping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// nsfw-gate.ts is `import 'server-only'` — no-op it in the test runtime.
vi.mock('server-only', () => ({}));

let mockRegion: { country: string | null; subdivision: string | null } = { country: 'US', subdivision: 'CA' };
let mockOptIn: Date | null = null;
let mockVerified: Date | null = null;

vi.mock('@/lib/geo/resolve-region', () => ({
  getRequestRegion: vi.fn(async () => mockRegion),
  getSurface: vi.fn(async () => 'web'),
  regionCode: (r: { country: string | null; subdivision: string | null }) =>
    !r.country ? '' : r.subdivision ? `${r.country}-${r.subdivision}` : r.country,
}));

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ showAdultContentAt: mockOptIn, ageVerifiedAt: mockVerified }]),
        })),
      })),
    })),
  },
}));

vi.mock('@/db/schema', () => ({
  users: { id: 'id', showAdultContentAt: 'showAdultContentAt', ageVerifiedAt: 'ageVerifiedAt' },
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn((_c: any, v: any) => `eq(${v})`) }));

// @/lib/geo/age-policy is NOT mocked — real regionTier + resolveNsfwAccess run.

import { canSeeNsfw, canDiscoverNsfw } from '@/lib/age-verification/nsfw-gate';

beforeEach(() => {
  mockRegion = { country: 'US', subdivision: 'CA' };
  mockOptIn = null;
  mockVerified = null;
});

describe('canSeeNsfw vs canDiscoverNsfw', () => {
  it('blocked region: hidden from BOTH view and discovery', async () => {
    mockRegion = { country: 'GB', subdivision: null };
    expect(await canSeeNsfw('u1')).toBe(false);
    expect(await canDiscoverNsfw('u1')).toBe(false);
  });

  it('open region, not opted in (needs_optin): cannot view, but discoverable', async () => {
    mockRegion = { country: 'US', subdivision: 'CA' };
    expect(await canSeeNsfw('u1')).toBe(false);       // decision = needs_optin
    expect(await canDiscoverNsfw('u1')).toBe(true);   // not blocked → shows in discovery
  });

  it('open region, opted in (allow): can view and discover', async () => {
    mockRegion = { country: 'US', subdivision: 'CA' };
    mockOptIn = new Date();
    expect(await canSeeNsfw('u1')).toBe(true);
    expect(await canDiscoverNsfw('u1')).toBe(true);
  });

  it('law-state region, not verified (needs_verify): cannot view, but discoverable', async () => {
    mockRegion = { country: 'US', subdivision: 'TX' };
    expect(await canSeeNsfw('u1')).toBe(false);       // decision = needs_verify
    expect(await canDiscoverNsfw('u1')).toBe(true);
  });

  it('guest in a non-blocked region: canDiscoverNsfw is true at this layer (guest-hiding lives in data-access)', async () => {
    mockRegion = { country: 'US', subdivision: 'CA' };
    expect(await canDiscoverNsfw(null)).toBe(true);
    expect(await canSeeNsfw(null)).toBe(false);
  });
});
