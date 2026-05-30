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
import { tribeKeys, tribeKeyGrants, tribeMembers, tribes, userDeviceKeys } from '@/db/schema';
import { eq, and, inArray, isNull, or } from 'drizzle-orm';

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
 * Optionally targets a specific device via deviceKeyId.
 *
 * When deviceKeyId is provided, the grant is device-specific — only that device
 * can unwrap it. When NULL, the grant uses the legacy single-identity model
 * (backwards compatible with pre-multi-device grants).
 */
export async function createTribeKeyGrant(
  tribeKeyId: string,
  recipientId: string,
  wrappedKey: string,
  wrapIv: string,
  grantedBy: string,
  deviceKeyId?: string,
): Promise<void> {
  const id = `tkg-${recipientId.substring(0, 8)}-${Date.now()}`;

  await db.insert(tribeKeyGrants).values({
    id,
    tribeKeyId,
    recipientId,
    wrappedKey,
    wrapIv,
    grantedBy,
    grantedAt: new Date(),
    deviceKeyId: deviceKeyId ?? null,
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
 *
 * Returns grants matching the given deviceKeyId, OR grants with no deviceKeyId
 * (legacy single-identity grants for backwards compatibility).
 */
export async function getUserTribeKeyGrants(userId: string, deviceKeyId?: string) {
  const rows = await db.select({
    grantId: tribeKeyGrants.id,
    tribeKeyId: tribeKeyGrants.tribeKeyId,
    wrappedKey: tribeKeyGrants.wrappedKey,
    wrapIv: tribeKeyGrants.wrapIv,
    tribeId: tribeKeys.tribeId,
    keyVersion: tribeKeys.keyVersion,
    deviceKeyId: tribeKeyGrants.deviceKeyId,
  })
    .from(tribeKeyGrants)
    .innerJoin(tribeKeys, eq(tribeKeyGrants.tribeKeyId, tribeKeys.id))
    .where(and(
      eq(tribeKeyGrants.recipientId, userId),
      eq(tribeKeys.isActive, true),
      // Match device-specific grants OR legacy grants (deviceKeyId = NULL)
      deviceKeyId
        ? or(eq(tribeKeyGrants.deviceKeyId, deviceKeyId), isNull(tribeKeyGrants.deviceKeyId))
        : isNull(tribeKeyGrants.deviceKeyId),
    ));

  return rows;
}

/**
 * Gets members of a tribe who DON'T yet have a grant for the active key.
 * Used by key admins to know who needs a new grant.
 *
 * Legacy mode: Returns user IDs missing any grant (backwards compatible).
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
 * Gets all active devices across tribe members that don't yet have a
 * device-targeted grant for the active key.
 *
 * Returns an array of { userId, deviceKeyId, publicKey } for each ungranted device.
 * This enables Phase C to fan out one grant per device instead of one per user.
 *
 * Backwards compatible: Members with NO registered devices are included with
 * deviceKeyId = null (they'll get a legacy single-identity grant).
 */
export async function getUngrantedDevices(tribeId: string): Promise<Array<{
  userId: string;
  deviceKeyId: string | null;
  publicKey: string | null;
}>> {
  const activeKey = await getActiveTribeKey(tribeId);
  if (!activeKey) return [];

  // Get all tribe member user IDs
  const members = await db.select({ userId: tribeMembers.userId })
    .from(tribeMembers)
    .where(eq(tribeMembers.tribeId, tribeId));

  const memberIds = members.map(m => m.userId);
  if (memberIds.length === 0) return [];

  // Get all existing grants for this key
  const existingGrants = await db.select({
    recipientId: tribeKeyGrants.recipientId,
    deviceKeyId: tribeKeyGrants.deviceKeyId,
  })
    .from(tribeKeyGrants)
    .where(and(
      eq(tribeKeyGrants.tribeKeyId, activeKey.id),
      inArray(tribeKeyGrants.recipientId, memberIds),
    ));

  // Build a set of "userId:deviceKeyId" strings for granted combinations
  const grantedSet = new Set(
    existingGrants.map(g => `${g.recipientId}:${g.deviceKeyId ?? 'null'}`)
  );

  // Get all active devices for these members
  const devices = await db.select({
    userId: userDeviceKeys.userId,
    deviceKeyId: userDeviceKeys.id,
    publicKey: userDeviceKeys.publicKey,
  })
    .from(userDeviceKeys)
    .where(and(
      inArray(userDeviceKeys.userId, memberIds),
      eq(userDeviceKeys.isActive, true),
    ));

  // Build a map of userId -> devices
  const deviceMap = new Map<string, Array<{ deviceKeyId: string; publicKey: string | null }>>();
  for (const d of devices) {
    if (!deviceMap.has(d.userId)) deviceMap.set(d.userId, []);
    deviceMap.get(d.userId)!.push({ deviceKeyId: d.deviceKeyId, publicKey: d.publicKey });
  }

  const ungranted: Array<{ userId: string; deviceKeyId: string | null; publicKey: string | null }> = [];

  for (const userId of memberIds) {
    const userDevices = deviceMap.get(userId);

    if (!userDevices || userDevices.length === 0) {
      // No registered devices — check if they have a legacy grant
      if (!grantedSet.has(`${userId}:null`)) {
        ungranted.push({ userId, deviceKeyId: null, publicKey: null });
      }
    } else {
      // Check each device for an existing grant
      for (const device of userDevices) {
        if (!grantedSet.has(`${userId}:${device.deviceKeyId}`)) {
          ungranted.push({ userId, deviceKeyId: device.deviceKeyId, publicKey: device.publicKey });
        }
      }
    }
  }

  return ungranted;
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
