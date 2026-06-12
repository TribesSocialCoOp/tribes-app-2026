'use server';

import { requireAuth } from './shared';

export async function getFavorites(): Promise<Array<{
  id: string;
  targetType: 'bond' | 'tribe';
  targetId: string;
  targetName: string;
  targetAvatar: string | null;
  sortOrder: number;
}>> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { userFavorites, bonds, tribes } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const rows = await db.select({
    id: userFavorites.id,
    targetType: userFavorites.targetType,
    targetId: userFavorites.targetId,
    sortOrder: userFavorites.sortOrder,
  })
    .from(userFavorites)
    .where(eq(userFavorites.userId, userId))
    .orderBy(userFavorites.sortOrder);

  const results: Array<{
    id: string;
    targetType: 'bond' | 'tribe';
    targetId: string;
    targetName: string;
    targetAvatar: string | null;
    sortOrder: number;
  }> = [];

  for (const row of rows) {
    if (row.targetType === 'bond') {
      const [bond] = await db.select({ targetName: bonds.targetName })
        .from(bonds)
        .where(and(eq(bonds.id, row.targetId), eq(bonds.userId, userId)))
        .limit(1);
      if (bond) {
        results.push({
          id: row.id,
          targetType: 'bond',
          targetId: row.targetId,
          targetName: bond.targetName,
          targetAvatar: null,
          sortOrder: row.sortOrder,
        });
      }
    } else if (row.targetType === 'tribe') {
      const [tribe] = await db.select({ name: tribes.name, brandLogo: tribes.brandLogo })
        .from(tribes)
        .where(eq(tribes.id, row.targetId))
        .limit(1);
      if (tribe) {
        results.push({
          id: row.id,
          targetType: 'tribe',
          targetId: row.targetId,
          targetName: tribe.name,
          targetAvatar: tribe.brandLogo ?? null,
          sortOrder: row.sortOrder,
        });
      }
    }
  }

  return results;
}

export async function addFavorite(
  targetType: 'bond' | 'tribe',
  targetId: string,
): Promise<{ id: string }> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { userFavorites } = await import('@/db/schema');
  const { eq, count } = await import('drizzle-orm');

  // Enforce max 10 favorites
  const [{ value: total }] = await db.select({ value: count() })
    .from(userFavorites)
    .where(eq(userFavorites.userId, userId));
  if (total >= 10) throw new Error('Maximum of 10 favorites reached');

  const id = crypto.randomUUID();
  await db.insert(userFavorites).values({
    id,
    userId,
    targetType,
    targetId,
    sortOrder: total,
  }).onConflictDoNothing();

  return { id };
}

export async function removeFavorite(favoriteId: string): Promise<void> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { userFavorites } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  await db.delete(userFavorites)
    .where(and(eq(userFavorites.id, favoriteId), eq(userFavorites.userId, userId)));
}

export async function removeFavoriteByTarget(
  targetType: 'bond' | 'tribe',
  targetId: string,
): Promise<void> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { userFavorites } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  await db.delete(userFavorites)
    .where(and(
      eq(userFavorites.userId, userId),
      eq(userFavorites.targetType, targetType),
      eq(userFavorites.targetId, targetId),
    ));
}

export async function reorderFavorites(orderedIds: string[]): Promise<void> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { userFavorites } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  for (let i = 0; i < orderedIds.length; i++) {
    await db.update(userFavorites)
      .set({ sortOrder: i })
      .where(and(eq(userFavorites.id, orderedIds[i]), eq(userFavorites.userId, userId)));
  }
}

export async function isFavorite(
  targetType: 'bond' | 'tribe',
  targetId: string,
): Promise<boolean> {
  const userId = await requireAuth();
  const { db } = await import('@/db');
  const { userFavorites } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const [row] = await db.select({ id: userFavorites.id })
    .from(userFavorites)
    .where(and(
      eq(userFavorites.userId, userId),
      eq(userFavorites.targetType, targetType),
      eq(userFavorites.targetId, targetId),
    ))
    .limit(1);

  return !!row;
}
