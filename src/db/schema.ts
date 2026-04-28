import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, blob, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ============================================================
// CORE IDENTITY
// ============================================================

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  role: text('role').notNull().default('Human_Free'),
  bio: text('bio'),
  avatar: text('avatar'),
  reservedAlias: text('reserved_alias').unique(),
  reputationScore: integer('reputation_score').default(0),
  reputationStatus: text('reputation_status').default('Newcomer'),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false),
  totpSecret: text('totp_secret'),
  totpEnabled: integer('totp_enabled', { mode: 'boolean' }).default(false),
  aiDataSharingEnabled: integer('ai_data_sharing_enabled', { mode: 'boolean' }).default(true),
  isVerified: integer('is_verified', { mode: 'boolean' }).default(false), // Org verified badge
  deletionRequestedAt: integer('deletion_requested_at', { mode: 'timestamp' }), // null = active, set = pending deletion
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

export const userAliases = sqliteTable('user_aliases', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  alias: text('alias').notNull(),
  avatar: text('avatar'), // Generated SVG or custom image url
});

export const credentials = sqliteTable('credentials', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  publicKey: blob('public_key').notNull(),
  counter: integer('counter').default(0),
  transports: text('transports'), // JSON array
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

// DB-backed sessions for session revocation and subscription status tracking
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }), // null = active, set = revoked
  userAgent: text('user_agent'),
});

