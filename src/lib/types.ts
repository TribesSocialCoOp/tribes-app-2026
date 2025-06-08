
/**
 * @fileOverview Defines shared TypeScript types for the application.
 */

/**
 * Defines the different user roles within the Tribes.app system.
 * - Admin: Site administrators with broad powers.
 * - Creator: Users who can create and manage tribes, organize events, and potentially monetize content.
 * - Speaker: (Moderator) Users elected or appointed to moderate tribes and assist in content promotion.
 * - Human: Regular default users who can create simple tribes, manage family, and connections.
 * - Bot: API-driven interfaces with specific rulesets, distinct from human users.
 */
export type UserRole = "Admin" | "Creator" | "Speaker" | "Human" | "Bot";

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

// Other shared types can be added here as the application grows.
