/**
 * @fileoverview Server-side service for tribe group key management.
 * Handles CRUD operations for tribe_keys and tribe_key_grants tables.
 *
 * This service is called by:
 * 1. The KeySyncProvider (client-side) — to fetch grants and detect new members
 * 2. Tribe creation flow — to initialize the first tribe key
 * 3. Member management — to issue grants and rotate keys on removal
 */

import { db } from '@/db';
import { tribeKeys, tribeKeyGrants, tribeMembers, tribes } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

// ============================================================
// TRIBE KEY CRUD
// ============================================================

/**
 * Creates a new tribe key record (server side).
 * Called after the client generates the AES key and wraps it for the first member (founder).
 */
export async function createTribeKey(
  tribeId: string,
  createdBy: string,
  keyVersion = 1,
): Promise<string> {
  const id = `tk-${tribeId.substring(0, 8)}-${Date.now()}`;

  await db.insert(tribeKeys).values({
    id,
    tribeId,
    keyVersion,
    isActive: true,
    createdBy,
    createdAt: new Date(),
  });

  return id;
}

/**
 * Gets the active tribe key record for a tribe.
 */
export async function getActiveTribeKey(tribeId: string) {
  const [row] = await db.select()
    .from(tribeKeys)
    .where(and(eq(tribeKeys.tribeId, tribeId), eq(tribeKeys.isActive, true)))
    .limit(1);

  return row ?? null;
}

/**
 * Deactivates the current active key and creates a new version.
 * Called during key rotation (member removal).
 */
export async function rotateTribeKey(
  tribeId: string,
  rotatedBy: string,
): Promise<string> {
  const current = await getActiveTribeKey(tribeId);
  const newVersion = current ? current.keyVersion + 1 : 1;

  // Deactivate old key
  if (current) {
    await db.update(tribeKeys).set({
      isActive: false,
      rotatedAt: new Date(),
    }).where(eq(tribeKeys.id, current.id));
  }

  // Create new key record
  return createTribeKey(tribeId, rotatedBy, newVersion);
}

// ============================================================
// TRIBE KEY GRANTS
// ============================================================

/**
 * Stores a wrapped tribe key grant for a recipient.
 */
export async function createTribeKeyGrant(
  tribeKeyId: string,
  recipientId: string,
  wrappedKey: string,
  wrapIv: string,
  grantedBy: string,
  bondId?: string,
): Promise<void> {
  const id = `tkg-${recipientId.substring(0, 8)}-${Date.now()}`;

  await db.insert(tribeKeyGrants).values({
    id,
    tribeKeyId,
    recipientId,
    wrappedKey,
    wrapIv,
    bondId: bondId ?? null,
    grantedBy,
    grantedAt: new Date(),
  });
}

/**
 * Gets a user's grant for a specific tribe key.
 */
export async function getTribeKeyGrant(
  tribeKeyId: string,
  recipientId: string,
) {
  const [row] = await db.select()
    .from(tribeKeyGrants)
    .where(and(
      eq(tribeKeyGrants.tribeKeyId, tribeKeyId),
      eq(tribeKeyGrants.recipientId, recipientId),
    ))
    .limit(1);

  return row ?? null;
}

/**
 * Gets all grants for a user across all active tribe keys.
 * Used by the KeySyncProvider to fetch tribe keys on app mount.
 */
export async function getUserTribeKeyGrants(userId: string) {
  const rows = await db.select({
    grantId: tribeKeyGrants.id,
    tribeKeyId: tribeKeyGrants.tribeKeyId,
    wrappedKey: tribeKeyGrants.wrappedKey,
    wrapIv: tribeKeyGrants.wrapIv,
    bondId: tribeKeyGrants.bondId,
    tribeId: tribeKeys.tribeId,
    keyVersion: tribeKeys.keyVersion,
  })
    .from(tribeKeyGrants)
    .innerJoin(tribeKeys, eq(tribeKeyGrants.tribeKeyId, tribeKeys.id))
    .where(and(
      eq(tribeKeyGrants.recipientId, userId),
      eq(tribeKeys.isActive, true),
    ));

  return rows;
}

/**
 * Gets members of a tribe who DON'T yet have a grant for the active key.
 * Used by key admins to know who needs a new grant.
 */
export async function getMembersWithoutGrants(tribeId: string): Promise<string[]> {
  const activeKey = await getActiveTribeKey(tribeId);
  if (!activeKey) return [];

  // Get all tribe member user IDs
  const members = await db.select({ userId: tribeMembers.userId })
    .from(tribeMembers)
    .where(eq(tribeMembers.tribeId, tribeId));

  const memberIds = members.map(m => m.userId);
  if (memberIds.length === 0) return [];

  // Get all recipients who already have grants for this key
  const existingGrants = await db.select({ recipientId: tribeKeyGrants.recipientId })
    .from(tribeKeyGrants)
    .where(and(
      eq(tribeKeyGrants.tribeKeyId, activeKey.id),
      inArray(tribeKeyGrants.recipientId, memberIds),
    ));

  const grantedIds = new Set(existingGrants.map(g => g.recipientId));
  return memberIds.filter(id => !grantedIds.has(id));
}

/**
 * Checks if a tribe is private (and thus needs encryption).
 */
export async function isTribePrivate(tribeId: string): Promise<boolean> {
  const [tribe] = await db.select({ isPublic: tribes.isPublic })
    .from(tribes)
    .where(eq(tribes.id, tribeId))
    .limit(1);

  return tribe ? !tribe.isPublic : false;
}

/**
 * Deletes all grants for a specific tribe key.
 * Called during key rotation to clean up old grants.
 */
export async function deleteGrantsForKey(tribeKeyId: string): Promise<void> {
  await db.delete(tribeKeyGrants)
    .where(eq(tribeKeyGrants.tribeKeyId, tribeKeyId));
}

/**
 * Deletes a specific user's grant for a tribe key.
 * Called when a member is removed from a tribe.
 */
export async function deleteGrantForUser(
  tribeKeyId: string,
  userId: string,
): Promise<void> {
  await db.delete(tribeKeyGrants)
    .where(and(
      eq(tribeKeyGrants.tribeKeyId, tribeKeyId),
      eq(tribeKeyGrants.recipientId, userId),
    ));
}
