/**
 * @fileoverview Unit tests for auth guard patterns and membership queries.
 * Validates that requireAuth() properly rejects unauthenticated requests
 * and that getMyTribeIds() returns empty array when no session exists.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all external dependencies before importing actions
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}));

// Mock the DB module
vi.mock('@/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => [{ role: 'Admin', emailVerified: true }])
        })),
      })),
    })),
  },
}));

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

// Mock the schema — must include every table referenced transitively by tested code paths.
// requireAuth → isUserBanned → userBans, so userBans must be present.
vi.mock('@/db/schema', () => ({
  tribeMembers: {
    tribeId: 'tribeId',
    userId: 'userId',
  },
  subscriptions: {
    userId: 'userId',
    status: 'status',
    planId: 'planId',
  },
  plans: {
    id: 'id',
  },
  tribes: {
    id: 'id',
    createdBy: 'createdBy',
  },
  users: {
    id: 'id',
    role: 'role',
  },
  bonds: {
    userId: 'userId',
  },
  userBans: {
    userId: 'userId',
    isActive: 'isActive',
    expiresAt: 'expiresAt',
  },
  sessions: {
    userId: 'userId',
  },
}));

// Mock subscription guard
vi.mock('@/lib/services/subscription-guard', () => ({
  canCreateTribe: vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: 5, planName: 'Test' }),
  getUserPlan: vi.fn().mockResolvedValue({ id: 'free', name: 'Free', maxTribesOwned: 5 }),
}));

// Mock tribe auth
vi.mock('@/lib/services/tribe-auth', () => ({
  getTribeAccessLevel: vi.fn().mockResolvedValue('founder'),
  isTribeSpeakerOrAbove: vi.fn().mockResolvedValue(true),
  isTribeFounderOrAbove: vi.fn().mockResolvedValue(true),
  requireTribeSpeaker: vi.fn().mockResolvedValue(undefined),
  requireTribeFounder: vi.fn().mockResolvedValue(undefined),
  isTribeMember: vi.fn().mockResolvedValue(true),
}));

// Mock the session module
const mockGetCurrentUserId = vi.fn();
const mockGetCurrentSessionId = vi.fn();
vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: () => mockGetCurrentUserId(),
  getCurrentSessionId: () => mockGetCurrentSessionId(),
  SESSION_COOKIE_NAME: 'tribes-session',
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));

// Mock the CSRF module
const mockValidateCsrfToken = vi.fn();
vi.mock('@/lib/auth/csrf', () => ({
  validateCsrfToken: () => mockValidateCsrfToken(),
  CSRF_COOKIE_NAME: 'csrf-token',
  generateCsrfToken: vi.fn(),
}));

// Mock rate limiters
vi.mock('@/lib/auth/rate-limit', () => ({
  postLimiter: { check: vi.fn() },
  commentLimiter: { check: vi.fn() },
  rsvpLimiter: { check: vi.fn() },
  contributionLimiter: { check: vi.fn() },
  bondLimiter: { check: vi.fn() },
  uploadLimiter: { check: vi.fn() },
}));

// Mock moderation service — requireAuth calls isUserBanned.
// Controllable per-test so we can verify both the 'not banned' and 'banned' paths.
const mockIsUserBanned = vi.fn().mockResolvedValue(null);
vi.mock('@/lib/services/moderation-service', () => ({
  isUserBanned: (...args: unknown[]) => mockIsUserBanned(...args),
}));

describe('Auth Guard Patterns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateCsrfToken.mockResolvedValue(undefined); // CSRF passes by default
  });

  describe('requireAuth() — used by write actions', () => {
    it('returns serverError when no session exists', async () => {
      mockGetCurrentUserId.mockResolvedValue(null);

      // Import a write action that uses requireAuth
      const { createTribe } = await import('@/lib/actions/tribe-actions');

      const result = await createTribe({ name: 'Test', description: 'test', moods: ['tech'], isPublic: true });
      expect(result).toHaveProperty('serverError');
      expect((result as any).serverError).toContain('Unauthorized');
    });

    it('returns serverError when user is banned', async () => {
      mockGetCurrentUserId.mockResolvedValue('banned-user-456');
      mockIsUserBanned.mockResolvedValueOnce({
        reason: 'Repeated policy violations',
        expiresAt: new Date('2026-05-01'),
      });

      const { createTribe } = await import('@/lib/actions/tribe-actions');

      const result = await createTribe({ name: 'Test', description: 'test', moods: ['tech'], isPublic: true });
      expect(result).toHaveProperty('serverError');
      expect((result as any).serverError).toContain('Your account has been suspended');

      // Verify isUserBanned was actually called with the right userId
      expect(mockIsUserBanned).toHaveBeenCalledWith('banned-user-456');
    });

    it('returns userId when session is valid', async () => {
      mockGetCurrentUserId.mockResolvedValue('test-user-123');

      // Mock the tribe-service createTribe to verify it receives the userId
      const mockCreateTribe = vi.fn().mockResolvedValue({
        id: '99',
        name: 'Test Tribe',
        description: 'A test tribe',
        isPublic: true,
        members: 1,
      });

      vi.doMock('@/lib/services/tribe-service', () => ({
        createTribe: mockCreateTribe,
      }));

      vi.doMock('@/lib/services/contribution-service', () => ({
        recordContribution: vi.fn(),
      }));

      // Re-import to pick up mocks
      const mod = await import('@/lib/actions/tribe-actions');
      const result = await mod.createTribe({
        name: 'Test Tribe',
        description: 'A test tribe',
        moods: ['tech'],
        isPublic: true,
      });

      expect(mockCreateTribe).toHaveBeenCalledWith(
        expect.objectContaining({ createdBy: 'test-user-123' })
      );
    });
  });

  describe('getCurrentUserId() — used by read actions', () => {
    it('getMyTribeIds returns empty array when unauthenticated', async () => {
      mockGetCurrentUserId.mockResolvedValue(null);

      const { getMyTribeIds } = await import('@/lib/actions/tribe-actions');
      const result = await getMyTribeIds();

      expect(result).toEqual([]);
    });
  });
});

describe('Hardcoded Values Regression', () => {
  it('no baseTribeMemberships hardcoded arrays exist in source', async () => {
    const { execSync } = await import('child_process');
    const result = execSync(
      'grep -r "baseTribeMemberships" src/ --include="*.tsx" --include="*.ts" --exclude-dir="__tests__" || echo "CLEAN"',
      { cwd: process.cwd(), encoding: 'utf-8' }
    );
    expect(result.trim()).toBe('CLEAN');
  });

  it('no myCreatedTribeIds localStorage references exist in source', async () => {
    const { execSync } = await import('child_process');
    const result = execSync(
      'grep -r "myCreatedTribeIds" src/ --include="*.tsx" --include="*.ts" --exclude-dir="__tests__" || echo "CLEAN"',
      { cwd: process.cwd(), encoding: 'utf-8' }
    );
    expect(result.trim()).toBe('CLEAN');
  });

  it('no MOCK_CURRENT_DATE references exist in source', async () => {
    const { execSync } = await import('child_process');
    const result = execSync(
      'grep -r "MOCK_CURRENT_DATE" src/ --include="*.tsx" --include="*.ts" --exclude-dir="__tests__" || echo "CLEAN"',
      { cwd: process.cwd(), encoding: 'utf-8' }
    );
    expect(result.trim()).toBe('CLEAN');
  });
});

describe('DRY Regression Guards', () => {
  it('timeSince is only defined in utils.ts', async () => {
    const { execSync } = await import('child_process');
    const result = execSync(
      'grep -rl "function timeSince\\|const timeSince" src/ --include="*.tsx" --include="*.ts" --exclude-dir="__tests__" || echo "NONE"',
      { cwd: process.cwd(), encoding: 'utf-8' }
    );
    const files = result.trim().split('\n').filter(f => f !== 'NONE');
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('utils.ts');
  });

  it('no placehold.co URLs in service files', async () => {
    const { execSync } = await import('child_process');
    const result = execSync(
      'grep -r "placehold.co" src/lib/services/ --include="*.ts" || echo "CLEAN"',
      { cwd: process.cwd(), encoding: 'utf-8' }
    );
    expect(result.trim()).toBe('CLEAN');
  });

  it('no (Simulated) toast messages in source', async () => {
    const { execSync } = await import('child_process');
    const result = execSync(
      'grep -r "(Simulated)" src/ --include="*.tsx" --include="*.ts" --exclude-dir="__tests__" || echo "CLEAN"',
      { cwd: process.cwd(), encoding: 'utf-8' }
    );
    expect(result.trim()).toBe('CLEAN');
  });

  it('VIBE_EMOTICONS is only defined in constants.ts', async () => {
    const { execSync } = await import('child_process');
    const result = execSync(
      'grep -rl "VIBE_EMOTICONS" src/ --include="*.tsx" --include="*.ts" --exclude-dir="__tests__" || echo "NONE"',
      { cwd: process.cwd(), encoding: 'utf-8' }
    );
    const files = result.trim().split('\n').filter(f => f !== 'NONE');
    // Should only appear in constants.ts (definition) and consumers (imports)
    const definitionFiles = [];
    for (const file of files) {
      const { execSync: exec } = await import('child_process');
      const content = exec(`grep "VIBE_EMOTICONS" "${file}"`, { cwd: process.cwd(), encoding: 'utf-8' });
      // Check if file defines (not just imports) the constant
      if (content.includes('= {') || content.includes('= [') || content.includes(': Record')) {
        definitionFiles.push(file);
      }
    }
    expect(definitionFiles).toHaveLength(1);
    expect(definitionFiles[0]).toContain('constants.ts');
  });
});

describe('Decomposition Regression Guards', () => {
  it('TribePostCard is defined in exactly one file', async () => {
    const { execSync } = await import('child_process');
    const result = execSync(
      'grep -rl "export const TribePostCard\\|export function TribePostCard" src/ --include="*.tsx" --include="*.ts" --exclude-dir="__tests__" || echo "NONE"',
      { cwd: process.cwd(), encoding: 'utf-8' }
    );
    const files = result.trim().split('\n').filter(f => f !== 'NONE');
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('tribe-post-card.tsx');
  });

  it('ConnectVibeIcon is defined in exactly one file', async () => {
    const { execSync } = await import('child_process');
    const result = execSync(
      'grep -rl "export const ConnectVibeIcon\\|const ConnectVibeIcon" src/ --include="*.tsx" --include="*.ts" --exclude-dir="__tests__" || echo "NONE"',
      { cwd: process.cwd(), encoding: 'utf-8' }
    );
    const files = result.trim().split('\n').filter(f => f !== 'NONE');
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('bond-utils.tsx');
  });
});
