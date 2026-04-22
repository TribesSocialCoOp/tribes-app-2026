/**
 * @fileoverview Application-wide constants.
 * Centralizes values that were previously duplicated across components.
 *
 * This file is the SINGLE SOURCE OF TRUTH for reputation hierarchies,
 * tribe role definitions, and magic IDs. All frontend and backend
 * consumers must import from here — never define these locally.
 */

/** Standard set of vibe/reaction emoticons used across all feed components. */
export const VIBE_EMOTICONS = ["👍", "❤️", "😂", "🤔", "😢", "😠"] as const;

/** Type for a single vibe emoticon */
export type VibeEmoticon = typeof VIBE_EMOTICONS[number];

// ============================================================
// REPUTATION HIERARCHY
// ============================================================

/**
 * Canonical reputation levels in ascending order.
 * Used for gate checks, display, and settings UI.
 *
 * Flow: New accounts start at 'Onboarding', graduate to 'Newcomer'
 * after completing onboarding, then rise through community participation.
 */
export const REPUTATION_HIERARCHY: Record<string, number> = {
  'Onboarding': 0,
  'Newcomer': 1,
  'Active': 2,
  'Trusted': 3,
  'Veteran': 4,
  'Elder': 5,
};

/** All reputation levels as an ordered array (lowest to highest). */
export const REPUTATION_LEVELS = [
  'Onboarding',
  'Newcomer',
  'Active',
  'Trusted',
  'Veteran',
  'Elder',
] as const;

export type ReputationStatus = (typeof REPUTATION_LEVELS)[number];

/**
 * Reputation levels available as tribe join-gate options in settings.
 * Excludes 'Onboarding' (the default for new users — wouldn't be a useful gate).
 */
export const REPUTATION_GATE_OPTIONS: ReputationStatus[] = [
  'Newcomer',
  'Active',
  'Trusted',
  'Veteran',
  'Elder',
];

// ============================================================
// TRIBE MEMBER ROLES
// ============================================================

/**
 * Roles within a tribe. These are DISTINCT from platform-level UserRole.
 *
 * - 'founder': The tribe creator. Full governance. Set when createTribe runs.
 * - 'speaker': Moderator + ambassador. Speaks for the tribe in inter-tribe
 *   contexts. Can moderate content, approve joins, manage nicknames.
 * - 'member': Regular participant. Can post, comment, vibe.
 */
export const TRIBE_ROLES = ['founder', 'speaker', 'member'] as const;
export type TribeMemberRole = (typeof TRIBE_ROLES)[number];

// ============================================================
// MAGIC IDs
// ============================================================

/**
 * "The Trials" — the platform's onboarding/hub tribe.
 * Everyone is treated as a member. Cannot be joined or left.
 */
export const TRIBE_0_ID = '0';

// ============================================================
// AUTHORITY HELPERS
// ============================================================

/**
 * Check if a reputation level meets a minimum gate requirement.
 * Returns true if userLevel >= requiredLevel in the hierarchy.
 */
export function meetsReputationGate(
  userStatus: string | undefined | null,
  requiredStatus: string | undefined | null,
): boolean {
  if (!requiredStatus || requiredStatus === 'None') return true;
  const userLevel = REPUTATION_HIERARCHY[userStatus ?? 'Onboarding'] ?? 0;
  const requiredLevel = REPUTATION_HIERARCHY[requiredStatus] ?? 0;
  return userLevel >= requiredLevel;
}

// ============================================================
// CONTENT MODERATION — Tombstone / Deletion Display Strings
// ============================================================

/**
 * Strings used when content is tombstoned due to account deletion
 * or moderation actions. These are the user-facing values stored
 * in the database and rendered in the UI.
 */

/** Display name shown in place of a deleted user's real name. */
export const DELETED_USER_NAME = 'Deleted User';

/** Avatar fallback initials for a deleted user. */
export const DELETED_USER_AVATAR_FALLBACK = 'XX';

/** Replacement text for content that has been removed. */
export const REMOVED_CONTENT_PLACEHOLDER = '[This content has been removed]';

/** Removal reason stored on posts when the author deletes their account. */
export const ACCOUNT_DELETION_REASON = 'The author deleted their account.';
