/**
 * @fileoverview Server-side service for per-device key management.
 * Handles registration, dedup, and lifecycle of entries in the
 * `user_device_keys` table for multi-device E2E encryption.
 *
 * Each device registers its own RSA identity public key. Tribe key grants
 * can then target a specific device (via `tribe_key_grants.device_key_id`)
 * so all of a user's devices can independently decrypt tribe content.
 *
 * This is an ADDITIVE overlay on top of the existing single-identity model
 * (users.encryptionPublicKey). Old grants with deviceKeyId = NULL continue
 * to work through a fallback path. New grants start targeting devices.
 *
 * ⚠️ Server-only. Do NOT import from client-side code.
 */

import { db } from '@/db';
import { userDeviceKeys } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

// Maximum active devices per user — prevents unbounded grant fan-out
const MAX_ACTIVE_DEVICES = 10;

// ============================================================
// DEVICE REGISTRATION
// ============================================================

/**
 * Registers a device's public key, deduplicating by fingerprint.
 *
 * If the fingerprint already exists for this user, updates `lastSeenAt`
 * and returns the existing record (idempotent re-registration).
 *
 * If the user already has MAX_ACTIVE_DEVICES, the oldest (by lastSeenAt)
 * is deactivated to make room.
 *
 * @param userId - The authenticated user's ID
 * @param deviceLabel - Human-readable device name (e.g. "Chrome on macOS")
 * @param publicKeyJwk - JWK-exported RSA public key (JSON string)
 * @param keyFingerprint - SHA-256 hash of the publicKeyJwk for dedup
 * @returns { deviceKeyId, isNew } — The device key record ID and whether it was newly created
 */
export async function registerDeviceKey(
  userId: string,
  deviceLabel: string,
  publicKeyJwk: string,
  keyFingerprint: string,
): Promise<{ deviceKeyId: string; isNew: boolean }> {
  // Check for existing registration with same fingerprint (idempotent)
  const [existing] = await db.select()
    .from(userDeviceKeys)
    .where(and(
      eq(userDeviceKeys.userId, userId),
      eq(userDeviceKeys.keyFingerprint, keyFingerprint),
    ))
    .limit(1);

  if (existing) {
    // Re-registration — update lastSeenAt and reactivate if deactivated
    await db.update(userDeviceKeys).set({
      lastSeenAt: new Date(),
      isActive: true,
      deviceLabel, // Update label in case user changed it
    }).where(eq(userDeviceKeys.id, existing.id));

    return { deviceKeyId: existing.id, isNew: false };
  }

  // Enforce device limit — deactivate oldest if at capacity
  const activeDevices = await db.select()
    .from(userDeviceKeys)
    .where(and(
      eq(userDeviceKeys.userId, userId),
      eq(userDeviceKeys.isActive, true),
    ))
    .orderBy(userDeviceKeys.lastSeenAt);

  if (activeDevices.length >= MAX_ACTIVE_DEVICES) {
    // Deactivate the oldest device(s) to make room
    const toDeactivate = activeDevices.slice(0, activeDevices.length - MAX_ACTIVE_DEVICES + 1);
    for (const device of toDeactivate) {
      await db.update(userDeviceKeys).set({ isActive: false })
        .where(eq(userDeviceKeys.id, device.id));
      console.log(`[device-keys] Deactivated oldest device ${device.deviceLabel} for user ${userId.substring(0, 8)}...`);
    }
  }

  // Insert new device
  const deviceKeyId = `udk-${userId.substring(0, 8)}-${Date.now()}`;

  await db.insert(userDeviceKeys).values({
    id: deviceKeyId,
    userId,
    deviceLabel,
    publicKey: publicKeyJwk,
    keyFingerprint,
    isActive: true,
    lastSeenAt: new Date(),
    createdAt: new Date(),
  });

  return { deviceKeyId, isNew: true };
}

// ============================================================
// DEVICE QUERIES
// ============================================================

/**
 * Returns all active device keys for a user.
 * Used by the "Connected Devices" settings page and by key admins
 * when distributing tribe keys to all of a member's devices.
 */
export async function getActiveDeviceKeys(userId: string) {
  return db.select()
    .from(userDeviceKeys)
    .where(and(
      eq(userDeviceKeys.userId, userId),
      eq(userDeviceKeys.isActive, true),
    ))
    .orderBy(userDeviceKeys.lastSeenAt);
}

/**
 * Returns all device keys for a user (including deactivated).
 * Used by settings UI to show full device history.
 *
 * @future Will be wired into a "Device History" tab in settings to show
 * previously deactivated devices and allow re-activation.
 */
export async function getAllDeviceKeys(userId: string) {
  return db.select()
    .from(userDeviceKeys)
    .where(eq(userDeviceKeys.userId, userId))
    .orderBy(userDeviceKeys.lastSeenAt);
}

/**
 * Gets a specific device key by ID.
 *
 * @future Will be used for device verification flows (e.g. confirming
 * a device's fingerprint during manual key exchange) and for
 * admin-side grant inspection.
 */
export async function getDeviceKey(deviceKeyId: string) {
  const [row] = await db.select()
    .from(userDeviceKeys)
    .where(eq(userDeviceKeys.id, deviceKeyId))
    .limit(1);

  return row ?? null;
}

// ============================================================
// DEVICE LIFECYCLE
// ============================================================

/**
 * Deactivates a device key (soft-delete).
 * Does NOT delete existing grants — they become stale and the device
 * can no longer receive new grants. Old grants remain readable if
 * the device still has the private key locally.
 *
 * Only the device's owner can deactivate it.
 */
export async function deactivateDeviceKey(
  userId: string,
  deviceKeyId: string,
): Promise<boolean> {
  const result = await db.update(userDeviceKeys).set({
    isActive: false,
  }).where(and(
    eq(userDeviceKeys.id, deviceKeyId),
    eq(userDeviceKeys.userId, userId), // Security: only owner can deactivate
  ));

  return (result.rowCount ?? 0) > 0;
}

/**
 * Updates the human-readable label for a device.
 * Only the device's owner can rename it.
 */
export async function renameDeviceKey(
  userId: string,
  deviceKeyId: string,
  newLabel: string,
): Promise<boolean> {
  const result = await db.update(userDeviceKeys).set({
    deviceLabel: newLabel,
  }).where(and(
    eq(userDeviceKeys.id, deviceKeyId),
    eq(userDeviceKeys.userId, userId),
  ));

  return (result.rowCount ?? 0) > 0;
}

/**
 * Updates the lastSeenAt timestamp for a device.
 * Called on each sync cycle to track device activity.
 *
 * @future Will be called from a lightweight heartbeat endpoint
 * (separate from the full key-sync cycle) to track device freshness
 * without the overhead of re-registration. Currently, Phase 0.5
 * achieves this through idempotent registerDeviceKey calls.
 */
export async function touchDeviceKey(deviceKeyId: string): Promise<void> {
  await db.update(userDeviceKeys).set({
    lastSeenAt: new Date(),
  }).where(eq(userDeviceKeys.id, deviceKeyId));
}
