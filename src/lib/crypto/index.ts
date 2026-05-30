/**
 * @fileoverview Client-side cryptographic infrastructure for Tribes.app bonds.
 * Phase 2B: Public API surface.
 *
 * Usage:
 * ```typescript
 * import { generateBondKeyPair, exportPublicKey, storeBondKey } from '@/lib/crypto';
 * ```
 *
 * ⚠️ This module is browser-only. Do NOT import from server-side code.
 */

// Key generation, export/import, ECDH, encryption
export {
  generateBondKeyPair,
  generateExportableBondKeyPair,
  exportPublicKey,
  exportPrivateKey,
  importPublicKey,
  importPrivateKey,
  deriveSharedSecret,
  encrypt,
  decrypt,
  generateToken,
  isCryptoAvailable,
} from './key-manager';

// IndexedDB key store
export {
  storeBondKey,
  getBondKey,
  getBondPrivateKey,
  deleteBondKey,
  getAllBondKeyIds,
  getAllBondKeys,
  markKeyRotated,
  clearAllKeys,
  isKeyStoreAvailable,
  hasAnyKeys,
  // Shared secret cache (Phase 2)
  hashPublicKeyJwk,
  storeSharedSecret,
  getSharedSecret,
  getHistoricalSharedSecrets,
  getAllSharedSecretsForBond,
  getAllSharedSecrets,
  markSharedSecretHistorical,
  deleteSharedSecret,
  // Tribe key store (Phase 3)
  storeTribeKey,
  getTribeKey,
  getAllTribeKeys,
  deleteTribeKey,
  // Identity key store (Phase 4 — Tribe key distribution)
  storeIdentityKey,
  getIdentityKey,
  type StoredBondKey,
  type CachedSharedSecret,
  type StoredTribeKey,
  type StoredIdentityKey,
} from './key-store';

// Vault backup/restore
export {
  createVaultBackup,
  restoreVaultBackup,
  validatePassphrase,
  type VaultRestoreResult,
} from './vault-backup';

// Passkey lifecycle (Phase 2D)
export {
  computePasskeyStatus,
  computeNewExpiry,
  getExpiryDuration,
  getStatusDescription,
  getStatusIndicator,
  getStatusColor,
  isBondDegraded,
  daysUntilExpiry,
} from './passkey-lifecycle';

// Passkey PRF vault (Phase 3)
export {
  isPrfSupported,
  getPrfSaltBytes,
  derivePrfWrappingKey,
  encryptVaultWithPrf,
  decryptAndRestoreVault,
} from './prf-vault';

// Tribe group encryption (Phase 3)
export {
  generateTribeGroupKey,
  encryptWithTribeKey,
  decryptWithTribeKey,
} from './tribe-encryption';

