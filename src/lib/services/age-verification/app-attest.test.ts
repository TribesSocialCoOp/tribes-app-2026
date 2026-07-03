/**
 * Unit tests for the App Attest logic we own (app-attest.ts) — the anti-replay counter,
 * per-user key binding, and failure surfacing. The cryptographic verify (attestation /
 * assertion) is delegated to appattest-checker-node and mocked here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let verifyAssertionResult: unknown = { signCount: 5 };
vi.mock('appattest-checker-node', () => ({
  verifyAssertion: vi.fn(async () => verifyAssertionResult),
  verifyAttestation: vi.fn(async () => ({ publicKeyPem: 'PEM', receipt: Buffer.from('r') })),
}));

let selectRows: Array<{ publicKeyPem: string; signCount: number }> = [];
const updateWhere = vi.fn(async () => {});
const updateSet = vi.fn(() => ({ where: updateWhere }));
vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => selectRows }) }) }),
    update: () => ({ set: updateSet }),
  },
}));
vi.mock('@/db/schema', () => ({ appAttestKeys: { keyId: 'key_id', userId: 'user_id', publicKeyPem: 'pk', signCount: 'sc' } }));
vi.mock('drizzle-orm', () => ({ eq: (a: unknown, b: unknown) => ({ a, b }), and: (...x: unknown[]) => x }));

import { assertAttestation } from './app-attest';

beforeEach(() => {
  vi.stubEnv('APPLE_APP_ATTEST_APP_ID', 'TEAMID1234.app.tribes.TribesApp');
  verifyAssertionResult = { signCount: 5 };
  selectRows = [{ publicKeyPem: 'PEM', signCount: 4 }];
  updateSet.mockClear();
  updateWhere.mockClear();
});

const base = { keyId: 'k1', assertionBase64: 'a1', nonce: 'n1', userId: 'u1' };

describe('assertAttestation', () => {
  it('rejects a submission with no keyId/assertion', async () => {
    await expect(assertAttestation({ nonce: 'n1', userId: 'u1' })).rejects.toThrow(/missing/i);
  });

  it('rejects when no key is registered for this user (binding)', async () => {
    selectRows = []; // key unknown or owned by a different user
    await expect(assertAttestation(base)).rejects.toThrow(/not registered/i);
  });

  it('rejects when the library reports a bad signature', async () => {
    verifyAssertionResult = { verifyError: 'fail_signature_verification' };
    await expect(assertAttestation(base)).rejects.toThrow(/assertion failed/i);
  });

  it('rejects a replay: the sign counter did not advance', async () => {
    selectRows = [{ publicKeyPem: 'PEM', signCount: 5 }]; // stored == returned
    verifyAssertionResult = { signCount: 5 };
    await expect(assertAttestation(base)).rejects.toThrow(/replay/i);
  });

  it('accepts a valid, advancing assertion and persists the new counter', async () => {
    selectRows = [{ publicKeyPem: 'PEM', signCount: 4 }];
    verifyAssertionResult = { signCount: 5 };
    await expect(assertAttestation(base)).resolves.toBeUndefined();
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ signCount: 5 }));
  });
});
