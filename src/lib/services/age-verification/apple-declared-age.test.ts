/**
 * Unit tests for the Apple Declared Age Range provider (providers/apple-declared-age.ts):
 * the server-side trust logic — nonce required, confirmed-declaration policy, over-18
 * gate, and the App Attest prod-rejection (Phase 1 is dev/staging-only).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { appleDeclaredAgeProvider } from './providers/apple-declared-age';

const ctx = { expectedUserId: 'u1' };
const req = (attestation: unknown) => ({ provider: 'apple_declared_age_range' as const, attestation });

afterEach(() => vi.unstubAllEnvs());

describe('appleDeclaredAgeProvider.isAvailable', () => {
  it('is off by default and on with the flag', () => {
    expect(appleDeclaredAgeProvider.isAvailable()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_IOS_AGE_VERIFY_ENABLED', 'true');
    expect(appleDeclaredAgeProvider.isAvailable()).toBe(true);
  });
});

describe('appleDeclaredAgeProvider.verify (non-production)', () => {
  it('rejects a missing attestation', async () => {
    await expect(appleDeclaredAgeProvider.verify(req(undefined), ctx)).rejects.toThrow(/attestation/i);
  });

  it('rejects an attestation with no server nonce', async () => {
    await expect(
      appleDeclaredAgeProvider.verify(req({ over18: true, declaration: 'government_id' }), ctx),
    ).rejects.toThrow(/nonce/i);
  });

  it('verifies an over-18 government-ID-confirmed result (nonce returned, marked fail-closed)', async () => {
    const r = await appleDeclaredAgeProvider.verify(req({ nonce: 'n1', over18: true, declaration: 'government_id' }), ctx);
    expect(r).toEqual({ verified: true, method: 'apple_declared_age_range', nonce: 'n1', nonceFailClosed: true });
  });

  it('accepts payment-confirmed as a confirmed level', async () => {
    const r = await appleDeclaredAgeProvider.verify(req({ nonce: 'n1', over18: true, declaration: 'payment' }), ctx);
    expect(r.verified).toBe(true);
  });

  it('accepts "other" (checkedByOtherMethod — account-history / card-on-file confirmation)', async () => {
    // Apple confirms adulthood from account longevity or a card on file and returns
    // checkedByOtherMethod → normalized 'other'. This is independent confirmation, not
    // self-attestation, so it must pass (the original bug rejected it).
    const r = await appleDeclaredAgeProvider.verify(req({ nonce: 'n1', over18: true, declaration: 'other' }), ctx);
    expect(r.verified).toBe(true);
  });

  it('does NOT verify a self-declared age (bare self-attestation, unconfirmed)', async () => {
    const r = await appleDeclaredAgeProvider.verify(req({ nonce: 'n1', over18: true, declaration: 'self_declared' }), ctx);
    expect(r.verified).toBe(false);
    expect(r.nonce).toBe('n1');
  });

  it('does NOT verify guardian-declared or unknown levels', async () => {
    for (const declaration of ['guardian_declared', 'unknown']) {
      const r = await appleDeclaredAgeProvider.verify(req({ nonce: 'n1', over18: true, declaration }), ctx);
      expect(r.verified).toBe(false);
    }
  });

  it('does NOT verify when over18 is false', async () => {
    const r = await appleDeclaredAgeProvider.verify(req({ nonce: 'n1', over18: false, declaration: 'government_id' }), ctx);
    expect(r.verified).toBe(false);
  });
});

describe('appleDeclaredAgeProvider.verify (real production — App Attest gate)', () => {
  it('rejects an unattested result in real production (Phase 1)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(
      appleDeclaredAgeProvider.verify(req({ nonce: 'n1', over18: true, declaration: 'government_id' }), ctx),
    ).rejects.toThrow(/not enabled in production/i);
  });

  it('an env flag alone CANNOT open prod — App Attest verification must exist (no bypass)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('IOS_AGE_APP_ATTEST_ENABLED', 'true'); // ops mistake / premature flip
    await expect(
      appleDeclaredAgeProvider.verify(req({ nonce: 'n1', over18: true, declaration: 'government_id', appAttest: { foo: 1 } }), ctx),
    ).rejects.toThrow(/App Attest pending/i);
  });

  it('staging (prod build + TRIBES_ENV=staging) accepts for device testing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TRIBES_ENV', 'staging');
    const r = await appleDeclaredAgeProvider.verify(req({ nonce: 'n1', over18: true, declaration: 'government_id' }), ctx);
    expect(r.verified).toBe(true);
  });
});
