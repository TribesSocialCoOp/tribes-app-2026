/**
 * @fileoverview Server-side key vault persistence (PRF & Passphrase).
 * Engineering for scale join table approach.
 *
 * Each credential produces a unique PRF output -> unique vault blob.
 * This service manages those blobs alongside the legacy passphrase vault.
 */

import { db } from '@/db';
import { keyVaults } from '@/db/schema';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// KEY VAULT PERSISTENCE
// ============================================================

/**
 * Stores an encrypted vault for a user.
 * Each credential (or the passphrase) gets its own row.
 */
export async function saveKeyVault(
  userId: string,
  credentialId: string | null, // NULL for passphrase
  vaultType: 'prf' | 'passphrase',
  encryptedVault: ArrayBuffer,
  salt: string,
): Promise<void> {
  const vaultBuffer = Buffer.from(encryptedVault);

  // Clear existing row for this specific credential to maintain one-vault-per-cred
  await db.delete(keyVaults).where(
    and(
      eq(keyVaults.userId, userId),
      credentialId ? eq(keyVaults.credentialId, credentialId) : isNull(keyVaults.credentialId)
    )
  );

  await db.insert(keyVaults).values({
    id: uuidv4(),
    userId,
    credentialId,
    vaultType,
    encryptedVault: vaultBuffer,
    salt,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

/**
 * Retrieves a specific vault for a user based on credential.
 */
export async function getKeyVault(
  userId: string,
  credentialId: string | null,
): Promise<{ encryptedVault: ArrayBuffer; salt: string; vaultType: string; createdAt: Date } | null> {
  const [row] = await db.select().from(keyVaults)
    .where(
      and(
        eq(keyVaults.userId, userId),
        credentialId ? eq(keyVaults.credentialId, credentialId) : isNull(keyVaults.credentialId)
      )
    )
    .limit(1);

  if (!row) return null;

  // Handle Buffer/Uint8Array to ArrayBuffer conversion.
  // SQLite blobs may be returned as Buffer, Uint8Array, or ArrayBuffer depending on driver.
  const rawBlob = row.encryptedVault;
  let arrayBuffer: ArrayBuffer;
  if (!rawBlob) {
    return null;
  } else if (rawBlob instanceof ArrayBuffer) {
    arrayBuffer = rawBlob.slice(0);
  } else {
    // Buffer or Uint8Array — copy into a fresh owned ArrayBuffer
    const u8 = Buffer.isBuffer(rawBlob)
      ? rawBlob
      : Buffer.from(rawBlob as Uint8Array);
    arrayBuffer = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
  }

  return {
    encryptedVault: arrayBuffer,
    salt: row.salt,
    vaultType: row.vaultType,
    createdAt: row.createdAt ?? new Date(),
  };
}

/**
 * Lists all vaults for a user.
 */
export async function getKeyVaultsForUser(userId: string) {
  return await db.select().from(keyVaults)
    .where(eq(keyVaults.userId, userId))
    .orderBy(desc(keyVaults.createdAt));
}

/**
 * Checks if a user has any key vault.
 */
export async function hasAnyKeyVault(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: keyVaults.id })
    .from(keyVaults)
    .where(eq(keyVaults.userId, userId))
    .limit(1);
  return !!row;
}

/**
 * Deletes a specific vault.
 */
export async function deleteKeyVault(userId: string, credentialId: string | null): Promise<void> {
  await db.delete(keyVaults).where(
    and(
      eq(keyVaults.userId, userId),
      credentialId ? eq(keyVaults.credentialId, credentialId) : isNull(keyVaults.credentialId)
    )
  );
}