export const oauthAccounts = sqliteTable('oauth_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // 'google', 'apple'
  providerAccountId: text('provider_account_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

export const vaultBackups = sqliteTable('vault_backups', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  encryptedVault: blob('encrypted_vault').notNull(), // Encrypted JSON containing E2E keys
  salt: text('salt').notNull(), // Salt used for PBKDF2 stretching of recovery passphrase
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

export const keyVaults = sqliteTable('key_vaults', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  credentialId: text('credential_id'),       // WebAuthn credential ID (NULL for passphrase vaults)
  vaultType: text('vault_type').notNull(),    // 'prf' | 'passphrase'
  encryptedVault: blob('encrypted_vault').notNull(),
  salt: text('salt').notNull(),               // HKDF salt (PRF) or PBKDF2 salt (passphrase)
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
}, (table) => [
  // NOTE: SQLite treats NULL != NULL, so this index does NOT enforce uniqueness across
  // passphrase vaults (where credentialId IS NULL). The service-layer "delete before insert"
  // pattern in key-vault-service.ts compensates for this intentionally.
  uniqueIndex('key_vaults_user_credential_idx').on(table.userId, table.credentialId),
]);

// ============================================================
// SUBSCRIPTION & BILLING (Phase 3)
// ============================================================

export const plans = sqliteTable('plans', {
  id: text('id').primaryKey(),              // 'free', 'individual_coop', 'creator', 'org_base', 'org_pro', 'org_enterprise'
  name: text('name').notNull(),
  description: text('description'),
  priceMonthly: integer('price_monthly'),   // cents (null = free)
  priceYearly: integer('price_yearly'),     // cents (null = free)
  maxBonds: integer('max_bonds'),           // null = unlimited
  maxTribesOwned: integer('max_tribes_owned'),
  maxMembers: integer('max_members'),       // null = unlimited; tribe member cap for org tiers
  stripePriceIdMonthly: text('stripe_price_id_monthly'),
  stripePriceIdYearly: text('stripe_price_id_yearly'),
  targetRole: text('target_role').notNull(), // UserRole this plan grants
  features: text('features'),               // JSON array of feature flags
  sortOrder: integer('sort_order').default(0),
});

export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planId: text('plan_id').notNull().references(() => plans.id),
  status: text('status').notNull(),         // 'active', 'past_due', 'canceled', 'trialing', 'incomplete'
  source: text('source').notNull().default('paid'), // 'paid' | 'founding' | 'earned'
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  currentPeriodStart: integer('current_period_start', { mode: 'timestamp' }),
  currentPeriodEnd: integer('current_period_end', { mode: 'timestamp' }),
  cancelAtPeriodEnd: integer('cancel_at_period_end', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

export const inviteCodes = sqliteTable('invite_codes', {
  id: text('id').primaryKey(),              // The code itself, format: TRIBE-XXXX-XXXX
  type: text('type', { enum: ['founding', 'referral'] }).notNull().default('referral'), // 'founding' = admin grants paid plan; 'referral' = user shares free access
  createdBy: text('created_by').references(() => users.id),
  grantsPlanId: text('grants_plan_id').notNull().references(() => plans.id), // Which plan this code unlocks
  maxUses: integer('max_uses').default(1),
  usedCount: integer('used_count').default(0),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

export const inviteRedemptions = sqliteTable('invite_redemptions', {
  id: text('id').primaryKey(),
  inviteCodeId: text('invite_code_id').notNull().references(() => inviteCodes.id),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  redeemedAt: integer('redeemed_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

export const contributions = sqliteTable('contributions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),             // 'post', 'moderation', 'referral', 'bug_report', 'event_hosted'
  referenceId: text('reference_id'),        // ID of the post/report/etc
  points: integer('points').notNull(),      // Contribution points awarded
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================
// BONDS (Cryptographic Key-Pair Relationships)
// ============================================================

export const bonds = sqliteTable('bonds', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetId: text('target_id').notNull(),
  targetType: text('target_type').notNull(), // 'user' | 'tribe'
  targetName: text('target_name').notNull(),
  bondType: text('bond_type').notNull(), // BondType enum
  formationMethod: text('formation_method').notNull(), // FormationMethod enum
  passkeyStatus: text('passkey_status').default('active'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  lastRefreshedAt: integer('last_refreshed_at', { mode: 'timestamp' }),
  reconnectsCount: integer('reconnects_count').default(0),

  // Identity layer
  pseudonym: text('pseudonym'),
  targetPseudonymForMe: text('target_pseudonym_for_me'),
  tribeAssignedNickname: text('tribe_assigned_nickname'),
  displayPreference: text('display_preference'),
  nicknameVibe: text('nickname_vibe'),
  isNicknameReported: integer('is_nickname_reported', { mode: 'boolean' }).default(false),

  // Intercom preferences
  showInIntercom: integer('show_in_intercom', { mode: 'boolean' }).default(true),
  allowChatInitiation: integer('allow_chat_initiation', { mode: 'boolean' }).default(false),

  // Concentric Rings — trust level (PRIVATE: never exposed to other users)
  innerCircle: integer('inner_circle', { mode: 'boolean' }).default(false),

  // Event bond fields
  keyType: text('key_type').default('standard'),
  eventId: text('event_id'),
  accessTier: text('access_tier'),

  // Cryptographic layer (Phase 2B)
  publicKeyJwk: text('public_key_jwk'), // JWK-exported public key for this side of the bond

  // Connection vibe (Organic engagement)
  connectionScore: integer('connection_score').default(0),
  lastInteractedAt: integer('last_interacted_at', { mode: 'timestamp' }),
  dailyScoreAdded: integer('daily_score_added').default(0),

  // Dormant/reconnect state
  dormantAt: integer('dormant_at', { mode: 'timestamp' }),           // When bond went dormant
  reconnectRequestedAt: integer('reconnect_requested_at', { mode: 'timestamp' }),
  reconnectRequestedBy: text('reconnect_requested_by'),               // userId who requested reconnect
});

export const bondRequests = sqliteTable('bond_requests', {
  id: text('id').primaryKey(),
  fromUserId: text('from_user_id').notNull().references(() => users.id),
  toUserId: text('to_user_id').notNull().references(() => users.id),
  bondType: text('bond_type').notNull(), // BondType enum
  formationMethod: text('formation_method').notNull(), // FormationMethod enum
  message: text('message'),
  publicKeyJwk: text('public_key_jwk'), // Initiator's public key (Phase 2C)
  status: text('status').default('pending'), // 'pending' | 'accepted' | 'rejected' | 'expired'
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
});

export const blockedUsers = sqliteTable('blocked_users', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedUserId: text('blocked_user_id').notNull(),
  blockedAt: integer('blocked_at', { mode: 'timestamp' }),
  reason: text('reason'),
});

// ============================================================
// COMMUNITIES
// ============================================================

export const tribes = sqliteTable('tribes', {
  id: text('id').primaryKey(),
  slug: text('slug').unique(),                      // URL-safe slug, e.g. 'moore-family'
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
  memberCount: integer('member_count').default(0),
  isPublic: integer('is_public', { mode: 'boolean' }).default(true),
  cover: text('cover'),
  coverPosition: text('cover_position'),           // CSS object-position, e.g. '50% 30%'
  dataAiHint: text('data_ai_hint'),
  homepageUrl: text('homepage_url'),
  joinMechanism: text('join_mechanism').default('instant'),
  minimumReputation: text('minimum_reputation'),
  minimumAccountAgeDays: integer('minimum_account_age_days'),
  createdBy: text('created_by').references(() => users.id),
  brandColor: text('brand_color'),                // Hex color for org branding (e.g. '#4F46E5')
  brandLogo: text('brand_logo'),                  // URL to org logo image
  inviteToken: text('invite_token').unique(),     // Random unguessable invite token
  bondDurationDays: integer('bond_duration_days'), // null = platform default (90 days); tribe owner can override
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

export const tribeMoodTags = sqliteTable('tribe_mood_tags', {
  tribeId: text('tribe_id').notNull().references(() => tribes.id, { onDelete: 'cascade' }),
  moodSlug: text('mood_slug').notNull(),
}, (table) => [
  primaryKey({ columns: [table.tribeId, table.moodSlug] }),
]);

export const tribeMembers = sqliteTable('tribe_members', {
  id: text('id').primaryKey(),
  tribeId: text('tribe_id').notNull().references(() => tribes.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').default('member'),
  tribeAssignedNickname: text('tribe_assigned_nickname'),
  joinedAsAlias: text('joined_as_alias'),
  joinedAsAvatar: text('joined_as_avatar'),
  reputationStatus: text('reputation_status'),
  joinedAt: integer('joined_at', { mode: 'timestamp' }),
});

export const pendingMembers = sqliteTable('pending_members', {
  id: text('id').primaryKey(),
  tribeId: text('tribe_id').notNull().references(() => tribes.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  joinedAsAlias: text('joined_as_alias'),
  joinedAsAvatar: text('joined_as_avatar'),
  requestedAt: integer('requested_at', { mode: 'timestamp' }),
});

// ============================================================
// CONTENT
// ============================================================

export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  tribeId: text('tribe_id').references(() => tribes.id, { onDelete: 'cascade' }), // Nullable: journal/bond-ring posts have no tribe
  authorId: text('author_id').notNull().references(() => users.id),
  authorName: text('author_name').notNull(),
  authorAvatar: text('author_avatar'),
  authorAvatarFallback: text('author_avatar_fallback').notNull().default('??'),
  title: text('title'),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  imageUrls: text('image_urls', { mode: 'json' }).$type<string[]>(),
  imageAlt: text('image_alt'),
  dataAiHintAvatar: text('data_ai_hint_avatar'),
  dataAiHintImage: text('data_ai_hint_image'),
  vibeCount: integer('vibe_count').default(0),
  commentCount: integer('comment_count').default(0),
  isRemoved: integer('is_removed', { mode: 'boolean' }).default(false),
  canBeReposted: integer('can_be_reposted', { mode: 'boolean' }).default(true),
  removalReason: text('removal_reason'),
  originalPostId: text('original_post_id'),
  isPinned: integer('is_pinned', { mode: 'boolean' }).default(false),
  moodVisibility: text('mood_visibility').default('public'), // 'public' | 'tribe_network' | 'members_only'

  // Concentric Rings — post scoping
  ring: text('ring').default('tribes'), // 'journal' | 'inner_circle' | 'my_people' | 'tribes'
  moodTag: text('mood_tag'),            // Primary mood slug (e.g. 'chill', 'kin') — for feed filtering
  pinnedToWall: integer('pinned_to_wall', { mode: 'boolean' }).default(false), // Journal → Wall promotion

  // E2E encryption (Phase 3)
  ciphertext: blob('ciphertext'),                                         // Encrypted post body (AES-256-GCM)
  isEncrypted: integer('is_encrypted', { mode: 'boolean' }).default(false), // True if content is encrypted
  encryptionIv: text('encryption_iv'),                                     // Base64-encoded IV

  editedAt: integer('edited_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

export const postMoodTags = sqliteTable('post_mood_tags', {
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  moodSlug: text('mood_slug').notNull(),
  promotedAt: integer('promoted_at', { mode: 'timestamp' }),
  promotedBy: text('promoted_by').references(() => users.id),
}, (table) => [
  primaryKey({ columns: [table.postId, table.moodSlug] }),
]);

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  parentCommentId: text('parent_comment_id'),
  authorId: text('author_id').notNull().references(() => users.id),
  authorName: text('author_name').notNull(),
  authorAvatar: text('author_avatar'),
  authorAvatarFallback: text('author_avatar_fallback').notNull().default('??'),
  dataAiHintAvatar: text('data_ai_hint_avatar'),
  content: text('content').notNull(),
  vibeCount: integer('vibe_count').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

// Per-recipient key grants for encrypted posts (sender key model)
export const postKeyGrants = sqliteTable('post_key_grants', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  recipientId: text('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bondId: text('bond_id').references(() => bonds.id, { onDelete: 'cascade' }),  // nullable for tribe group key grants
  wrappedKey: text('wrapped_key').notNull(),  // Base64: post key encrypted with recipient's shared secret (AES-GCM)
  wrapIv: text('wrap_iv').notNull(),          // Base64: IV used for the key wrapping
});

export const vibes = sqliteTable('vibes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  targetId: text('target_id').notNull(),
  targetType: text('target_type').notNull(), // 'post' | 'comment'
  emoji: text('emoji').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
}, (table) => [
  uniqueIndex('vibes_user_target_idx').on(table.userId, table.targetId, table.targetType),
]);

export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(),
  targetType: text('target_type').notNull().default('post'), // 'post' | 'comment'
  postId: text('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  commentId: text('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
  reporterId: text('reporter_id').references(() => users.id),
  reporterName: text('reporter_name').notNull(),
  reason: text('reason'),
  status: text('status').default('pending'),
  reportedAt: integer('reported_at', { mode: 'timestamp' }),
});

// ============================================================
// PERSONAL SPACE
// ============================================================

export const wallBlocks = sqliteTable('wall_blocks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  content: text('content').notNull(), // JSON blob
  sortOrder: integer('sort_order').default(0),
});

export const wallStyles = sqliteTable('wall_styles', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  backgroundColor: text('background_color').default('bg-background'),
  layout: text('layout').default('single-column'),
});

export const userPreferences = sqliteTable('user_preferences', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  selectedMoodSlugs: text('selected_mood_slugs'), // JSON array
});

// ============================================================
// DISCOVERY
// ============================================================

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  keywords: text('keywords'),
  description: text('description').notNull(),
  eventDate: integer('event_date', { mode: 'timestamp' }),
  associatedTribeId: text('associated_tribe_id').references(() => tribes.id),
  associatedTribeName: text('associated_tribe_name'), // Denormalized for display
  coverImage: text('cover_image'),
  dataAiHintCover: text('data_ai_hint_cover'),
  isPublic: integer('is_public', { mode: 'boolean' }).default(true),
  creatorId: text('creator_id').notNull().references(() => users.id),
  locationName: text('location_name'),
  locationCityRegion: text('location_city_region'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  rsvpPointsReward: integer('rsvp_points_reward').default(0), // Set by coordinator, capped by reputation
});

export const eventRsvps = sqliteTable('event_rsvps', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull(), // 'going' | 'interested' | 'not_going'
  reminderSentAt: integer('reminder_sent_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const eventStreamPosts = sqliteTable('event_stream_posts', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references(() => users.id),
  authorNickname: text('author_nickname').notNull(),
  authorAvatarFallback: text('author_avatar_fallback').notNull().default('??'),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  imageAlt: text('image_alt'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

export const stories = sqliteTable('stories', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  category: text('category').notNull(),
  curatorName: text('curator_name'),
  curatorAvatar: text('curator_avatar'),
  curatorAvatarFallback: text('curator_avatar_fallback'),
  dataAiHintCuratorAvatar: text('data_ai_hint_curator_avatar'),
  coverImage: text('cover_image'),
  dataAiHintCover: text('data_ai_hint_cover'),
  discussionCount: integer('discussion_count').default(0),
  lastUpdatedAt: integer('last_updated_at', { mode: 'timestamp' }),
});

export const storyArticles = sqliteTable('story_articles', {
  id: text('id').primaryKey(),
  storyId: text('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  url: text('url').notNull(),
  sourceName: text('source_name').notNull(),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  summarySnippet: text('summary_snippet'),
  dataAiHint: text('data_ai_hint'),
});

export const storyComments = sqliteTable('story_comments', {
  id: text('id').primaryKey(),
  storyId: text('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  parentCommentId: text('parent_comment_id'),
  authorId: text('author_id').notNull().references(() => users.id),
  authorName: text('author_name').notNull(),
  authorAvatarFallback: text('author_avatar_fallback').notNull().default('??'),
  dataAiHintAvatar: text('data_ai_hint_avatar'),
  content: text('content').notNull(),
  vibeCount: integer('vibe_count').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

// ============================================================
// MESSAGES (Schema ready — E2E encryption in Phase 3)
// ============================================================

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  bondId: text('bond_id').notNull().references(() => bonds.id, { onDelete: 'cascade' }),
  senderId: text('sender_id').notNull().references(() => users.id),
  ciphertext: blob('ciphertext'),
  plaintext: text('plaintext'),
  // Encrypted file attachment (Phase 2B)
  attachmentFileId: text('attachment_file_id'),       // References media_files.id
  attachmentName: text('attachment_name'),             // Original filename (encrypted in ciphertext if sensitive)
  attachmentType: text('attachment_type'),             // MIME type
  attachmentSize: integer('attachment_size'),          // Original file size in bytes
  attachmentEncryptionMeta: text('attachment_encryption_meta'), // JSON: EncryptionMeta for client-side decryption
  sentAt: integer('sent_at', { mode: 'timestamp' }),
  readAt: integer('read_at', { mode: 'timestamp' }),
});

// ============================================================
// NOTIFICATION PREFERENCES
// ============================================================

export const notificationPreferences = sqliteTable('notification_preferences', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  pushEnabled: integer('push_enabled', { mode: 'boolean' }).default(true),
  emailEnabled: integer('email_enabled', { mode: 'boolean' }).default(true),
  mentionsEnabled: integer('mentions_enabled', { mode: 'boolean' }).default(true),
  bondMessagesEnabled: integer('bond_messages_enabled', { mode: 'boolean' }).default(true),
  tribeActivityEnabled: integer('tribe_activity_enabled', { mode: 'boolean' }).default(true),
  eventRemindersEnabled: integer('event_reminders_enabled', { mode: 'boolean' }).default(true),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// ============================================================
// PUSH NOTIFICATIONS
// ============================================================

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  keysP256dh: text('keys_p256dh'),
  keysAuth: text('keys_auth'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ============================================================
// EMAIL VERIFICATION TOKENS
// ============================================================

export const emailVerificationTokens = sqliteTable('email_verification_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  type: text('type').notNull(), // 'verify_email' | 'passkey_recovery'
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  usedAt: integer('used_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ============================================================
// APP SETTINGS (Admin-configurable key-value store)
// ============================================================

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ============================================================
// USER BANS (Platform-level)
// ============================================================

export const userBans = sqliteTable('user_bans', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bannedBy: text('banned_by').notNull().references(() => users.id),
  reason: text('reason'),
  duration: text('duration').notNull(), // '1_day' | '7_days' | '30_days' | 'permanent'
  relatedPostId: text('related_post_id'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }), // null = permanent
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ============================================================
// MEDIA FILES (Storage Registry)
// ============================================================
//
// Tracks every uploaded file for:
//   1. User ownership & access control
//   2. Bucket routing (public CDN vs private signed URLs)
//   3. Client-side encryption metadata (E2E bonds)
//   4. Storage quota enforcement
//   5. GDPR purge & soft-delete lifecycle
//

export const mediaFiles = sqliteTable('media_files', {
  id: text('id').primaryKey(),                // UUID
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bucket: text('bucket').notNull(),           // 'public' | 'private'
  s3Key: text('s3_key').notNull(),            // Full S3 object key
  context: text('context').notNull(),         // UploadContext enum value
  fileName: text('file_name').notNull(),      // Original filename
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  encrypted: integer('encrypted', { mode: 'boolean' }).default(false),
  encryptionMeta: text('encryption_meta'),    // JSON: { algo, iv, salt } for E2E
  publicUrl: text('public_url'),              // CDN URL (public bucket only)
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }), // Soft delete
});

// ============================================================
// @MENTIONS
// ============================================================

export const mentions = sqliteTable('mentions', {
  id: text('id').primaryKey(),
  sourceType: text('source_type').notNull(), // 'post' | 'comment' | 'story_comment'
  sourceId: text('source_id').notNull(),
  mentionedUserId: text('mentioned_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mentionerUserId: text('mentioner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  read: integer('read', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ============================================================
// CO-OP VOTING (Phase 4A)
// ============================================================

export const proposals = sqliteTable('proposals', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('active'), // 'active' | 'closed' | 'canceled'
  tribeId: text('tribe_id').references(() => tribes.id, { onDelete: 'cascade' }), // null = platform-wide
  deadline: integer('deadline', { mode: 'timestamp' }).notNull(),
  voteCount: integer('vote_count').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const proposalOptions = sqliteTable('proposal_options', {
  id: text('id').primaryKey(),
  proposalId: text('proposal_id').notNull().references(() => proposals.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  voteCount: integer('vote_count').default(0),
  sortOrder: integer('sort_order').default(0),
});

export const votes = sqliteTable('votes', {
  id: text('id').primaryKey(),
  proposalId: text('proposal_id').notNull().references(() => proposals.id, { onDelete: 'cascade' }),
  optionId: text('option_id').notNull().references(() => proposalOptions.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ============================================================
// COMMERCE — STRIPE CONNECT (Phase 4B)
// ============================================================

/** Stripe Connect account linked to a tribe for receiving payments */
export const connectedAccounts = sqliteTable('connected_accounts', {
  id: text('id').primaryKey(),
  tribeId: text('tribe_id').notNull().references(() => tribes.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), // Owner who connected
  stripeAccountId: text('stripe_account_id').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'active' | 'restricted' | 'disabled'
  chargesEnabled: integer('charges_enabled', { mode: 'boolean' }).default(false),
  payoutsEnabled: integer('payouts_enabled', { mode: 'boolean' }).default(false),
  platformFeePercent: integer('platform_fee_percent').default(5), // Default 5% for Base
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

/** Records every payment transaction through the platform */
export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  tribeId: text('tribe_id').notNull().references(() => tribes.id, { onDelete: 'cascade' }),
  buyerId: text('buyer_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sellerId: text('seller_id').notNull().references(() => users.id, { onDelete: 'cascade' }), // Tribe owner
  amountCents: integer('amount_cents').notNull(),
  platformFeeCents: integer('platform_fee_cents').notNull(),
  sellerAmountCents: integer('seller_amount_cents').notNull(),
  currency: text('currency').notNull().default('usd'),
  description: text('description'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  stripeTransferId: text('stripe_transfer_id'),
  status: text('status').notNull().default('pending'), // 'pending' | 'completed' | 'failed' | 'refunded'
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});


