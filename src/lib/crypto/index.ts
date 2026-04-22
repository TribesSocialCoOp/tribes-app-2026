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
  type StoredBondKey,
} from './key-store';

// Vault backup/restore
export {
  createVaultBackup,
  restoreVaultBackup,
  validatePassphrase,
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
