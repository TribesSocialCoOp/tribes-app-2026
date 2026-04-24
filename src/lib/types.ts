
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
 * - `Human_Paid`: Individual co-op member (paid or earned upgrade from Human_Free).
 * - `System`: Internal service accounts (e.g., test-service-admin).
 * - `Org_Base` / `Org_Pro` / `Org_Enterprise`: Organization-tier roles from the plans system.
 */
export type UserRole = "Admin" | "Creator" | "Human_Member" | "Human_Free" | "Human_Paid" | "Speaker" | "Bot" | "System" | "Org_Base" | "Org_Pro" | "Org_Enterprise";

export interface UserProfile {
  id: string;
  name: string; // This is the "Given Name"
  email: string;
  role: UserRole;
  aliases: string[];
  reservedAlias?: string;
  bio?: string;
  avatar?: string;
  reputationScore?: number;
  reputationStatus?: 'Onboarding' | 'Newcomer' | 'Active' | 'Trusted' | 'Veteran' | 'Elder';
  emailVerified?: boolean;
  totpEnabled?: boolean;
  aiDataSharingEnabled?: boolean;
  isVerified?: boolean;
  accountCreatedAt?: Date;
}

// Bond related types, centralized here
export type BondType = "family" | "friend" | "professional" | "collaborator" | "follower" | "supporter";
export type FormationMethod = "rfid_tap" | "digital_introduction" | "virtual_request" | "family_introduction";
export type KeyType = "standard" | "event_promo" | "event_attendee";
export type AccessTier = "spectator" | "attendee" | "vip";

export interface Bond {
  id: string;
  targetId?: string; // The raw user/tribe ID of the bond target (for blocking, etc.)
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

  // Cryptographic layer (Phase 2B/2C)
  publicKeyJwk?: string; // Our JWK-exported public key (JSON string)
  peerPublicKeyJwk?: string; // The other party's public key (JSON string, from their bond row)
}

export type BondRequestStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

export interface BondRequest {
  id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserAvatar?: string;
  toUserId: string;
  toUserName: string;
  toUserAvatar?: string;
  bondType: BondType;
  formationMethod: FormationMethod;
  message?: string;
  status: BondRequestStatus;
  createdAt: Date;
  resolvedAt?: Date;
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
  rsvpPointsReward?: number; // Contribution points awarded for RSVP, set by coordinator
  rsvpCount?: number; // Number of 'going' RSVPs
  userRsvpStatus?: 'going' | 'interested' | 'not_going' | null; // Current user's RSVP
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
  commentsData?: DiscussionComment[]; // Array of root-level comments
  isRemoved?: boolean;
  canBeReposted?: boolean;
  removalReason?: string;
  originalPostId?: string;
  isPinned?: boolean;
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
  avatar?: string;
  dataAiHint?: string;
  tribeAssignedNickname?: string;
  role?: 'founder' | 'speaker' | 'member';
  tribeId: string; // Which tribe they belong to
  reputationStatus?: 'Onboarding' | 'Newcomer' | 'Active' | 'Trusted' | 'Veteran' | 'Elder';
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
  tribeId?: string;
  imageUrl?: string;
  imageAlt?: string;
  moodTags: string[];
  timestamp: Date;
  vibes?: number;
  comments?: number;
  promotedByName?: string;
  dataAiHintAvatar?: string;
  dataAiHintImage?: string;
}


// Tribe related types
export interface Tribe {
  id: string;
  name: string;
  description: string;
  members: number;
  isPublic: boolean;
  cover: string;
  coverPosition?: string;        // CSS object-position, e.g. '50% 30%'
  dataAiHint: string;
  moods?: string[];
  homepageUrl?: string;
  joinMechanism?: 'instant' | 'approval';
  minimumReputation?: UserProfile['reputationStatus'];
  minimumAccountAgeDays?: number;
  brandColor?: string;
  brandLogo?: string;
  createdBy?: string;
}

// Story related types
export interface StoryTopic {
  id: string;
  title: string;
  summary: string;
  category: 'local' | 'national' | 'global';
  curator?: string;
  curatorAvatar?: string;
  curatorAvatarFallback?: string;
  dataAiHintCuratorAvatar?: string;
  coverImage?: string;
  dataAiHintCover?: string;
  discussionCount: number;
  lastUpdatedAt: Date;
}

export interface SourceArticle {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  publishedDate: Date;
  summarySnippet?: string;
  dataAiHint?: string;
}

// For YourCommsPage
export interface CommunicationItem {
  id: string;
  type: "family-bond" | "regular-bond" | "mood-stream";
  sender?: string;
  bondName?: string;
  tribeName?: string;
  tribeId?: string;
  message?: string;
  content?: string;
  moodSlug?: string;
  moodName?: string;
  avatarSrc?: string;
  avatarFallback?: string;
  timestamp: Date;
  vibes?: number;
  dataAiHint?: string;
  imageUrl?: string;
  imageAlt?: string;
  dataAiHintImage?: string;
  title?: string;
  promotedByName?: string;
}
