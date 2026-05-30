'use server';

import { requireAuth } from './shared';

/**
 * @fileoverview Server actions for per-device key management.
 *
 * Exposes the device-key-service to the client via Next.js Server Actions.
 * All mutations are scoped to the authenticated user.
 */

/**
 * Registers the current device's public key for multi-device E2E encryption.
 * Idempotent: if the fingerprint already exists, updates lastSeenAt and returns existing ID.
 *
 * @param deviceLabel - Human-readable device name (e.g. "Chrome on macOS", "Pixel 9")
 * @param publicKeyJwk - JWK-exported RSA identity public key (JSON string)
 * @param keyFingerprint - SHA-256 hex hash of the publicKeyJwk for dedup
 */
export async function registerDeviceKeyAction(
  deviceLabel: string,
  publicKeyJwk: string,
  keyFingerprint: string,
): Promise<{ deviceKeyId: string; isNew: boolean }> {
  const userId = await requireAuth();

  // Input validation
  if (!deviceLabel || deviceLabel.length > 100) {
    throw new Error('Device label is required and must be under 100 characters');
  }
  if (!publicKeyJwk || publicKeyJwk.length > 10_000) {
    throw new Error('Public key is required and must be under 10KB');
  }
  if (!keyFingerprint || !/^[a-f0-9]{64}$/i.test(keyFingerprint)) {
    throw new Error('Key fingerprint must be a 64-character hex SHA-256 hash');
  }

  // Structural JWK validation — prevent DB poisoning from malformed keys
  let parsedJwk: Record<string, unknown>;
  try {
    parsedJwk = JSON.parse(publicKeyJwk);
  } catch {
    throw new Error('Public key must be valid JSON');
  }

  if (typeof parsedJwk !== 'object' || parsedJwk === null || Array.isArray(parsedJwk)) {
    throw new Error('Public key must be a JSON object');
  }

  // Validate required JWK fields per RFC 7517
  if (!parsedJwk.kty || typeof parsedJwk.kty !== 'string') {
    throw new Error('Public key must contain a valid "kty" field');
  }

  // Ensure it's an RSA key (our identity keys are RSA-OAEP 4096-bit)
  if (parsedJwk.kty !== 'RSA') {
    throw new Error('Public key must be an RSA key (kty: "RSA")');
  }

  // Verify it has the RSA public key components (n = modulus, e = exponent)
  if (!parsedJwk.n || !parsedJwk.e) {
    throw new Error('Public key must contain RSA components "n" and "e"');
  }

  // Reject if private key components are present (only public keys should be stored)
  if (parsedJwk.d || parsedJwk.p || parsedJwk.q || parsedJwk.dp || parsedJwk.dq || parsedJwk.qi) {
    throw new Error('Public key must not contain private key components');
  }

  const { registerDeviceKey } = await import('@/lib/services/device-key-service');
  return registerDeviceKey(userId, deviceLabel, publicKeyJwk, keyFingerprint);
}

/**
 * Returns all active device keys for the current user.
 * Used by the "Connected Devices" settings page.
 */
export async function getMyDeviceKeysAction() {
  const userId = await requireAuth();
  const { getActiveDeviceKeys } = await import('@/lib/services/device-key-service');
  const devices = await getActiveDeviceKeys(userId);

  return devices.map(d => ({
    id: d.id,
    deviceLabel: d.deviceLabel,
    keyFingerprint: d.keyFingerprint,
    isActive: d.isActive,
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    createdAt: d.createdAt?.toISOString() ?? null,
  }));
}

/**
 * Deactivates a device key (soft-delete).
 * The device will no longer receive new tribe key grants.
 * Existing grants remain — old content is still decryptable if the device has its private key.
 */
export async function deactivateDeviceKeyAction(deviceKeyId: string): Promise<boolean> {
  const userId = await requireAuth();

  if (!deviceKeyId || !deviceKeyId.startsWith('udk-')) {
    throw new Error('Invalid device key ID');
  }

  const { deactivateDeviceKey } = await import('@/lib/services/device-key-service');
  return deactivateDeviceKey(userId, deviceKeyId);
}

/**
 * Renames a device's human-readable label.
 */
export async function renameDeviceKeyAction(
  deviceKeyId: string,
  newLabel: string,
): Promise<boolean> {
  const userId = await requireAuth();

  if (!deviceKeyId || !deviceKeyId.startsWith('udk-')) {
    throw new Error('Invalid device key ID');
  }
  if (!newLabel || newLabel.length > 100) {
    throw new Error('Label is required and must be under 100 characters');
  }

  const { renameDeviceKey } = await import('@/lib/services/device-key-service');
  return renameDeviceKey(userId, deviceKeyId, newLabel);
}
