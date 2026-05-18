/**
 * @fileoverview Unit tests for invite-service.ts
 *
 * Covers:
 * - validateInviteCode: unknown, expired, exhausted, and valid codes
 * - redeemInviteCode: duplicate guard, subscription creation, counter increment,
 *   referral vs founding paths
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared mock state ──────────────────────────────────────────────
// We control what the DB "returns" per test via these arrays/fns.

let mockInviteCodeRows: any[] = [];
let mockPlanRows: any[] = [];
let mockRedemptionRows: any[] = [];
let mockSubscriptionRows: any[] = [];
let mockInsertedValues: { table: string; values: any }[] = [];
let mockUpdatedValues: { table: string; set: any; where: string }[] = [];

// Transaction helper — runs callback with the same mock tx
const mockTx = {
  insert: vi.fn((table: any) => ({
    values: vi.fn((vals: any) => {
      mockInsertedValues.push({ table: table?._name ?? 'unknown', values: vals });
      return Promise.resolve();
    }),
  })),
  select: vi.fn((fields?: any) => ({
    from: vi.fn((table: any) => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => {
          const tableName = table?._name;
          if (tableName === 'subscriptions') return Promise.resolve(mockSubscriptionRows);
          if (tableName === 'invite_codes') {
            // For the used_count read inside the transaction
            return Promise.resolve(mockInviteCodeRows.map(r => ({ usedCount: r.usedCount ?? r.used_count ?? 0 })));
          }
          return Promise.resolve([]);
        }),
      })),
    })),
  })),
  update: vi.fn((table: any) => ({
    set: vi.fn((setObj: any) => ({
      where: vi.fn(() => {
        mockUpdatedValues.push({ table: table?._name ?? 'unknown', set: setObj, where: 'called' });
        return Promise.resolve();
      }),
    })),
  })),
};

// ── Mock DB ────────────────────────────────────────────────────────

vi.mock('@/db', () => ({
  db: {
    select: vi.fn((fields?: any) => ({
      from: vi.fn((table: any) => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => {
            const tableName = table?._name;
            if (tableName === 'invite_codes') return mockInviteCodeRows;
            if (tableName === 'plans') return mockPlanRows;
            if (tableName === 'invite_redemptions') return mockRedemptionRows;
            if (tableName === 'subscriptions') return mockSubscriptionRows;
            return [];
          }),
        })),
      })),
    })),
    transaction: vi.fn(async (cb: (tx: any) => Promise<void>) => {
      await cb(mockTx);
    }),
  },
}));

// ── Mock schema ────────────────────────────────────────────────────

vi.mock('@/db/schema', () => ({
  inviteCodes: { id: 'id', usedCount: 'usedCount', createdBy: 'createdBy', _name: 'invite_codes' },
  inviteRedemptions: { inviteCodeId: 'inviteCodeId', userId: 'userId', _name: 'invite_redemptions' },
  subscriptions: { userId: 'userId', status: 'status', _name: 'subscriptions' },
  plans: { id: 'id', _name: 'plans' },
  users: { id: 'id', role: 'role', _name: 'users' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: any, val: any) => `eq(${val})`),
  and: vi.fn((...args: any[]) => `and(${args.join(',')})`),
  sql: vi.fn(),
}));

// ── Import under test ──────────────────────────────────────────────

import { validateInviteCode, redeemInviteCode } from '@/lib/services/invite-service';

// ── Tests ──────────────────────────────────────────────────────────

describe('invite-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInviteCodeRows = [];
    mockPlanRows = [];
    mockRedemptionRows = [];
    mockSubscriptionRows = [];
    mockInsertedValues = [];
    mockUpdatedValues = [];
  });

  // ── validateInviteCode ──

  describe('validateInviteCode', () => {
    it('rejects an unknown code', async () => {
      mockInviteCodeRows = []; // no match
      await expect(validateInviteCode('TRIBE-FAKE-CODE')).rejects.toThrow('Invalid invite code');
    });

    it('rejects an expired code', async () => {
      mockInviteCodeRows = [{
        id: 'TRIBE-EXPR-CODE',
        type: 'founding',
        grantsPlanId: 'individual_coop',
        maxUses: 50,
        usedCount: 5,
        expiresAt: new Date('2020-01-01'), // in the past
      }];
      await expect(validateInviteCode('TRIBE-EXPR-CODE')).rejects.toThrow('expired');
    });

    it('rejects an exhausted code (used_count >= max_uses)', async () => {
      mockInviteCodeRows = [{
        id: 'TRIBE-FULL-CODE',
        type: 'founding',
        grantsPlanId: 'individual_coop',
        maxUses: 10,
        usedCount: 10, // fully used
        expiresAt: null,
      }];
      await expect(validateInviteCode('TRIBE-FULL-CODE')).rejects.toThrow('fully redeemed');
    });

    it('returns details for a valid code', async () => {
      mockInviteCodeRows = [{
        id: 'TRIBE-GOOD-CODE',
        type: 'founding',
        grantsPlanId: 'individual_coop',
        maxUses: 50,
        usedCount: 10,
        expiresAt: null,
      }];
      mockPlanRows = [{ id: 'individual_coop', name: 'Individual Co-Op' }];

      const result = await validateInviteCode('TRIBE-GOOD-CODE');
      expect(result).toEqual({
        id: 'TRIBE-GOOD-CODE',
        type: 'founding',
        grantsPlanId: 'individual_coop',
        planName: 'Individual Co-Op',
        remainingUses: 40,
      });
    });
  });

  // ── redeemInviteCode ──

  describe('redeemInviteCode', () => {
    const validCode = {
      id: 'TRIBE-TEST-CODE',
      type: 'founding',
      grantsPlanId: 'individual_coop',
      maxUses: 50,
      usedCount: 5,
      expiresAt: null,
      createdBy: 'creator-user-id',
    };

    const validPlan = {
      id: 'individual_coop',
      name: 'Individual Co-Op',
      targetRole: 'Human_Member',
    };

    it('rejects duplicate redemption by the same user', async () => {
      mockInviteCodeRows = [validCode];
      mockPlanRows = [validPlan];
      mockRedemptionRows = [{ id: 'existing-redemption' }]; // already redeemed

      await expect(redeemInviteCode('user-123', 'TRIBE-TEST-CODE'))
        .rejects.toThrow('already redeemed');
    });

    it('creates subscription for founding code', async () => {
      mockInviteCodeRows = [validCode];
      mockPlanRows = [validPlan];
      mockRedemptionRows = []; // no prior redemption
      mockSubscriptionRows = []; // no existing subscription

      await redeemInviteCode('user-123', 'TRIBE-TEST-CODE');

      // Should have inserted a subscription
      const subInsert = mockInsertedValues.find(i => i.table === 'subscriptions');
      expect(subInsert).toBeDefined();
      expect(subInsert!.values.userId).toBe('user-123');
      expect(subInsert!.values.planId).toBe('individual_coop');
      expect(subInsert!.values.source).toBe('founding');
    });

    it('skips subscription for free/referral code', async () => {
      const freeCode = { ...validCode, type: 'referral', grantsPlanId: 'free' };
      const freePlan = { id: 'free', name: 'Always Free', targetRole: 'Human_Free' };
      mockInviteCodeRows = [freeCode];
      mockPlanRows = [freePlan];
      mockRedemptionRows = [];
      mockSubscriptionRows = [];

      await redeemInviteCode('user-456', 'TRIBE-TEST-CODE');

      // Should NOT have inserted a subscription (plan is 'free')
      const subInsert = mockInsertedValues.find(i => i.table === 'subscriptions');
      expect(subInsert).toBeUndefined();
    });

    it('records a redemption row', async () => {
      mockInviteCodeRows = [validCode];
      mockPlanRows = [validPlan];
      mockRedemptionRows = [];
      mockSubscriptionRows = [];

      await redeemInviteCode('user-789', 'TRIBE-TEST-CODE');

      const redemptionInsert = mockInsertedValues.find(i => i.table === 'invite_redemptions');
      expect(redemptionInsert).toBeDefined();
      expect(redemptionInsert!.values.userId).toBe('user-789');
      expect(redemptionInsert!.values.inviteCodeId).toBe('TRIBE-TEST-CODE');
    });

    it('increments used_count', async () => {
      mockInviteCodeRows = [validCode];
      mockPlanRows = [validPlan];
      mockRedemptionRows = [];
      mockSubscriptionRows = [];

      await redeemInviteCode('user-abc', 'TRIBE-TEST-CODE');

      const countUpdate = mockUpdatedValues.find(u => u.table === 'invite_codes');
      expect(countUpdate).toBeDefined();
      // The set should contain usedCount = previous + 1
      expect(countUpdate!.set.usedCount).toBe(6); // was 5
    });
  });
});
