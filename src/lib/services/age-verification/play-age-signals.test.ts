/**
 * Unit tests for the Play Age Signals provider (providers/play-age-signals.ts) — the
 * Android server-side trust logic. Mirrors the iOS provider tests; policy itself is
 * covered in os-age-policy.test.ts.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { playAgeSignalsProvider } from './providers/play-age-signals';

const ctx = { expectedUserId: 'u1' };
const req = (attestation: unknown) => ({ provider: 'play_age_signals' as const, attestation });

afterEach(() => vi.unstubAllEnvs());

describe('playAgeSignalsProvider.isAvailable', () => {
  it('is off by default and on with the flag', () => {
    expect(playAgeSignalsProvider.isAvailable()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_PLAY_AGE_VERIFY_ENABLED', 'true');
    expect(playAgeSignalsProvider.isAvailable()).toBe(true);
  });
});

describe('playAgeSignalsProvider.verify (non-production)', () => {
  it('rejects a missing attestation', async () => {
    await expect(playAgeSignalsProvider.verify(req(undefined), ctx)).rejects.toThrow(/attestation/i);
  });

  it('rejects an attestation with no server nonce', async () => {
    await expect(
      playAgeSignalsProvider.verify(req({ over18: true, userStatus: 'VERIFIED' }), ctx),
    ).rejects.toThrow(/nonce/i);
  });

  it('verifies an 18+ result (nonce returned, marked fail-closed)', async () => {
    const r = await playAgeSignalsProvider.verify(req({ nonce: 'n1', over18: true, userStatus: 'DECLARED' }), ctx);
    expect(r).toEqual({ verified: true, method: 'play_age_signals', nonce: 'n1', nonceFailClosed: true });
  });

  it('accepts a plain DECLARED (self-declared) 18+ user — the band is the gate', async () => {
    const r = await playAgeSignalsProvider.verify(req({ nonce: 'n1', over18: true, userStatus: 'DECLARED' }), ctx);
    expect(r.verified).toBe(true);
  });

  it('blocks a SUPERVISED (Family Link) account even if the band says 18+', async () => {
    const r = await playAgeSignalsProvider.verify(
      req({ nonce: 'n1', over18: true, userStatus: 'SUPERVISED', parentalControlsActive: true }), ctx);
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/supervised|family link/i);
  });

  it('blocks an under-18 band (the kid gate)', async () => {
    const r = await playAgeSignalsProvider.verify(req({ nonce: 'n1', over18: false, userStatus: 'SUPERVISED', parentalControlsActive: true }), ctx);
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/under 18/i);
  });

  it('blocks a missing signal (fail closed) with a reason', async () => {
    const r = await playAgeSignalsProvider.verify(req({ nonce: 'n1', userStatus: 'UNKNOWN' }), ctx);
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/age signal/i);
  });

  it('with ANDROID_AGE_REQUIRE_CONFIRMED, rejects DECLARED but accepts VERIFIED', async () => {
    vi.stubEnv('ANDROID_AGE_REQUIRE_CONFIRMED', 'true');
    const declared = await playAgeSignalsProvider.verify(req({ nonce: 'n1', over18: true, userStatus: 'DECLARED' }), ctx);
    expect(declared.verified).toBe(false);
    const verified = await playAgeSignalsProvider.verify(req({ nonce: 'n1', over18: true, userStatus: 'VERIFIED' }), ctx);
    expect(verified.verified).toBe(true);
  });
});

describe('playAgeSignalsProvider.verify (real production — Play Integrity gate)', () => {
  it('rejects an unattested result in real production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(
      playAgeSignalsProvider.verify(req({ nonce: 'n1', over18: true, userStatus: 'VERIFIED' }), ctx),
    ).rejects.toThrow(/not enabled in production/i);
  });

  it('an env flag alone cannot open prod (Play Integrity must exist)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ANDROID_AGE_PLAY_INTEGRITY_ENABLED', 'true');
    await expect(
      playAgeSignalsProvider.verify(req({ nonce: 'n1', over18: true, userStatus: 'VERIFIED', integrityToken: { x: 1 } }), ctx),
    ).rejects.toThrow(/Play Integrity pending/i);
  });

  it('staging accepts for device testing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TRIBES_ENV', 'staging');
    const r = await playAgeSignalsProvider.verify(req({ nonce: 'n1', over18: true, userStatus: 'DECLARED' }), ctx);
    expect(r.verified).toBe(true);
  });
});
