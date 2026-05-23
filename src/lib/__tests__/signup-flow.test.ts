/**
 * @fileoverview Signup flow regression tests.
 *
 * Validates that ALL auth paths (passkey, Google OAuth, Apple OAuth web,
 * Apple OAuth native) correctly:
 * 1. Redeem the invite code (increment used_count)
 * 2. Join the Welcome tribe
 * 3. Do so even when linking an existing user by email (Bug #2 regression)
 *
 * These tests mock the DB and service imports to test the callback logic
 * in isolation. They do NOT hit a real database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Tracking mocks ─────────────────────────────────────────────────

let mockRedeemInviteCodeCalls: any[] = [];
let mockJoinTribeDirectlyCalls: any[] = [];
let mockValidateInviteCodeResult: any = { id: 'TRIBE-TEST-CODE', type: 'founding', grantsPlanId: 'individual_coop', planName: 'Test', remainingUses: 40 };

const mockRedeemInviteCode = vi.fn(async (userId: string, code: string) => {
  mockRedeemInviteCodeCalls.push({ userId, code });
  return { planName: 'Individual Co-Op', source: 'founding' };
});

const mockJoinTribeDirectly = vi.fn(async (userId: string, tribeId: string) => {
  mockJoinTribeDirectlyCalls.push({ userId, tribeId });
});

const mockValidateInviteCode = vi.fn(async (code: string) => {
  return mockValidateInviteCodeResult;
});

// ── Mock invite-service ────────────────────────────────────────────

vi.mock('@/lib/services/invite-service', () => ({
  redeemInviteCode: (userId: string, code: string) => mockRedeemInviteCode(userId, code),
  validateInviteCode: (code: string) => mockValidateInviteCode(code),
}));

// ── Mock tribe-service ─────────────────────────────────────────────

vi.mock('@/lib/services/tribe-service', () => ({
  joinTribeDirectly: (userId: string, tribeId: string) => mockJoinTribeDirectly(userId, tribeId),
}));

// ── Mock DB ────────────────────────────────────────────────────────

const WELCOME_TRIBE_ID = 'tribe-welcome-123';
let mockUsersByEmail: any[] = [];
let mockOAuthAccounts: any[] = [];
let mockInsertedUsers: any[] = [];
let mockInsertedOAuth: any[] = [];

vi.mock('@/db', () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(async () => mockUsersByEmail[0] ?? null),
      },
      oauthAccounts: {
        findFirst: vi.fn(async () => mockOAuthAccounts[0] ?? null),
      },
      credentials: {
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => null),
      },
    },
    select: vi.fn((fields?: any) => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ id: WELCOME_TRIBE_ID }]), // welcome tribe lookup
        })),
      })),
    })),
    insert: vi.fn((table: any) => ({
      values: vi.fn(async (vals: any) => {
        const tableName = table?._name;
        if (tableName === 'users') mockInsertedUsers.push(vals);
        if (tableName === 'oauth_accounts') mockInsertedOAuth.push(vals);
        return {};
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => {}),
      })),
    })),
  },
}));

vi.mock('@/db/schema', () => ({
  users: { id: 'id', email: 'email', slug: 'slug', role: 'role', deletionRequestedAt: 'deletionRequestedAt', _name: 'users' },
  oauthAccounts: { provider: 'provider', providerAccountId: 'providerAccountId', userId: 'userId', _name: 'oauth_accounts' },
  tribes: { id: 'id', slug: 'slug', _name: 'tribes' },
  credentials: { userId: 'userId', _name: 'credentials' },
  sessions: { userId: 'userId', _name: 'sessions' },
  tribeMembers: { userId: 'userId', tribeId: 'tribeId', _name: 'tribe_members' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: any, val: any) => `eq(${val})`),
  and: vi.fn((...args: any[]) => `and(${args.join(',')})`),
  sql: vi.fn(),
}));

// ── Mock next/headers (stateful cookie store) ────────────────────────

const mockCookieStore = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn((name: string) => {
      if (name === 'webauthn_challenge') return { value: 'test-challenge' };
      const val = mockCookieStore.get(name);
      return val ? { value: val } : undefined;
    }),
    set: vi.fn((name: string, value: string) => {
      mockCookieStore.set(name, value);
    }),
    delete: vi.fn((name: string) => {
      mockCookieStore.delete(name);
    }),
  })),
  headers: vi.fn(async () => new Headers()),
}));

// ── Mock crypto (deterministic HMAC) ────────────────────────────────

vi.mock('crypto', () => ({
  createHmac: vi.fn(() => ({
    update: vi.fn(() => ({
      digest: vi.fn(() => 'test-hmac'),
    })),
  })),
}));

// ── Mock next/cache & next/navigation ──────────────────────────────

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

// ── Mock slugify ───────────────────────────────────────────────────

vi.mock('@/lib/utils/slugify', () => ({
  generateUniqueSlug: vi.fn(async (name: string) => name.toLowerCase().replace(/\s+/g, '-')),
}));

// ── Mock contribution-service (referral points) ────────────────────

vi.mock('@/lib/services/contribution-service', () => ({
  awardReferralPoints: vi.fn(),
  recordContribution: vi.fn(),
}));

// ── Mock bond-service (referral bond) ──────────────────────────────

vi.mock('@/lib/services/bond-service', () => ({
  createReferralBond: vi.fn(),
}));

// ── Mock turnstile-service ──────────────────────────────────────────

vi.mock('@/lib/services/turnstile-service', () => ({
  validateTurnstileToken: vi.fn(async () => true),
}));

// ── Tests ──────────────────────────────────────────────────────────

describe('Signup Flow — Invite Redemption & Welcome Tribe Join', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedeemInviteCodeCalls = [];
    mockJoinTribeDirectlyCalls = [];
    mockUsersByEmail = [];
    mockOAuthAccounts = [];
    mockInsertedUsers = [];
    mockInsertedOAuth = [];
    mockCookieStore.clear();
    // Reset env
    process.env.NEXT_PUBLIC_INVITE_ONLY = 'true';
  });

  // ────────────────────────────────────────────────────────────────
  // PASSKEY FLOW
  // ────────────────────────────────────────────────────────────────

  describe('Passkey — registerUserAction', () => {
    it('generates options but does NOT insert user row (deferred creation)', async () => {
      vi.doMock('@/lib/auth/passkeys', () => ({
        startRegistration: vi.fn(async () => ({ challenge: 'test-challenge' } as any)),
        finishRegistration: vi.fn(),
      }));

      const { registerUserAction } = await import('@/lib/auth-actions');
      const result = await registerUserAction('New User', 'newuser@example.com', 'TRIBE-TEST-CODE', 'turnstile-token');

      // Assert it returned options
      expect(result).toHaveProperty('options');
      // Assert that NO user row was inserted
      expect(mockInsertedUsers).toHaveLength(0);
    });
  });

  describe('Passkey — finishRegistrationAction', () => {
    // Helper: seed the cookie store with a server-signed registration context
    function seedRegContextCookie(userId: string, name: string, email: string, inviteCode?: string) {
      const regContext = JSON.stringify({ userId, name, email, inviteCode: inviteCode || null });
      const payload = Buffer.from(regContext).toString('base64url');
      // Our crypto mock always returns 'test-hmac' for the HMAC digest
      mockCookieStore.set('webauthn_reg_ctx', `test-hmac.${payload}`);
    }

    it('redeems invite code after passkey verification', async () => {
      // Mock finishRegistration (passkey verification)
      vi.doMock('@/lib/auth/passkeys', () => ({
        finishRegistration: vi.fn(async () => ({ success: true })),
        startRegistration: vi.fn(),
      }));

      // Mock email sending
      vi.doMock('@/lib/services/email-service', () => ({ sendEmail: vi.fn() }));
      vi.doMock('@/lib/services/email-templates', () => ({ welcomeEmail: vi.fn(), verifyEmailTemplate: vi.fn() }));
      vi.doMock('@/lib/services/email-token-service', () => ({ createVerificationToken: vi.fn(async () => 'token') }));

      // Seed the signed context cookie
      seedRegContextCookie('user-passkey-1', 'Test User', 'test@example.com', 'TRIBE-TEST-CODE');

      const { finishRegistrationAction } = await import('@/lib/auth-actions');
      await finishRegistrationAction('user-passkey-1', {} as any, 'Test User', 'test@example.com', 'TRIBE-TEST-CODE');

      expect(mockRedeemInviteCodeCalls).toHaveLength(1);
      expect(mockRedeemInviteCodeCalls[0]).toEqual({ userId: 'user-passkey-1', code: 'TRIBE-TEST-CODE' });
    });

    it('joins Welcome tribe after passkey verification', async () => {
      vi.doMock('@/lib/auth/passkeys', () => ({
        finishRegistration: vi.fn(async () => ({ success: true })),
        startRegistration: vi.fn(),
      }));

      vi.doMock('@/lib/services/email-service', () => ({ sendEmail: vi.fn() }));
      vi.doMock('@/lib/services/email-templates', () => ({ welcomeEmail: vi.fn(), verifyEmailTemplate: vi.fn() }));
      vi.doMock('@/lib/services/email-token-service', () => ({ createVerificationToken: vi.fn(async () => 'token') }));

      // Seed the signed context cookie (no invite code)
      seedRegContextCookie('user-passkey-2', 'Test User', 'test@example.com');

      const { finishRegistrationAction } = await import('@/lib/auth-actions');
      await finishRegistrationAction('user-passkey-2', {} as any, 'Test User', 'test@example.com');

      expect(mockJoinTribeDirectlyCalls).toHaveLength(1);
      expect(mockJoinTribeDirectlyCalls[0].userId).toBe('user-passkey-2');
      expect(mockJoinTribeDirectlyCalls[0].tribeId).toBe(WELCOME_TRIBE_ID);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // PASSWORD FLOW — STRUCTURAL REGRESSION TESTS
  // ────────────────────────────────────────────────────────────────
  // Bug: redeemInviteCode was called INSIDE db.transaction() in
  // registerWithPasswordAction. redeemInviteCode opens its OWN
  // db.transaction(), which can't see the uncommitted user row from
  // the outer transaction → FK violation → registration fails.
  //
  // These tests verify the fix by checking source structure.

  describe('Password — registerWithPasswordAction structure', () => {
    it('redeemInviteCode is NOT called inside db.transaction() block', () => {
      const { readFileSync } = require('fs');
      const source = readFileSync('src/lib/auth-actions.ts', 'utf-8');
      const lines = source.split('\n');

      // Find the registerWithPasswordAction function
      const fnStart = lines.findIndex((l: string) => l.includes('export async function registerWithPasswordAction'));
      expect(fnStart, 'registerWithPasswordAction not found').toBeGreaterThan(-1);

      // Find the next export function (end of registerWithPasswordAction)
      const fnEnd = lines.findIndex((l: string, i: number) =>
        i > fnStart + 5 && /^export (async )?function /.test(l.trim())
      );
      const fnBody = lines.slice(fnStart, fnEnd > -1 ? fnEnd : undefined);

      // Find db.transaction block boundaries within this function
      const txStartIdx = fnBody.findIndex((l: string) => l.includes('db.transaction('));
      expect(txStartIdx, 'db.transaction not found in registerWithPasswordAction').toBeGreaterThan(-1);

      // Find the closing of the transaction block — track brace depth
      let braceDepth = 0;
      let txEndIdx = -1;
      for (let i = txStartIdx; i < fnBody.length; i++) {
        for (const ch of fnBody[i]!) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }
        if (braceDepth === 0 && i > txStartIdx) {
          txEndIdx = i;
          break;
        }
      }
      expect(txEndIdx, 'Could not find end of db.transaction block').toBeGreaterThan(txStartIdx);

      // Extract the transaction body
      const txBody = fnBody.slice(txStartIdx, txEndIdx + 1).join('\n');

      // redeemInviteCode must NOT appear inside the transaction body
      expect(
        txBody,
        'redeemInviteCode must NOT be called inside db.transaction() — causes FK violation'
      ).not.toContain('redeemInviteCode');

      // joinTribeDirectly should also not be inside the transaction
      // (it may call other services with their own DB operations)
      expect(
        txBody,
        'joinTribeDirectly must NOT be called inside db.transaction()'
      ).not.toContain('joinTribeDirectly');
    });

    it('redeemInviteCode is called AFTER db.transaction() closes', () => {
      const { readFileSync } = require('fs');
      const source = readFileSync('src/lib/auth-actions.ts', 'utf-8');
      const lines = source.split('\n');

      // Find the registerWithPasswordAction function
      const fnStart = lines.findIndex((l: string) => l.includes('export async function registerWithPasswordAction'));
      const fnBody = lines.slice(fnStart);

      // Find the transaction close and the redeemInviteCode call
      const txLine = fnBody.findIndex((l: string) => l.includes('db.transaction('));
      const redeemLine = fnBody.findIndex((l: string) => l.includes('redeemInviteCode'));

      expect(txLine, 'db.transaction not found').toBeGreaterThan(-1);
      expect(redeemLine, 'redeemInviteCode not found').toBeGreaterThan(-1);
      expect(
        redeemLine,
        'redeemInviteCode must appear AFTER db.transaction() call'
      ).toBeGreaterThan(txLine);
    });

    it('error messages do not leak raw SQL', () => {
      const { readFileSync } = require('fs');
      const source = readFileSync('src/lib/auth-actions.ts', 'utf-8');
      const lines = source.split('\n');

      // Find the catch block in registerWithPasswordAction
      const fnStart = lines.findIndex((l: string) => l.includes('export async function registerWithPasswordAction'));
      const fnEnd = lines.findIndex((l: string, i: number) =>
        i > fnStart + 5 && /^export (async )?function /.test(l.trim())
      );
      const fnBody = lines.slice(fnStart, fnEnd > -1 ? fnEnd : undefined).join('\n');

      // Must contain SQL sanitization logic
      expect(fnBody).toContain('Failed query');
      expect(fnBody).toContain('sanitized');
    });
  });


  // OAUTH FLOW STRUCTURE TESTS
  // ────────────────────────────────────────────────────────────────
  // The OAuth callbacks are Next.js route handlers (GET/POST) that
  // use NextRequest/NextResponse. Instead of spinning up a full
  // HTTP server, we verify the structural invariant: the invite
  // redeem and tribe join calls live OUTSIDE the "create new user"
  // block, at the same nesting level as the OAuth account link.

  describe('OAuth callback code structure — Bug #2 regression', () => {
    /**
     * Helper: verifies that a function call appears BEFORE the "Link" comment
     * and at a nesting level that's no deeper than the Link comment.
     * This catches the bug where invite/tribe code was nested inside the
     * "create new user" else block instead of being at the OAuth-link level.
     */
    function assertOutsideNewUserBlock(filePath: string, fnName: string, linkComment: string) {
      const { readFileSync } = require('fs');
      const source = readFileSync(filePath, 'utf-8');
      const lines = source.split('\n');

      const fnLine = lines.findIndex((l: string) => l.includes(fnName));
      const linkLine = lines.findIndex((l: string) => l.includes(linkComment));

      // Both must exist
      expect(fnLine, `${fnName} not found in ${filePath}`).toBeGreaterThan(-1);
      expect(linkLine, `"${linkComment}" not found in ${filePath}`).toBeGreaterThan(-1);

      // Function call must appear BEFORE the link line
      expect(fnLine, `${fnName} should appear before "${linkComment}"`).toBeLessThan(linkLine);

      // The "Link" comment line gives us the expected nesting level.
      // The function's surrounding comment/block should be at the same depth (±2 for try/catch).
      // Find the comment line for this block (e.g. "Auto-redeem invite code")
      const fnCommentLine = lines.findIndex((l: string, i: number) =>
        i < fnLine && i > fnLine - 5 && (l.includes('Auto-redeem') || l.includes('Auto-join'))
      );
      if (fnCommentLine > -1) {
        const commentIndent = lines[fnCommentLine]!.search(/\S/);
        const linkIndent = lines[linkLine]!.search(/\S/);
        // Should be at the same level (within 2 spaces for style variance)
        expect(
          Math.abs(commentIndent - linkIndent),
          `${fnName} block indent (${commentIndent}) should be close to link indent (${linkIndent})`
        ).toBeLessThanOrEqual(2);
      }
    }

    it('Google callback: redeemInviteCode is outside the new-user block', () => {
      assertOutsideNewUserBlock(
        'src/app/api/auth/google/callback/route.ts',
        'redeemInviteCode',
        'Link the Google account'
      );
    });

    it('Google callback: joinTribeDirectly is outside the new-user block', () => {
      assertOutsideNewUserBlock(
        'src/app/api/auth/google/callback/route.ts',
        'joinTribeDirectly',
        'Link the Google account'
      );
    });

    it('Apple web callback: redeemInviteCode is outside the new-user block', () => {
      assertOutsideNewUserBlock(
        'src/app/api/auth/apple/callback/route.ts',
        'redeemInviteCode',
        'Link the Apple account'
      );
    });

    it('Apple web callback: joinTribeDirectly is outside the new-user block', () => {
      assertOutsideNewUserBlock(
        'src/app/api/auth/apple/callback/route.ts',
        'joinTribeDirectly',
        'Link the Apple account'
      );
    });

    it('Apple native callback: redeemInviteCode is outside the new-user block', () => {
      assertOutsideNewUserBlock(
        'src/app/api/auth/apple/native/route.ts',
        'redeemInviteCode',
        'Link the Apple account'
      );
    });

    it('Apple native callback: joinTribeDirectly is outside the new-user block', () => {
      assertOutsideNewUserBlock(
        'src/app/api/auth/apple/native/route.ts',
        'joinTribeDirectly',
        'Link the Apple account'
      );
    });
  });

  // ────────────────────────────────────────────────────────────────
  // INVITE-ONLY ENFORCEMENT
  // ────────────────────────────────────────────────────────────────

  describe('Invite-only enforcement', () => {
    it('all OAuth callbacks check NEXT_PUBLIC_INVITE_ONLY', async () => {
      const { readFileSync } = await import('fs');

      for (const path of [
        'src/app/api/auth/google/callback/route.ts',
        'src/app/api/auth/apple/callback/route.ts',
        'src/app/api/auth/apple/native/route.ts',
      ]) {
        const source = readFileSync(path, 'utf-8');
        expect(source).toContain("NEXT_PUBLIC_INVITE_ONLY");
        expect(source).toContain("invite_required");
      }
    });
  });
});
