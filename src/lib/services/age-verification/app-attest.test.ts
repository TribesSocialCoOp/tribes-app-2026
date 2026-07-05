/**
 * Unit tests for the App Attest logic we own (app-attest.ts) — the anti-replay counter,
 * per-user key binding, payload binding, and failure surfacing. The cryptographic verify
 * (attestation / assertion) is delegated to appattest-checker-node and mocked here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'crypto';

vi.mock('server-only', () => ({}));

let verifyAssertionResult: unknown = { signCount: 5 };
const verifyAssertionMock = vi.fn(async () => verifyAssertionResult);
vi.mock('appattest-checker-node', () => ({
  verifyAssertion: (...args: unknown[]) => verifyAssertionMock(...args),
  verifyAttestation: vi.fn(async () => ({ publicKeyPem: 'PEM', receipt: Buffer.from('r') })),
}));

let selectRows: Array<{ publicKeyPem: string; signCount: number }> = [];
let updatedRows: Array<{ keyId: string }> = [{ keyId: 'k1' }];
const updateReturning = vi.fn(async () => updatedRows);
const updateWhere = vi.fn(() => ({ returning: updateReturning }));
const updateSet = vi.fn(() => ({ where: updateWhere }));
vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => selectRows }) }) }),
    update: () => ({ set: updateSet }),
  },
}));
vi.mock('@/db/schema', () => ({ appAttestKeys: { keyId: 'key_id', userId: 'user_id', publicKeyPem: 'pk', signCount: 'sc' } }));
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
  and: (...x: unknown[]) => x,
  lt: (a: unknown, b: unknown) => ({ lt: [a, b] }),
}));

import { assertAttestation } from './app-attest';

beforeEach(() => {
  vi.stubEnv('APPLE_APP_ATTEST_APP_ID', 'TEAMID1234.app.tribes.TribesApp');
  verifyAssertionResult = { signCount: 5 };
  selectRows = [{ publicKeyPem: 'PEM', signCount: 4 }];
  updatedRows = [{ keyId: 'k1' }];
  verifyAssertionMock.mockClear();
  updateSet.mockClear();
  updateWhere.mockClear();
  updateReturning.mockClear();
});

const base = { keyId: 'k1', assertionBase64: 'a1', payload: 'tribes-age-v2|n1|1|self_declared|0', userId: 'u1' };

describe('assertAttestation', () => {
  it('rejects a submission with no keyId/assertion', async () => {
    await expect(assertAttestation({ payload: base.payload, userId: 'u1' })).rejects.toThrow(/missing/i);
  });

  it('rejects when no key is registered for this user (binding)', async () => {
    selectRows = []; // key unknown or owned by a different user
    await expect(assertAttestation(base)).rejects.toThrow(/not registered/i);
  });

  it('rejects when the library reports a bad signature', async () => {
    verifyAssertionResult = { verifyError: 'fail_signature_verification' };
    await expect(assertAttestation(base)).rejects.toThrow(/assertion failed/i);
  });

  it('verifies the signature over SHA256 of the FULL canonical payload (claim binding)', async () => {
    await assertAttestation(base);
    const expectedHash = createHash('sha256').update(base.payload, 'utf8').digest();
    expect(verifyAssertionMock.mock.calls[0][0]).toEqual(expectedHash);
  });

  it('rejects a replay: the sign counter did not advance', async () => {
    selectRows = [{ publicKeyPem: 'PEM', signCount: 5 }]; // stored == returned
    verifyAssertionResult = { signCount: 5 };
    await expect(assertAttestation(base)).rejects.toThrow(/replay/i);
  });

  it('rejects a concurrent replay: compare-and-set update matched no row', async () => {
    updatedRows = []; // another request already advanced the counter past ours
    await expect(assertAttestation(base)).rejects.toThrow(/replay/i);
  });

  it('accepts a valid, advancing assertion and persists the new counter', async () => {
    selectRows = [{ publicKeyPem: 'PEM', signCount: 4 }];
    verifyAssertionResult = { signCount: 5 };
    await expect(assertAttestation(base)).resolves.toBeUndefined();
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ signCount: 5 }));
  });
});
