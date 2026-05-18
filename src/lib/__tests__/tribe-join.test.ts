/**
 * @fileoverview Unit tests for joinTribeDirectly in tribe-service.ts
 *
 * Covers:
 * - Inserts tribe_members row for new member
 * - Increments member_count on the tribe
 * - Silently no-ops if user is already a member (no duplicate, no error)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock state ─────────────────────────────────────────────────────

let mockExistingMembers: any[] = [];
let mockInsertCalls: any[] = [];
let mockUpdateCalls: any[] = [];

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => mockExistingMembers),
        })),
      })),
    })),
    insert: vi.fn((table: any) => ({
      values: vi.fn((vals: any) => {
        mockInsertCalls.push({ table: table?._name ?? 'unknown', values: vals });
        return Promise.resolve();
      }),
    })),
    update: vi.fn((table: any) => ({
      set: vi.fn((setObj: any) => ({
        where: vi.fn(() => {
          mockUpdateCalls.push({ table: table?._name ?? 'unknown', set: setObj });
          return Promise.resolve();
        }),
      })),
    })),
  },
}));

vi.mock('@/db/schema', () => ({
  tribeMembers: { id: 'id', userId: 'userId', tribeId: 'tribeId', _name: 'tribe_members' },
  tribes: { id: 'id', memberCount: 'memberCount', slug: 'slug', _name: 'tribes' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: any, val: any) => `eq(${val})`),
  and: vi.fn((...args: any[]) => `and(${args.join(',')})`),
  sql: vi.fn((strings: TemplateStringsArray, ...values: any[]) => 'sql_expression'),
}));

// ── Import under test ──────────────────────────────────────────────

import { joinTribeDirectly } from '@/lib/services/tribe-service';

// ── Tests ──────────────────────────────────────────────────────────

describe('joinTribeDirectly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistingMembers = [];
    mockInsertCalls = [];
    mockUpdateCalls = [];
  });

  it('inserts a tribe_members row for a new member', async () => {
    mockExistingMembers = []; // user is NOT already a member

    await joinTribeDirectly('user-new', 'tribe-abc');

    const memberInsert = mockInsertCalls.find(c => c.table === 'tribe_members');
    expect(memberInsert).toBeDefined();
    expect(memberInsert!.values.userId).toBe('user-new');
    expect(memberInsert!.values.tribeId).toBe('tribe-abc');
    expect(memberInsert!.values.role).toBe('member');
  });

  it('increments member_count on the tribe', async () => {
    mockExistingMembers = [];

    await joinTribeDirectly('user-new', 'tribe-abc');

    const countUpdate = mockUpdateCalls.find(c => c.table === 'tribes');
    expect(countUpdate).toBeDefined();
    // The set contains a SQL expression for COALESCE(member_count, 0) + 1
    expect(countUpdate!.set.memberCount).toBeDefined();
  });

  it('silently no-ops if user is already a member', async () => {
    mockExistingMembers = [{ id: 'tm-existing' }]; // already a member

    // Should NOT throw
    await expect(joinTribeDirectly('user-existing', 'tribe-abc')).resolves.toBeUndefined();

    // Should NOT have inserted or updated anything
    expect(mockInsertCalls).toHaveLength(0);
    expect(mockUpdateCalls).toHaveLength(0);
  });
});
