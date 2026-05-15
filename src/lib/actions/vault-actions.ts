'use server';

/**
 * Server actions for vault backup management.
 * The encrypted vault blob is opaque to the server. We just store and retrieve it.
 */

import { db } from '@/db';
import { vaultBackups } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/auth/session';

/**
 * Saves an encrypted vault backup for the current user.
 * Replaces any existing backup (one backup per user).
 */
export async function saveVaultBackup(
  encryptedVaultBase64: string,
  salt: string,
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  const encryptedVault = Buffer.from(encryptedVaultBase64, 'base64');

  // Upsert: delete old backup, insert new one
  await db.delete(vaultBackups).where(eq(vaultBackups.userId, userId));
  await db.insert(vaultBackups).values({
    id: crypto.randomUUID(),
    userId,
    encryptedVault,
    salt,
    createdAt: new Date(),
  });
}

/**
 * Retrieves the encrypted vault backup for the current user.
 * Returns null if no backup exists.
 */
export async function getVaultBackup(): Promise<{
  encryptedVaultBase64: string;
  salt: string;
  createdAt: Date | null;
} | null> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  const [backup] = await db.select().from(vaultBackups)
    .where(eq(vaultBackups.userId, userId))
    .limit(1);

  if (!backup) return null;

  // Convert blob to base64 for transport
  const encryptedVaultBase64 = Buffer.from(backup.encryptedVault as Buffer).toString('base64');

  return {
    encryptedVaultBase64,
    salt: backup.salt,
    createdAt: backup.createdAt,
  };
}

/**
 * Checks if a vault backup exists for the current user.
 * Lighter than fetching the full blob.
 */
export async function hasVaultBackup(): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const [backup] = await db.select({ id: vaultBackups.id }).from(vaultBackups)
    .where(eq(vaultBackups.userId, userId))
    .limit(1);

  return !!backup;
}

/**
 * Returns the vault backup date for the current user without fetching the blob.
 * Used to warn users if their backup is older than orphaned bonds.
 */
export async function getVaultBackupDate(): Promise<Date | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const [backup] = await db.select({ createdAt: vaultBackups.createdAt }).from(vaultBackups)
    .where(eq(vaultBackups.userId, userId))
    .limit(1);

  return backup?.createdAt ?? null;
}

/**
 * Deletes all vault backups for the current user.
 */
export async function deleteVaultBackup(): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  await db.delete(vaultBackups).where(eq(vaultBackups.userId, userId));
}
