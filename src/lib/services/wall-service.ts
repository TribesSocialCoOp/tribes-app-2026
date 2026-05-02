/**
 * @fileoverview Service layer for wall blocks and styles.
 * Persists user-customizable profile wall content to SQLite.
 */
import { db } from '@/db';
import { wallBlocks, wallStyles } from '@/db/schema';
import { eq } from 'drizzle-orm';

export interface WallBlockData {
  id: string;
  type: string;
  content: string; // JSON string
  sortOrder: number;
}

export interface WallStyleData {
  backgroundColor: string;
  layout: string;
  nowPlayingUrl?: string;
}

/**
 * Get all wall blocks for a user, ordered by sortOrder.
 */
export async function getWallBlocks(userId: string): Promise<WallBlockData[]> {
  const rows = await db.select().from(wallBlocks).where(eq(wallBlocks.userId, userId));
  return rows
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(r => ({
      id: r.id,
      type: r.type,
      content: r.content,
      sortOrder: r.sortOrder ?? 0,
    }));
}

/**
 * Upsert a single wall block.
 */
export async function saveWallBlock(userId: string, block: WallBlockData): Promise<void> {
  const existing = await db.select().from(wallBlocks)
    .where(eq(wallBlocks.id, block.id))
    .limit(1);

  if (existing.length > 0) {
    await db.update(wallBlocks)
      .set({ type: block.type, content: block.content, sortOrder: block.sortOrder })
      .where(eq(wallBlocks.id, block.id));
  } else {
    await db.insert(wallBlocks).values({
      id: block.id,
      userId,
      type: block.type,
      content: block.content,
      sortOrder: block.sortOrder,
    });
  }
}

/**
 * Delete a wall block.
 */
export async function deleteWallBlock(userId: string, blockId: string): Promise<void> {
  // Ensure the block belongs to the user
  const rows = await db.select().from(wallBlocks)
    .where(eq(wallBlocks.id, blockId))
    .limit(1);
  if (rows[0]?.userId !== userId) throw new Error('Not authorized to delete this block');
  await db.delete(wallBlocks).where(eq(wallBlocks.id, blockId));
}

/**
 * Reorder wall blocks by updating sortOrder.
 */
export async function reorderWallBlocks(userId: string, blockIds: string[]): Promise<void> {
  for (let i = 0; i < blockIds.length; i++) {
    await db.update(wallBlocks)
      .set({ sortOrder: i })
      .where(eq(wallBlocks.id, blockIds[i]!));
  }
}

/**
 * Get wall style preferences for a user.
 */
export async function getWallStyle(userId: string): Promise<WallStyleData> {
  const rows = await db.select().from(wallStyles).where(eq(wallStyles.userId, userId)).limit(1);
  if (rows[0]) {
    return {
      backgroundColor: rows[0].backgroundColor ?? 'bg-background',
      layout: rows[0].layout ?? 'single-column',
      nowPlayingUrl: rows[0].nowPlayingUrl ?? undefined,
    };
  }
  return { backgroundColor: 'bg-background', layout: 'single-column' };
}

/**
 * Save wall style preferences. Upserts.
 */
export async function saveWallStyle(userId: string, style: WallStyleData): Promise<void> {
  const existing = await db.select().from(wallStyles).where(eq(wallStyles.userId, userId)).limit(1);
  if (existing.length > 0) {
    await db.update(wallStyles)
      .set({ 
        backgroundColor: style.backgroundColor, 
        layout: style.layout,
        nowPlayingUrl: style.nowPlayingUrl,
      })
      .where(eq(wallStyles.userId, userId));
  } else {
    await db.insert(wallStyles).values({
      userId,
      backgroundColor: style.backgroundColor,
      layout: style.layout,
      nowPlayingUrl: style.nowPlayingUrl,
    });
  }
}
