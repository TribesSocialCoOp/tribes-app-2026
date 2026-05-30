/**
 * @fileoverview Shared vault payload types for encrypted vault backup/restore.
 *
 * Used by both vault-backup.ts (passphrase-based) and prf-vault.ts (passkey PRF-based).
 */

export interface VaultEntry {
  bondId: string;
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
  createdAt: number;
}

export interface VaultPayload {
  version: number;
  entries: VaultEntry[];
  identityKey?: {
    privateKeyJwk: JsonWebKey;
    publicKeyJwk: JsonWebKey;
  };
  tribeKeys?: TribeKeyVaultEntry[];
  exportedAt: number;
}

export interface TribeKeyVaultEntry {
  tribeId: string;
  keyJwk: JsonWebKey;
  version: number;
}
