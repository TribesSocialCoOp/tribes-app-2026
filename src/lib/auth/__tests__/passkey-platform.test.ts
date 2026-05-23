/**
 * @fileoverview Unit tests for passkey-platform.ts
 *
 * These are REAL tests that execute the code with mocked dependencies
 * and verify the correct API is called with correct arguments for each
 * platform. NOT source-code grep.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock setup ──────────────────────────────────────────────

// Mock CapacitorPasskey
const mockGetCredential = vi.fn();
const mockCreateCredential = vi.fn();
vi.mock('@capgo/capacitor-passkey', () => ({
  CapacitorPasskey: {
    getCredential: (...args: any[]) => mockGetCredential(...args),
    createCredential: (...args: any[]) => mockCreateCredential(...args),
  },
}));

// Mock @simplewebauthn/browser
const mockStartAuthentication = vi.fn();
const mockStartRegistration = vi.fn();
vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: (...args: any[]) => mockStartAuthentication(...args),
  startRegistration: (...args: any[]) => mockStartRegistration(...args),
}));

import { authenticatePasskey, registerPasskey } from '@/lib/auth/passkey-platform';

// ── Test fixtures ────────────────────────────────────────────

const MOCK_AUTH_OPTIONS = {
  challenge: 'dGVzdC1jaGFsbGVuZ2U',
  rpId: 'tribes.app',
  timeout: 60000,
  allowCredentials: [
    { id: 'Y3JlZC0x', type: 'public-key' as const, transports: ['internal' as const] },
  ],
  userVerification: 'preferred' as const,
  extensions: { prf: { eval: { first: 'c2FsdA' } } },
};

const MOCK_REG_OPTIONS = {
  challenge: 'dGVzdC1jaGFsbGVuZ2U',
  rp: { id: 'tribes.app', name: 'Tribes' },
  user: { id: 'dXNlci0x', name: 'test@tribes.app', displayName: 'Test User' },
  pubKeyCredParams: [{ type: 'public-key' as const, alg: -7 }],
  timeout: 60000,
  excludeCredentials: [],
  authenticatorSelection: {
    authenticatorAttachment: 'platform' as const,
    residentKey: 'required' as const,
    userVerification: 'preferred' as const,
  },
  attestation: 'none' as const,
  extensions: {},
};

const MOCK_AUTH_RESPONSE = {
  id: 'Y3JlZC0x',
  rawId: 'Y3JlZC0x',
  type: 'public-key' as const,
  response: {
    clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0In0',
    authenticatorData: 'SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2M',
    signature: 'c2lnbmF0dXJl',
    userHandle: 'dXNlci0x',
  },
  clientExtensionResults: {},
  authenticatorAttachment: 'platform' as const,
};

const MOCK_REG_RESPONSE = {
  id: 'Y3JlZC0x',
  rawId: 'Y3JlZC0x',
  type: 'public-key' as const,
  response: {
    clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIn0',
    attestationObject: 'o2NmbXRkbm9uZQ',
    transports: ['internal'],
  },
  clientExtensionResults: {},
  authenticatorAttachment: 'platform' as const,
};

// ──────────────────────────────────────────────────────────────
// authenticatePasskey
// ──────────────────────────────────────────────────────────────

describe('authenticatePasskey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Native path ──────────────────────────────────────

  describe('native (isNative = true)', () => {
    beforeEach(() => {
      mockGetCredential.mockResolvedValue(MOCK_AUTH_RESPONSE);
    });

    it('calls CapacitorPasskey.getCredential', async () => {
      await authenticatePasskey(MOCK_AUTH_OPTIONS, true);
      expect(mockGetCredential).toHaveBeenCalledTimes(1);
    });

    it('does NOT call startAuthentication', async () => {
      await authenticatePasskey(MOCK_AUTH_OPTIONS, true);
      expect(mockStartAuthentication).not.toHaveBeenCalled();
    });

    it('passes mediation field (required for plugin routing)', async () => {
      await authenticatePasskey(MOCK_AUTH_OPTIONS, true);
      const callArgs = mockGetCredential.mock.calls[0]![0];
      expect(callArgs).toHaveProperty('mediation');
      expect(callArgs.mediation).toBeDefined();
    });

    it('passes challenge in publicKey', async () => {
      await authenticatePasskey(MOCK_AUTH_OPTIONS, true);
      const callArgs = mockGetCredential.mock.calls[0]![0];
      expect(callArgs.publicKey.challenge).toBe(MOCK_AUTH_OPTIONS.challenge);
    });

    it('passes rpId in publicKey', async () => {
      await authenticatePasskey(MOCK_AUTH_OPTIONS, true);
      const callArgs = mockGetCredential.mock.calls[0]![0];
      expect(callArgs.publicKey.rpId).toBe('tribes.app');
    });

    it('passes allowCredentials with correct shape', async () => {
      await authenticatePasskey(MOCK_AUTH_OPTIONS, true);
      const callArgs = mockGetCredential.mock.calls[0]![0];
      expect(callArgs.publicKey.allowCredentials).toEqual([
        { id: 'Y3JlZC0x', type: 'public-key', transports: ['internal'] },
      ]);
    });

    it('passes extensions', async () => {
      await authenticatePasskey(MOCK_AUTH_OPTIONS, true);
      const callArgs = mockGetCredential.mock.calls[0]![0];
      expect(callArgs.publicKey.extensions).toEqual(MOCK_AUTH_OPTIONS.extensions);
    });

    it('returns the plugin response', async () => {
      const result = await authenticatePasskey(MOCK_AUTH_OPTIONS, true);
      expect(result.id).toBe('Y3JlZC0x');
      expect(result.response.authenticatorData).toBeDefined();
    });
  });

  // ── Web path ─────────────────────────────────────────

  describe('web (isNative = false)', () => {
    beforeEach(() => {
      mockStartAuthentication.mockResolvedValue(MOCK_AUTH_RESPONSE);
    });

    it('calls startAuthentication from @simplewebauthn/browser', async () => {
      await authenticatePasskey(MOCK_AUTH_OPTIONS, false);
      expect(mockStartAuthentication).toHaveBeenCalledTimes(1);
    });

    it('does NOT call CapacitorPasskey.getCredential', async () => {
      await authenticatePasskey(MOCK_AUTH_OPTIONS, false);
      expect(mockGetCredential).not.toHaveBeenCalled();
    });

    it('passes optionsJSON to startAuthentication', async () => {
      await authenticatePasskey(MOCK_AUTH_OPTIONS, false);
      const callArgs = mockStartAuthentication.mock.calls[0]![0];
      expect(callArgs).toHaveProperty('optionsJSON');
      expect(callArgs.optionsJSON.challenge).toBe(MOCK_AUTH_OPTIONS.challenge);
    });

    it('returns the simplewebauthn response', async () => {
      const result = await authenticatePasskey(MOCK_AUTH_OPTIONS, false);
      expect(result.id).toBe('Y3JlZC0x');
    });
  });
});

// ──────────────────────────────────────────────────────────────
// registerPasskey
// ──────────────────────────────────────────────────────────────

describe('registerPasskey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Native path ──────────────────────────────────────

  describe('native (isNative = true)', () => {
    beforeEach(() => {
      mockCreateCredential.mockResolvedValue(MOCK_REG_RESPONSE);
    });

    it('calls CapacitorPasskey.createCredential', async () => {
      await registerPasskey(MOCK_REG_OPTIONS, true);
      expect(mockCreateCredential).toHaveBeenCalledTimes(1);
    });

    it('does NOT call startRegistration', async () => {
      await registerPasskey(MOCK_REG_OPTIONS, true);
      expect(mockStartRegistration).not.toHaveBeenCalled();
    });

    it('passes rp with id and name in publicKey', async () => {
      await registerPasskey(MOCK_REG_OPTIONS, true);
      const callArgs = mockCreateCredential.mock.calls[0]![0];
      expect(callArgs.publicKey.rp).toEqual({ id: 'tribes.app', name: 'Tribes' });
    });

    it('passes user entity', async () => {
      await registerPasskey(MOCK_REG_OPTIONS, true);
      const callArgs = mockCreateCredential.mock.calls[0]![0];
      expect(callArgs.publicKey.user).toEqual(MOCK_REG_OPTIONS.user);
    });

    it('passes challenge', async () => {
      await registerPasskey(MOCK_REG_OPTIONS, true);
      const callArgs = mockCreateCredential.mock.calls[0]![0];
      expect(callArgs.publicKey.challenge).toBe(MOCK_REG_OPTIONS.challenge);
    });

    it('passes pubKeyCredParams', async () => {
      await registerPasskey(MOCK_REG_OPTIONS, true);
      const callArgs = mockCreateCredential.mock.calls[0]![0];
      expect(callArgs.publicKey.pubKeyCredParams).toEqual(MOCK_REG_OPTIONS.pubKeyCredParams);
    });

    it('returns the plugin response', async () => {
      const result = await registerPasskey(MOCK_REG_OPTIONS, true);
      expect(result.id).toBe('Y3JlZC0x');
    });
  });

  // ── Web path ─────────────────────────────────────────

  describe('web (isNative = false)', () => {
    beforeEach(() => {
      mockStartRegistration.mockResolvedValue(MOCK_REG_RESPONSE);
    });

    it('calls startRegistration from @simplewebauthn/browser', async () => {
      await registerPasskey(MOCK_REG_OPTIONS, false);
      expect(mockStartRegistration).toHaveBeenCalledTimes(1);
    });

    it('does NOT call CapacitorPasskey.createCredential', async () => {
      await registerPasskey(MOCK_REG_OPTIONS, false);
      expect(mockCreateCredential).not.toHaveBeenCalled();
    });

    it('passes optionsJSON to startRegistration', async () => {
      await registerPasskey(MOCK_REG_OPTIONS, false);
      const callArgs = mockStartRegistration.mock.calls[0]![0];
      expect(callArgs).toHaveProperty('optionsJSON');
      expect(callArgs.optionsJSON.challenge).toBe(MOCK_REG_OPTIONS.challenge);
    });

    it('returns the simplewebauthn response', async () => {
      const result = await registerPasskey(MOCK_REG_OPTIONS, false);
      expect(result.id).toBe('Y3JlZC0x');
    });
  });
});
