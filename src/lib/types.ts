
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

export interface UserAlias {
  name: string;
  avatar?: string;
}

export interface UserProfile {
  id: string;
  name: string; // This is the "Given Name"
  email: string;
  role: UserRole;
  aliases: UserAlias[];
  reservedAlias?: string;
  reservedAliasAvatar?: string;
  bio?: string;
  avatar?: string;
  reputationScore?: number;
  reputationStatus?: 'Onboarding' | 'Newcomer' | 'Active' | 'Trusted' | 'Veteran' | 'Elder';
  emailVerified?: boolean;
  totpEnabled?: boolean;
  aiDataSharingEnabled?: boolean;
  isVerified?: boolean;
  tosAcceptedVersion?: string | null;
  accountCreatedAt?: Date;
}

// Bond related types, centralized here
// Legacy types (family, friend, professional, collaborator, follower, supporter) are preserved in DB
// but the application logic only distinguishes between these three:
export type BondType = "person" | "tribe" | "event";
export type FormationMethod = "rfid_tap" | "digital_introduction" | "virtual_request" | "inner_circle_introduction";
export type KeyType = "standard" | "event_promo" | "event_attendee";
export type AccessTier = "spectator" | "attendee" | "vip";

// Concentric Rings
export type Ring = "journal" | "inner_circle" | "my_people" | "tribes";

// Link preview metadata (unfurled at compose time)
export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
}

export interface Bond {
  id: string;
  targetId?: string; // The raw user/tribe ID of the bond target (for blocking, etc.)
  targetSlug?: string; // Target user's slug for canonical profile linking
  targetName: string;
  targetType: "user" | "tribe";
  bondType: BondType;
  formationMethod: FormationMethod;
  passkeyStatus: "active" | "fading" | "dormant" | "expired";
  expiresAt: Date;
  lastRefreshedAt: Date;
  reconnectsCount: number;
  connectionScore: number;
  lastInteractedAt?: Date;
  showInIntercom?: boolean;
  allowChatInitiation?: boolean;
  innerCircle?: boolean; // Concentric Rings trust level (PRIVATE — never shown to other users)
  keyType?: KeyType;
  eventId?: string;
  accessTier?: AccessTier;
  pseudonym?: string; // Your alias when interacting with this bond target
  targetPseudonymForMe?: string; // The alias the bond target (if user) uses for you
  tribeAssignedNickname?: string; // The nickname assigned to YOU by the tribe (if target is tribe)
  displayPreferenceForTribeNickname?: 'my_alias' | 'tribe_assigned_nickname'; // User's preference for display
  tribeNicknameVibe?: 'love_it' | 'okay' | 'not_for_me'; // User's feedback on the nickname
  isTribeNicknameReported?: boolean; // Flag if the nickname has been reported

  // Dormant/reconnect state
  dormantAt?: Date;                // When the bond went dormant (null = not dormant)
  reconnectRequestedAt?: Date;     // Pending reconnect request timestamp
  reconnectRequestedBy?: string;   // userId who sent the reconnect request

  // Cryptographic layer (Phase 2B/2C)
  publicKeyJwk?: string; // Our JWK-exported public key (JSON string)
  peerPublicKeyJwk?: string; // The other party's public key (JSON string, from their bond row)
}


export type BondRequestStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'reconnect_pending';

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
  slug?: string;
}


export interface TribePost {
  id: string;
  slug?: string;
  slugEditedBy?: string | null;
  tribeId?: string; // Nullable for journal/bond-ring posts
  authorId: string;
  authorSlug?: string;
  authorName: string;
  authorAvatar?: string;
  authorAvatarFallback: string;
  timestamp: Date;
  title?: string;
  content: string;
  imageUrl?: string;
  imageUrls?: string[];
  imageAlt?: string;
  dataAiHintAvatar?: string;
  dataAiHintImage?: string;
  vibes?: number;
  recentVibes?: { emoji: string; count: number }[];
  hasVibed?: boolean;
  comments?: number;
  commentsData?: DiscussionComment[]; // Array of root-level comments
  isRemoved?: boolean;
  canBeReposted?: boolean;
  removalReason?: string;
  originalPostId?: string;
  isPinned?: boolean;

  // Concentric Rings
  ring?: Ring;
  moodTag?: string;
  pinnedToWall?: boolean;

  // Encryption (E2E)
  isEncrypted?: boolean;
  ciphertextBase64?: string;  // Base64 encoded ciphertext for client-side decryption
  encryptionIv?: string;      // Base64 IV for decryption

  // Link preview (unfurled at compose time)
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  linkImage?: string;
  linkSiteName?: string;

  editedAt?: Date;
  authorIsAlias?: boolean;  // True when post was authored under an alias identity
}

export interface ReportedPost {
  postId: string;
  postTitle?: string;
  reporterName: string;
  reportedAt: Date;
  reason?: string;
}

export interface DiscussionComment {
  id: string;
  authorId: string;
  authorSlug?: string;
  authorName: string;
  authorAvatar?: string;
  authorAvatarFallback: string;
  content: string;
  timestamp: Date;
  vibes?: number;
  replies?: DiscussionComment[];
  dataAiHintAvatar?: string;
  authorIsAlias?: boolean;
  // E2E encryption
  isEncrypted?: boolean;
  ciphertextBase64?: string;
  encryptionIv?: string;
}

export interface TribeMember {
  id: string;
  slug?: string;
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
  slug?: string;
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
  imageUrls?: string[];
  imageAlt?: string;
  moodTags: string[];
  timestamp: Date;
  vibes?: number;
  recentVibes?: { emoji: string; count: number }[];
  hasVibed?: boolean;
  comments?: number;
  promotedByName?: string;
  dataAiHintAvatar?: string;
  dataAiHintImage?: string;

  // Link preview
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  linkImage?: string;
  linkSiteName?: string;

  editedAt?: Date;
}


// Tribe related types
export interface Tribe {
  id: string;
  slug: string;
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
  inviteToken?: string;
  bondDurationDays?: number;    // Owner-configurable bond expiry (null = platform default 90 days)
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
  slug?: string;
  slugEditedBy?: string | null;
  tribeSlug?: string;
  type: "mood-stream" | "ring-post";
  ring?: Ring;
  authorId?: string;
  authorSlug?: string;
  sender?: string;
  currentUserTribeRole?: string;
  authorTribeRole?: 'founder' | 'speaker' | 'member';
  bondName?: string;
  bondId?: string;
  bondTargetId?: string;
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
  recentVibes?: { emoji: string; count: number }[];
  hasVibed?: boolean;
  comments?: number;
  dataAiHint?: string;
  imageUrl?: string;
  imageUrls?: string[];
  imageAlt?: string;
  dataAiHintImage?: string;
  title?: string;
  promotedByName?: string;
  pinnedToWall?: boolean;

  // E2E encryption (Phase 3)
  isEncrypted?: boolean;
  ciphertextBase64?: string;  // Base64-encoded ciphertext for client-side decryption
  encryptionIv?: string;       // Base64-encoded IV

  // Link preview
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  linkImage?: string;
  linkSiteName?: string;

  editedAt?: Date;
  authorIsAlias?: boolean;  // True when post was authored under an alias identity
}

// ============================================================
// PAGINATION
// ============================================================

/**
 * Standard paginated response wrapper.
 * - Cursor-based: use `nextCursor` (ISO timestamp string, null = last page)
 * - Offset-based: use `totalCount` for computing page numbers
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  totalCount?: number;
}

