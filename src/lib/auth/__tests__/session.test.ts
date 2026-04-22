/**
 * @fileoverview Unit tests for JWT session management.
 * Tests encrypt/decrypt roundtrip and session payload structure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock next/headers since it requires a request context
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}));

// We test the pure crypto functions directly
describe('Session Crypto', () => {
  let encrypt: typeof import('@/lib/auth/session').encrypt;
  let decrypt: typeof import('@/lib/auth/session').decrypt;

  beforeEach(async () => {
    // Dynamic import to get fresh module with mocks applied
    const mod = await import('@/lib/auth/session');
    encrypt = mod.encrypt;
    decrypt = mod.decrypt;
  });

  it('encrypt → decrypt roundtrip preserves payload', async () => {
    const payload = { userId: 'test-user-123', sessionId: 'sess-1', expires: new Date() };
    const token = await encrypt(payload);

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(50); // JWTs are long

    const decoded = await decrypt(token);
    expect(decoded.userId).toBe('test-user-123');
  });

  it('decrypt rejects tampered token', async () => {
    const payload = { userId: 'test-user-456', sessionId: 'sess-2', expires: new Date() };
    const token = await encrypt(payload);

    // Tamper with the token
    const tampered = token.slice(0, -5) + 'XXXXX';

    await expect(decrypt(tampered)).rejects.toThrow();
  });

  it('encrypt sets expiration to 7 days', async () => {
    const payload = { userId: 'test-user-789', sessionId: 'sess-3', expires: new Date() };
    const token = await encrypt(payload);
    const decoded = await decrypt(token) as ReturnType<typeof decrypt> extends Promise<infer R> ? R & { exp: number } : never;

    // JWT exp is in seconds since epoch
    const expDate = new Date((decoded as unknown as { exp: number }).exp * 1000);
    const now = new Date();
    const diffDays = (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    // Should be approximately 7 days (allow some tolerance)
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThan(7.1);
  });

  it('encrypt sets HS256 algorithm', async () => {
    const payload = { userId: 'test-user-alg', sessionId: 'sess-4', expires: new Date() };
    const token = await encrypt(payload);

    // Decode the header (first part of JWT, base64url encoded)
    const headerB64 = token.split('.')[0];
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());

    expect(header.alg).toBe('HS256');
  });
});
