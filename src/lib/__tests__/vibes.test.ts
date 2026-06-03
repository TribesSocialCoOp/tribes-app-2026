import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock session and moderation service to bypass real session secret loading
vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn().mockResolvedValue('user-admin'),
  getCurrentSessionId: vi.fn().mockResolvedValue('session-123'),
  SESSION_COOKIE_NAME: 'tribes-session',
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));

vi.mock('@/lib/services/moderation-service', () => ({
  isUserBanned: vi.fn().mockResolvedValue(null),
}));

// ── Shared mock state ──────────────────────────────────────────────
let mockVibeRows: any[] = [];
let mockPostRows: any[] = [];
let mockCommentRows: any[] = [];
let mockInsertedValues: { table: string; values: any }[] = [];
let mockDeletedValues: { table: string; where: any }[] = [];
let mockUpdatedValues: { table: string; set: any; where: any }[] = [];
let mockExecuteCalls: any[] = [];

// Helper to create a chainable, thenable query mock
function createQueryMock(defaultRows: any[]) {
  const queryPromise = Promise.resolve(defaultRows);
  const builder: any = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    for: vi.fn(() => builder),
  };
  
  // Make the builder thenable so "await query" works directly
  builder.then = (onfulfilled: any, onrejected: any) => {
    return queryPromise.then(onfulfilled, onrejected);
  };
  builder.catch = (onrejected: any) => {
    return queryPromise.catch(onrejected);
  };
  
  return builder;
}

const mockTx = {
  select: vi.fn(() => createQueryMock(mockVibeRows)),
  insert: vi.fn((table: any) => ({
    values: vi.fn((vals: any) => {
      mockInsertedValues.push({ table: table?._name ?? 'unknown', values: vals });
      return Promise.resolve();
    }),
  })),
  delete: vi.fn((table: any) => ({
    where: vi.fn((whereClause: any) => {
      mockDeletedValues.push({ table: table?._name ?? 'unknown', where: whereClause });
      return Promise.resolve();
    }),
  })),
  update: vi.fn((table: any) => ({
    set: vi.fn((setObj: any) => ({
      where: vi.fn((whereClause: any) => {
        mockUpdatedValues.push({ table: table?._name ?? 'unknown', set: setObj, where: whereClause });
        return Promise.resolve();
      }),
    })),
  })),
};

// ── Mock DB ────────────────────────────────────────────────────────
vi.mock('@/db', () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      return await cb(mockTx);
    }),
    select: vi.fn((fields?: any) => {
      // Return post rows or comment rows depending on fields if needed, 
      // but let's default to creating a chainable query mock
      return {
        from: vi.fn((table: any) => {
          const tableName = table?._name;
          const rows = tableName === 'posts' ? mockPostRows
                     : tableName === 'comments' ? mockCommentRows
                     : mockVibeRows;
          return createQueryMock(rows);
        })
      };
    }),
    execute: vi.fn((query: any) => {
      mockExecuteCalls.push(query);
      return Promise.resolve({ rowCount: 1 });
    }),
  },
}));

// ── Mock schema ────────────────────────────────────────────────────
vi.mock('@/db/schema', () => ({
  posts: { id: 'id', vibeCount: 'vibeCount', _name: 'posts' },
  comments: { id: 'id', vibeCount: 'vibeCount', _name: 'comments' },
  vibes: { id: 'id', userId: 'userId', targetId: 'targetId', targetType: 'targetType', emoji: 'emoji', _name: 'vibes' },
  users: { id: 'id', name: 'name', _name: 'users' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: any, val: any) => `eq(${val})`),
  and: vi.fn((...args: any[]) => `and(${args.join(',')})`),
  sql: vi.fn((strings: TemplateStringsArray, ...values: any[]) => 'sql_expression'),
}));

// ── Import under test ──────────────────────────────────────────────
import { toggleVibe } from '@/lib/services/post-service';
import { reconcileVibeCounts } from '@/lib/actions/content-actions';

describe('vibes logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVibeRows = [];
    mockPostRows = [];
    mockCommentRows = [];
    mockInsertedValues = [];
    mockDeletedValues = [];
    mockUpdatedValues = [];
    mockExecuteCalls = [];
  });

  describe('toggleVibe', () => {
    it('creates new vibe and increments post vibe count if none exists', async () => {
      mockVibeRows = []; // no existing vibe
      mockPostRows = [{ vibeCount: 0 }];

      const result = await toggleVibe('user-1', 'post-1', 'post', '🔥');

      expect(result.vibed).toBe(true);
      expect(mockInsertedValues).toHaveLength(1);
      expect(mockInsertedValues[0]!.table).toBe('vibes');
      expect(mockInsertedValues[0]!.values.emoji).toBe('🔥');

      const countUpdate = mockUpdatedValues.find(u => u.table === 'posts');
      expect(countUpdate).toBeDefined();
    });

    it('removes vibe and decrements count when same emoji toggled', async () => {
      mockVibeRows = [{ id: 'vibe-1', emoji: '🔥', userId: 'user-1', targetId: 'post-1', targetType: 'post' }];
      mockPostRows = [{ vibeCount: 1 }];

      const result = await toggleVibe('user-1', 'post-1', 'post', '🔥');

      expect(result.vibed).toBe(false);
      expect(mockDeletedValues).toHaveLength(1);
      expect(mockDeletedValues[0]!.table).toBe('vibes');

      const countUpdate = mockUpdatedValues.find(u => u.table === 'posts');
      expect(countUpdate).toBeDefined();
    });

    it('updates vibe emoji when different emoji toggled (count remains same)', async () => {
      mockVibeRows = [{ id: 'vibe-1', emoji: '🔥', userId: 'user-1', targetId: 'post-1', targetType: 'post' }];
      mockPostRows = [{ vibeCount: 1 }];

      const result = await toggleVibe('user-1', 'post-1', 'post', '❤️');

      expect(result.vibed).toBe(true);
      expect(mockUpdatedValues.some(u => u.table === 'vibes')).toBe(true);
      expect(mockUpdatedValues.some(u => u.table === 'posts')).toBe(false); // Count does not change
    });
  });

  describe('reconcileVibeCounts', () => {
    it('executes CTE queries for posts and comments reconciliation', async () => {
      // Mock requireAdmin to bypass admin check (reconcileVibeCounts now uses requireAdmin)
      vi.spyOn(await import('../actions/shared'), 'requireAdmin').mockResolvedValue('user-admin');

      const result = await reconcileVibeCounts();

      expect(result.postsReconciled).toBe(1);
      expect(result.commentsReconciled).toBe(1);
      expect(mockExecuteCalls).toHaveLength(2);
    });
  });
});
