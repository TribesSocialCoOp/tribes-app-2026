
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


export interface TribePost {
  id: string;
  tribeId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  authorAvatarFallback: string;
  timestamp: Date;
  title?: string;
  content: string;
  imageUrl?: string;
  imageAlt?: string;
  dataAiHintAvatar?: string;
  dataAiHintImage?: string;
  vibes?: number;
  comments?: number;
  isRemoved?: boolean;
  canBeReposted?: boolean;
  removalReason?: string;
  originalPostId?: string;
}

export interface ReportedPost {
  postId: string;
  postTitle?: string;
  reporterName: string;
  reportedAt: Date;
  reason?: string;
}

export interface DiscussionComment {
  id:string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  authorAvatarFallback: string;
  content: string;
  timestamp: Date;
  vibes?: number;
  replies?: DiscussionComment[];
  dataAiHintAvatar?: string;
}

export interface TribeMember {
  id: string;
  name: string;
  avatar: string;
  dataAiHint: string;
  tribeAssignedNickname?: string;
  role?: 'member' | 'speaker';
  tribeId: string; // Which tribe they belong to
}

export interface PendingMember {
  id: string;
  name: string;
  avatar: string;
  dataAiHint: string;
  requestTimestamp: Date;
  tribeId: string; // Which tribe they are requesting to join
}

export interface MoodStreamPost {
  id: string;
  title?: string;
  content: string;
  author: string;
  authorAvatarSrc?: string;
  authorAvatarFallback?: string;
  tribeName?: string;
  imageUrl?: string;
  imageAlt?: string;
  moodTags: string[];
  timestamp: Date;
  vibes?: number;
  comments?: number;
  dataAiHintAvatar?: string;
  dataAiHintImage?: string;
}

// For YourCommsPage
export interface CommunicationItem {
  id: string;
  type: "family-bond" | "regular-bond" | "mood-stream";
  sender?: string;
  bondName?: string;
  tribeName?: string;
  message?: string;
  content?: string;
  moodSlug?: string;
  moodName?: string;
  avatarSrc?: string;
  avatarFallback?: string;
  timestamp: Date;
  dataAiHint?: string;
  imageUrl?: string;
  imageAlt?: string;
  dataAiHintImage?: string;
}
