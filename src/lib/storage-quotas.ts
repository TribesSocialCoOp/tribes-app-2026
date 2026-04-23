/**
 * Storage Quota Configuration
 *
 * Per-plan storage limits for public and private buckets.
 * Values in bytes. null = unlimited.
 */

export interface StorageQuota {
  /** Max bytes in the public bucket (avatars, posts, tribe covers) */
  publicBytes: number | null;
  /** Max bytes in the private bucket (bond attachments, private mood boards) */
  privateBytes: number | null;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

/**
 * Storage quotas indexed by user role (from plans.targetRole).
 */
export const STORAGE_QUOTAS: Record<string, StorageQuota> = {
  // Free tier
  Human_Free: {
    publicBytes: 50 * MB,    // 50 MB
    privateBytes: 100 * MB,  // 100 MB
  },

  // Individual Co-Op Member
  Human_Paid: {
    publicBytes: 500 * MB,   // 500 MB
    privateBytes: 2 * GB,    // 2 GB
  },

  // Organization tiers
  Org_Base: {
    publicBytes: 2 * GB,
    privateBytes: 5 * GB,
  },
  Org_Pro: {
    publicBytes: 5 * GB,
    privateBytes: 10 * GB,
  },
  Org_Enterprise: {
    publicBytes: null, // unlimited
    privateBytes: null,
  },

  // System/Bot accounts
  Bot: {
    publicBytes: 100 * MB,
    privateBytes: 0,
  },

  // Admin
  Admin: {
    publicBytes: null,
    privateBytes: null,
  },
};

/** Default quota for unknown roles */
const DEFAULT_QUOTA: StorageQuota = {
  publicBytes: 50 * MB,
  privateBytes: 100 * MB,
};

/**
 * Get the storage quota for a user role.
 */
export function getQuotaForRole(role: string): StorageQuota {
  return STORAGE_QUOTAS[role] ?? DEFAULT_QUOTA;
}

/**
 * Format bytes as a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
