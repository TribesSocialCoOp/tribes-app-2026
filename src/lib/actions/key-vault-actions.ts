'use server';

import { requireAuth } from './shared';
import * as service from '@/lib/services/key-vault-service';
import { revalidatePath } from 'next/cache';

/**
 * Saves an encrypted PRF vault for the current user.
 * Phase 3: Hardware-backed multi-device key sync.
 */
export async function savePrfVaultAction(
  encryptedVaultBase64: string,
  credentialId: string,
  salt: string = 'tribes.app/prf-vault/v1'
) {
  const userId = await requireAuth();
  
  // Guard against oversized blobs (each key is ~500B; 512KB is very generous for any keystore)
  const MAX_VAULT_BYTES = 512 * 1024;
  if (encryptedVaultBase64.length > Math.ceil(MAX_VAULT_BYTES * 4 / 3)) {
    throw new Error('Vault blob exceeds maximum allowed size');
  }

  // Convert base64 back to binary for storage
  const encryptedVaultBuffer = Buffer.from(encryptedVaultBase64, 'base64');
  // Service expects ArrayBuffer — extract the owned backing store
  const encryptedVault = encryptedVaultBuffer.buffer.slice(
    encryptedVaultBuffer.byteOffset,
    encryptedVaultBuffer.byteOffset + encryptedVaultBuffer.byteLength
  ) as ArrayBuffer;
  
  await service.saveKeyVault(
    userId,
    credentialId,
    'prf',
    encryptedVault,
    salt
  );

  revalidatePath('/settings');
}

/**
 * Retrieves the PRF vault for a specific credential.
 * Used during login recovery flow.
 */
export async function getPrfVaultAction(credentialId: string) {
  const userId = await requireAuth();

  const result = await service.getKeyVault(userId, credentialId);
  if (!result || result.vaultType !== 'prf') return null;

  return {
    encryptedVaultBase64: Buffer.from(result.encryptedVault).toString('base64'),
    salt: result.salt,
    createdAt: result.createdAt.toISOString(),
    updatedAt: result.updatedAt.toISOString(),
  };
}

/**
 * Saves a passphrase-based vault (fallback for non-PRF authenticators).
 */
export async function savePassphraseVaultAction(
  encryptedVaultBase64: string,
  salt: string
) {
  const userId = await requireAuth();

  const MAX_VAULT_BYTES = 512 * 1024;
  if (encryptedVaultBase64.length > Math.ceil(MAX_VAULT_BYTES * 4 / 3)) {
    throw new Error('Vault blob exceeds maximum allowed size');
  }

  const encryptedVaultBuffer = Buffer.from(encryptedVaultBase64, 'base64');
  const encryptedVault = encryptedVaultBuffer.buffer.slice(
    encryptedVaultBuffer.byteOffset,
    encryptedVaultBuffer.byteOffset + encryptedVaultBuffer.byteLength
  ) as ArrayBuffer;

  await service.saveKeyVault(
    userId,
    null, // Passphrase vault is global for the user, not tied to a cred
    'passphrase',
    encryptedVault,
    salt
  );

  revalidatePath('/settings');
}

/**
 * Retrieves the passphrase vault (fallback recovery).
 */
export async function getPassphraseVaultAction() {
  const userId = await requireAuth();

  const result = await service.getKeyVault(userId, null);
  if (!result || result.vaultType !== 'passphrase') return null;

  return {
    encryptedVaultBase64: Buffer.from(result.encryptedVault).toString('base64'),
    salt: result.salt,
    createdAt: result.createdAt.toISOString(),
  };
}

/**
 * Returns summary info about all registered vaults for the user.
 * Power the "Connected Devices" and "Key Sync" status indicators.
 */
export async function getVaultStatusAction() {
  const { getCurrentUserId } = await import('./shared');
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      hasVault: false,
      devices: [],
    };
  }
  const vaults = await service.getKeyVaultsForUser(userId);
  
  return {
    hasVault: vaults.length > 0,
    devices: vaults.map(v => ({
      credentialId: v.credentialId,
      vaultType: v.vaultType,
      createdAt: v.createdAt?.toISOString(),
      updatedAt: v.updatedAt?.toISOString(),
    })),
  };
}

