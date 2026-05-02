/**
 * @fileoverview Server-side vault backup persistence.
 * Phase 2B (Gap G6): Bridges client-side encrypted vault blobs to DB storage.
 *
 * The encrypted vault is opaque to the server — it cannot read private keys.
 * This service only stores/retrieves the encrypted blob and salt.
 */

import { db } from '@/db';
import { vaultBackups } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

// ============================================================
// VAULT BACKUP PERSISTENCE
// ============================================================

/**
 * Stores an encrypted vault backup for a user.
 * Replaces any existing backup (one backup per user).
 */
export async function saveVaultBackup(
  userId: string,
  encryptedVault: ArrayBuffer,
  salt: string,
): Promise<void> {
  const id = `vault-${userId}-${Date.now()}`;
  const vaultBuffer = Buffer.from(encryptedVault);

  // Atomic delete + insert (one-active-backup policy)
  await db.transaction(async (tx) => {
    await tx.delete(vaultBackups).where(eq(vaultBackups.userId, userId));
    await tx.insert(vaultBackups).values({
      id,
      userId,
      encryptedVault: vaultBuffer,
      salt,
      createdAt: new Date(),
    });
  });
}

/**
 * Retrieves the most recent encrypted vault backup for a user.
 * Returns null if no backup exists.
 */
export async function getVaultBackup(
  userId: string,
): Promise<{ encryptedVault: ArrayBuffer; salt: string; createdAt: Date } | null> {
  const [row] = await db.select().from(vaultBackups)
    .where(eq(vaultBackups.userId, userId))
    .orderBy(desc(vaultBackups.createdAt))
    .limit(1);

  if (!row) return null;

  // Convert Buffer/Blob back to ArrayBuffer
  const buffer = row.encryptedVault;
  let arrayBuffer: ArrayBuffer;
  if (buffer instanceof ArrayBuffer) {
    arrayBuffer = buffer;
  } else {
    const buf = buffer as Buffer;
    const uint8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    arrayBuffer = uint8.slice().buffer as ArrayBuffer;
  }

  return {
    encryptedVault: arrayBuffer,
    salt: row.salt,
    createdAt: row.createdAt ?? new Date(),
  };
}

/**
 * Checks if a user has a vault backup.
 */
export async function hasVaultBackup(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: vaultBackups.id })
    .from(vaultBackups)
    .where(eq(vaultBackups.userId, userId))
    .limit(1);
  return !!row;
}

/**
 * Deletes all vault backups for a user. Use when the user changes their passphrase.
 */
export async function deleteVaultBackup(userId: string): Promise<void> {
  await db.delete(vaultBackups).where(eq(vaultBackups.userId, userId));
}
