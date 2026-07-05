/**
 * Unit tests for the Apple Declared Age Range provider (providers/apple-declared-age.ts):
 * the server-side trust logic — nonce required, over-18 kid gate, parental-controls block,
 * and the App Attest anti-forgery boundary. NOTE: App Attest is ANTI-FORGERY (proves a
 * genuine app produced the submission); it is ORTHOGONAL to age assurance — we still
 * accept Apple's self-declared 18+ (IOS_AGE_REQUIRE_CONFIRMED is off by default).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

// App Attest is a server-only module (db + crypto lib); mock it so these stay pure unit
// tests. iosAppAttestEnabled + assertAttestation are controlled per-test.
let attestEnabled = false;
const assertAttestationMock = vi.fn(async (_arg?: unknown) => {});
vi.mock('@/lib/services/age-verification/app-attest', () => ({
  iosAppAttestEnabled: () => attestEnabled,
  assertAttestation: (arg: unknown) => assertAttestationMock(arg),
}));

import { appleDeclaredAgeProvider } from './providers/apple-declared-age';

const ctx = { expectedUserId: 'u1' };
const req = (attestation: unknown) => ({ provider: 'apple_declared_age_range' as const, attestation });

beforeEach(() => { attestEnabled = false; assertAttestationMock.mockReset(); assertAttestationMock.mockResolvedValue(undefined); });
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

  it('verifies an over-18 result (nonce returned, marked fail-closed)', async () => {
    const r = await appleDeclaredAgeProvider.verify(req({ nonce: 'n1', over18: true, declaration: 'government_id' }), ctx);
    expect(r).toEqual({ verified: true, method: 'apple_declared_age_range', nonce: 'n1', nonceFailClosed: true });
  });

  it('accepts a 18+ result regardless of declaration METHOD (the age band is the kid gate)', async () => {
    // Apple returns self_declared for essentially all adult accounts; the confirmed
    // levels are for minors in Family Sharing or new accounts in enforcing law-states.
    // The declaration method does not change whether the person is a minor — the age
    // band does — so we accept any Apple 18+ signal here (recorded for audit).
    for (const declaration of ['self_declared', 'other', 'government_id', 'payment', 'unknown']) {
      const r = await appleDeclaredAgeProvider.verify(req({ nonce: 'n1', over18: true, declaration }), ctx);
      expect(r.verified).toBe(true);
    }
  });

  it('does NOT verify when the age band is under 18 (the kid gate), with a reason', async () => {
    const r = await appleDeclaredAgeProvider.verify(req({ nonce: 'n1', over18: false, declaration: 'guardian_declared' }), ctx);
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/under 18/i);
  });

  it('blocks a managed / child device (active parental controls) even if the band says 18+', async () => {
    const r = await appleDeclaredAgeProvider.verify(
      req({ nonce: 'n1', over18: true, declaration: 'self_declared', parentalControlsActive: true }), ctx);
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/parental controls|managed|child/i);
  });

  it('allows an 18+ device with parental controls when the block flag is OFF', async () => {
    vi.stubEnv('IOS_AGE_BLOCK_ON_PARENTAL_CONTROLS', 'false');
    const r = await appleDeclaredAgeProvider.verify(
      req({ nonce: 'n1', over18: true, declaration: 'self_declared', parentalControlsActive: true }), ctx);
    expect(r.verified).toBe(true);
  });

  it('blocks a missing age signal when definitive signal is required (default)', async () => {
    const r = await appleDeclaredAgeProvider.verify(req({ nonce: 'n1', declaration: 'self_declared' }), ctx);
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/age signal/i);
  });
});

describe('appleDeclaredAgeProvider.verify — IOS_AGE_REQUIRE_CONFIRMED (opt-in)', () => {
  it('rejects self_declared when confirmed is required', async () => {
    vi.stubEnv('IOS_AGE_REQUIRE_CONFIRMED', 'true');
    const r = await appleDeclaredAgeProvider.verify(req({ nonce: 'n1', over18: true, declaration: 'self_declared' }), ctx);
    expect(r.verified).toBe(false);
  });

  it('accepts a confirmed level (government_id / payment / other) when required', async () => {
    vi.stubEnv('IOS_AGE_REQUIRE_CONFIRMED', 'true');
    for (const declaration of ['government_id', 'payment', 'other']) {
      const r = await appleDeclaredAgeProvider.verify(req({ nonce: 'n1', over18: true, declaration }), ctx);
      expect(r.verified).toBe(true);
    }
  });
});

describe('appleDeclaredAgeProvider.verify — App Attest OFF (pre-enable)', () => {
  it('rejects an unattested result in real production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(
      appleDeclaredAgeProvider.verify(req({ nonce: 'n1', over18: true, declaration: 'government_id' }), ctx),
    ).rejects.toThrow(/not enabled in production/i);
  });

  it('staging (prod build + TRIBES_ENV=staging) accepts for device testing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TRIBES_ENV', 'staging');
    const r = await appleDeclaredAgeProvider.verify(req({ nonce: 'n1', over18: true, declaration: 'government_id' }), ctx);
    expect(r.verified).toBe(true);
  });
});

describe('appleDeclaredAgeProvider.verify — App Attest ON (enforced everywhere)', () => {
  beforeEach(() => { attestEnabled = true; });

  it('verifies the assertion over the canonical claim payload and passes on success — even in real prod', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const r = await appleDeclaredAgeProvider.verify(
      req({ nonce: 'n1', over18: true, declaration: 'self_declared', keyId: 'k1', assertion: 'a1' }), ctx);
    expect(r.verified).toBe(true);
    // The payload binds the SUBMITTED claims (nonce + over18 + declaration + parental
    // controls) into the signature — not just the nonce.
    expect(assertAttestationMock).toHaveBeenCalledWith({
      keyId: 'k1',
      assertionBase64: 'a1',
      payload: 'tribes-age-v2|n1|1|self_declared|0',
      userId: 'u1',
    });
  });

  it('ACCEPTS self-declared 18+ with a valid assertion — App Attest is anti-forgery, not age-assurance', async () => {
    const r = await appleDeclaredAgeProvider.verify(
      req({ nonce: 'n1', over18: true, declaration: 'self_declared', keyId: 'k1', assertion: 'a1' }), ctx);
    expect(r.verified).toBe(true);
  });

  it('rejects when the assertion fails (missing key / bad signature / replay)', async () => {
    assertAttestationMock.mockRejectedValue(new Error('App Attest key is not registered for this account.'));
    await expect(
      appleDeclaredAgeProvider.verify(req({ nonce: 'n1', over18: true, declaration: 'self_declared', keyId: 'k1', assertion: 'bad' }), ctx),
    ).rejects.toThrow(/not registered/i);
  });

  it('still blocks a minor BEFORE the attestation check (kid gate first)', async () => {
    const r = await appleDeclaredAgeProvider.verify(req({ nonce: 'n1', over18: false, keyId: 'k1', assertion: 'a1' }), ctx);
    expect(r.verified).toBe(false);
    expect(assertAttestationMock).not.toHaveBeenCalled();
  });
});
