/**
 * @fileOverview Defines shared TypeScript types for the application.
 */

/**
 * Defines the different user roles within the Tribes.app system, aligned with the business model tiers.
 *
 * - `Admin`: Site administrators with platform-wide powers.
 * - `Creator`: Corresponds to **Tier 3 (Organizational Member)**. These users are typically brands, businesses,
 *   or large-scale creators with access to the full Creator Toolkit.
 * - `Human_Member`: Corresponds to **Tier 2 (Individual Member)**. These are paid users who are part of the Co-Op,
 *   can create tribes/events, and have unlimited bonds.
 * - `Human_Free`: Corresponds to **Tier 1 (Free User)**. The foundational tier for community participation with some limits.
 * - `Speaker`: (Moderator) A role *within* a tribe, not a platform-wide tier. Appointed by tribe Creators
 *   to help manage a specific community.
 * - `Bot`: API-driven interfaces with specific rulesets, distinct from human users.
 */
export type UserRole = "Admin" | "Creator" | "Human_Member" | "Human_Free" | "Speaker" | "Bot";


// Example of how UserRole might be used on a conceptual user object:
/*
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  // ... other profile properties
}
*/

// Bond related types, centralized here
export type BondType = "family" | "friend" | "professional" | "collaborator" | "follower" | "supporter";
export type FormationMethod = "rfid_tap" | "digital_introduction" | "virtual_request";
export type KeyType = "standard" | "event_promo" | "event_attendee";
export type AccessTier = "spectator" | "attendee" | "vip";

export interface Bond {
  id: string;
  targetName: string;
  targetType: "user" | "tribe";
  bondType: BondType;
  formationMethod: FormationMethod;
  passkeyStatus: "active" | "expires_soon" | "expired" | "needs_refresh";
  expiresAt: Date;
  lastRefreshedAt: Date;
  reconnectsCount: number;
  showInIntercom?: boolean;
  allowChatInitiation?: boolean;
  keyType?: KeyType;
  eventId?: string;
  accessTier?: AccessTier;
  pseudonym?: string; // Your alias when interacting with this bond target
  targetPseudonymForMe?: string; // The alias the bond target (if user) uses for you
  tribeAssignedNickname?: string; // The nickname assigned to YOU by the tribe (if target is tribe)
  displayPreferenceForTribeNickname?: 'my_alias' | 'tribe_assigned_nickname'; // User's preference for display
  tribeNicknameVibe?: 'love_it' | 'okay' | 'not_for_me'; // User's feedback on the nickname
  isTribeNicknameReported?: boolean; // Flag if the nickname has been reported
}

/**
 * Defines the structure for an event.
 */
export interface Event {
  id: string;
  name: string;
  keywords: string;
  description: string;
  eventDate: Date;
  associatedTribe: string; // This is the tribe's NAME for now for matching
  coverImage?: string; // URL or path to the image
  dataAiHintCover?: string;
  isPublic: boolean;
  creatorId: string; // User ID of the event creator
  locationName: string; // e.g., "Community Hall", "Zoom Online"
  locationCityRegion: string; // e.g., "Springfield, IL", "Online"
  latitude?: number;
  longitude?: number;
}


// Other shared types can be added here as the application grows.
