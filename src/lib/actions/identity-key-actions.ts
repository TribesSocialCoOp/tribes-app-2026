'use server';

import { db } from '@/db';
import { users } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/auth/session';

/**
 * Publishes the user's RSA identity public key to the server.
 *
 * Uses compare-and-swap (CAS) semantics: only writes if no key exists yet.
 * This prevents multi-device race conditions where a second device's key
 * overwrites the first, invalidating all outstanding tribe key grants.
 *
 * @returns Whether the key was accepted (first device wins)
 */
export async function publishEncryptionPublicKey(publicKeyJwk: JsonWebKey): Promise<{ accepted: boolean; existingKey?: JsonWebKey }> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  // CAS: Don't overwrite if a key already exists
  const [existing] = await db.select({ encryptionPublicKey: users.encryptionPublicKey })
    .from(users).where(eq(users.id, userId)).limit(1);

  if (existing?.encryptionPublicKey) {
    return {
      accepted: false,
      existingKey: JSON.parse(existing.encryptionPublicKey),
    };
  }

  const publicKeyString = JSON.stringify(publicKeyJwk);

  await db.update(users)
    .set({ encryptionPublicKey: publicKeyString })
    .where(eq(users.id, userId));

  return { accepted: true };
}

/**
 * Fetches the encryption public key for a specific member.
 */
export async function getMemberEncryptionKey(userId: string): Promise<JsonWebKey | null> {
  const [user] = await db.select({ encryptionPublicKey: users.encryptionPublicKey })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.encryptionPublicKey) return null;
  return JSON.parse(user.encryptionPublicKey);
}

/**
 * Batch fetches encryption public keys for multiple members.
 */
export async function getMemberEncryptionKeys(userIds: string[]): Promise<Record<string, JsonWebKey>> {
  if (userIds.length === 0) return {};

  const results = await db.select({ id: users.id, encryptionPublicKey: users.encryptionPublicKey })
    .from(users)
    .where(inArray(users.id, userIds));

  const keys: Record<string, JsonWebKey> = {};
  for (const row of results) {
    if (row.encryptionPublicKey) {
      keys[row.id] = JSON.parse(row.encryptionPublicKey);
    }
  }

  return keys;
}
