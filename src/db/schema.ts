import { sql } from 'drizzle-orm';
import { pgTable, text, integer, boolean, timestamp, doublePrecision, customType, jsonb, primaryKey, index, uniqueIndex } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer }>({ dataType() { return 'bytea'; } });

// ============================================================
// CORE IDENTITY
// ============================================================

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  role: text('role').notNull().default('Human_Free'),
  bio: text('bio'),
  avatar: text('avatar'),
  reservedAlias: text('reserved_alias').unique(),
  reservedAliasAvatar: text('reserved_alias_avatar'),
  reputationScore: integer('reputation_score').default(0),
  reputationStatus: text('reputation_status').default('Newcomer'),
  emailVerified: boolean('email_verified').default(false),
  totpSecret: text('totp_secret'),
  totpEnabled: boolean('totp_enabled').default(false),
  aiDataSharingEnabled: boolean('ai_data_sharing_enabled').default(true),
  isVerified: boolean('is_verified').default(false), // Org verified badge
  tosAcceptedVersion: text('tos_accepted_version'), // null = never accepted; triggers acceptance gate
  deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }), // null = active, set = pending deletion
  hasPiiAccess: boolean('has_pii_access').default(false), // Restricted dev/system flag for viewing full emails
  encryptionPublicKey: text('encryption_public_key'), // RSA-OAEP JWK (JSON string)
  ageConfirmedAt: timestamp('age_confirmed_at', { withTimezone: true }), // App Store compliance — records 13+ age confirmation
  // 18+ age verification (issue #32) — distinct from ageConfirmedAt (13+ self-confirm).
  // null = unverified. We store ONLY the pass/fail outcome + method; never a birthdate,
  // name, or credential. All v1 methods are high-assurance / cryptographically verifiable.
  ageVerifiedAt: timestamp('age_verified_at', { withTimezone: true }),
  ageVerificationMethod: text('age_verification_method'), // 'google_zkp' | 'apple_wallet_mdl' | 'apple_wallet_passport' | 'privately' | 'vendor'
  // Self-attested 18+ "show adult content" opt-in (issue #32). WEB-SET ONLY (Apple
  // Reddit-pattern: no in-app toggle). null = NSFW hidden everywhere. Holds no PII —
  // it's just the moment the user attested 18+ and chose to see adult content.
  showAdultContentAt: timestamp('show_adult_content_at', { withTimezone: true }),
  // Blur adult media by default (issue #32, Reddit pattern): ON unless the user opts
  // out. View preference only — no PII. true/null = blur NSFW media until revealed.
  blurAdultContent: boolean('blur_adult_content').default(true),
  slug: text('slug').unique(),
  username: text('username').unique(),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }),
});

export const userSlugRedirects = pgTable('user_slug_redirects', {
  id: text('id').primaryKey(),
  oldSlug: text('old_slug').notNull().unique(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (table) => [
  index('idx_user_slug_redirects_slug').on(table.oldSlug),
]);

export const userAliases = pgTable('user_aliases', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  alias: text('alias').notNull(),
  avatar: text('avatar'), // Generated SVG or custom image url
});

export const credentials = pgTable('credentials', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  publicKey: bytea('public_key').notNull(),
  counter: integer('counter').default(0),
  transports: text('transports'), // JSON array
  createdAt: timestamp('created_at', { withTimezone: true }),
}, (table) => [
  index('idx_credentials_user').on(table.userId)
]);

// DB-backed sessions for session revocation and subscription status tracking
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  revokedAt: timestamp('revoked_at', { withTimezone: true }), // null = active, set = revoked
  userAgent: text('user_agent'),
}, (table) => [
  index('idx_sessions_user').on(table.userId, table.expiresAt)
]);

export const oauthAccounts = pgTable('oauth_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // 'google', 'apple'
  providerAccountId: text('provider_account_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

export const vaultBackups = pgTable('vault_backups', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  encryptedVault: bytea('encrypted_vault').notNull(), // Encrypted JSON containing E2E keys
  salt: text('salt').notNull(), // Salt used for PBKDF2 stretching of recovery passphrase
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

export const keyVaults = pgTable('key_vaults', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  credentialId: text('credential_id'),       // WebAuthn credential ID (NULL for passphrase vaults)
  vaultType: text('vault_type').notNull(),    // 'prf' | 'passphrase'
  encryptedVault: bytea('encrypted_vault').notNull(),
  salt: text('salt').notNull(),               // HKDF salt (PRF) or PBKDF2 salt (passphrase)
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (table) => [
  // NOTE: SQLite treats NULL != NULL, so this index does NOT enforce uniqueness across
  // passphrase vaults (where credentialId IS NULL). The service-layer "delete before insert"
  // pattern in key-vault-service.ts compensates for this intentionally.
  index, uniqueIndex('key_vaults_user_credential_idx').on(table.userId, table.credentialId),
]);

// ============================================================
// SUBSCRIPTION & BILLING (Phase 3)
// ============================================================

export const plans = pgTable('plans', {
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

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planId: text('plan_id').notNull().references(() => plans.id),
  status: text('status').notNull(),         // 'active', 'past_due', 'canceled', 'trialing', 'incomplete'
  source: text('source').notNull().default('paid'), // 'paid' | 'founding' | 'earned'
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (table) => [
  index('idx_subscriptions_user').on(table.userId),
  index('idx_subscriptions_stripe').on(table.stripeSubscriptionId)
]);

export const inviteCodes = pgTable('invite_codes', {
  id: text('id').primaryKey(),              // The code itself, format: TRIBE-XXXX-XXXX
  type: text('type', { enum: ['founding', 'referral'] }).notNull().default('referral'), // 'founding' = admin grants paid plan; 'referral' = user shares free access
  createdBy: text('created_by').references(() => users.id),
  grantsPlanId: text('grants_plan_id').notNull().references(() => plans.id), // Which plan this code unlocks
  maxUses: integer('max_uses').default(1),
  usedCount: integer('used_count').default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

export const inviteRedemptions = pgTable('invite_redemptions', {
  id: text('id').primaryKey(),
  inviteCodeId: text('invite_code_id').notNull().references(() => inviteCodes.id),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }).default(sql`NOW()`),
});

export const contributions = pgTable('contributions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),             // 'post', 'moderation', 'referral', 'bug_report', 'event_hosted'
  referenceId: text('reference_id'),        // ID of the post/report/etc
  points: integer('points').notNull(),      // Contribution points awarded
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// ============================================================
// BONDS (Cryptographic Key-Pair Relationships)
// ============================================================

export const bonds = pgTable('bonds', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetId: text('target_id').notNull(),
  targetType: text('target_type').notNull(), // 'user' | 'tribe'
  targetName: text('target_name').notNull(),
  bondType: text('bond_type').notNull(), // BondType enum
  formationMethod: text('formation_method').notNull(), // FormationMethod enum
  passkeyStatus: text('passkey_status').default('active'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
  reconnectsCount: integer('reconnects_count').default(0),

  // Identity layer
  pseudonym: text('pseudonym'),
  targetPseudonymForMe: text('target_pseudonym_for_me'),
  tribeAssignedNickname: text('tribe_assigned_nickname'),
  displayPreference: text('display_preference'),
  nicknameVibe: text('nickname_vibe'),
  isNicknameReported: boolean('is_nickname_reported').default(false),

  // Intercom preferences
  showInIntercom: boolean('show_in_intercom').default(true),
  allowChatInitiation: boolean('allow_chat_initiation').default(false),

  // Concentric Rings — trust level (PRIVATE: never exposed to other users)
  innerCircle: boolean('inner_circle').default(false),

  // Event bond fields
  keyType: text('key_type').default('standard'),
  eventId: text('event_id'),
  accessTier: text('access_tier'),

  // Cryptographic layer (Phase 2B)
  publicKeyJwk: text('public_key_jwk'), // JWK-exported public key for this side of the bond

  // Connection vibe (Organic engagement)
  connectionScore: integer('connection_score').default(0),
  lastInteractedAt: timestamp('last_interacted_at', { withTimezone: true }),
  dailyScoreAdded: integer('daily_score_added').default(0),

  // Dormant/reconnect state
  dormantAt: timestamp('dormant_at', { withTimezone: true }),           // When bond went dormant
  reconnectRequestedAt: timestamp('reconnect_requested_at', { withTimezone: true }),
  reconnectRequestedBy: text('reconnect_requested_by'),               // userId who requested reconnect
}, (table) => [
  index('idx_bonds_user_target').on(table.userId, table.targetType),
  index('idx_bonds_target_user').on(table.targetId, table.userId)
]);

export const bondKeyHistory = pgTable('bond_key_history', {
  id: text('id').primaryKey(),
  bondId: text('bond_id').notNull().references(() => bonds.id, { onDelete: 'cascade' }),
  publicKeyJwk: text('public_key_jwk').notNull(),
  keyHash: text('key_hash').notNull(),
  rotatedAt: timestamp('rotated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  index('idx_bond_key_history_bond_id').on(table.bondId),
  index('idx_bond_key_history_key_hash').on(table.keyHash),
]);

export const bondRequests = pgTable('bond_requests', {
  id: text('id').primaryKey(),
  fromUserId: text('from_user_id').notNull().references(() => users.id),
  toUserId: text('to_user_id').notNull().references(() => users.id),
  bondType: text('bond_type').notNull(), // BondType enum
  formationMethod: text('formation_method').notNull(), // FormationMethod enum
  message: text('message'),
  publicKeyJwk: text('public_key_jwk'), // Initiator's public key (Phase 2C)
  status: text('status').default('pending'), // 'pending' | 'accepted' | 'rejected' | 'expired'
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

export const blockedUsers = pgTable('blocked_users', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedUserId: text('blocked_user_id').notNull(),
  blockedAt: timestamp('blocked_at', { withTimezone: true }),
  reason: text('reason'),
}, (table) => [
  index('idx_blocked_users_user').on(table.userId)
]);

// ============================================================
// COMMUNITIES
// ============================================================

export const tribes = pgTable('tribes', {
  id: text('id').primaryKey(),
  slug: text('slug').unique(),                      // URL-safe slug, e.g. 'moore-family'
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
  memberCount: integer('member_count').default(0),
  isPublic: boolean('is_public').default(true),
  // NSFW flag (issue #119). Immutable once true. When true, the tribe is
  // permanently forced to isPublic=false (E2EE, zero-knowledge) per NSFW policy §3.
  isNsfw: boolean('is_nsfw').default(false),
  // Discoverability of the tribe LISTING (not its content). Decoupled from isPublic:
  // - public tribes are discoverable via isPublic; isListed stays false for them.
  // - regular private tribes default unlisted (isListed=false) — hidden from search/feed.
  // - NSFW tribes (always private) default LISTED (isListed=true) but founders may unlist.
  // A listed private tribe exposes only its metadata (name/desc/flag) for discovery + join;
  // post content remains members-only (policy §2: flagged to outsiders, zero content leaks).
  isListed: boolean('is_listed').default(false),
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
  createdAt: timestamp('created_at', { withTimezone: true }),
});

// Temporary redirects from old tribe slugs after a solo-founder rename.
// Expire after a configurable TTL (default 90 days), releasing the slug for reuse.
export const tribeSlugRedirects = pgTable('tribe_slug_redirects', {
  id: text('id').primaryKey(),
  oldSlug: text('old_slug').notNull().unique(),  // The slug that was replaced
  tribeId: text('tribe_id').notNull().references(() => tribes.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  index('idx_slug_redirects_slug').on(table.oldSlug),
]);

export const tribeMoodTags = pgTable('tribe_mood_tags', {
  tribeId: text('tribe_id').notNull().references(() => tribes.id, { onDelete: 'cascade' }),
  moodSlug: text('mood_slug').notNull(),
}, (table) => [
  primaryKey({ columns: [table.tribeId, table.moodSlug] }),
]);

export const tribeMembers = pgTable('tribe_members', {
  id: text('id').primaryKey(),
  tribeId: text('tribe_id').notNull().references(() => tribes.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').default('member'),
  tribeAssignedNickname: text('tribe_assigned_nickname'),
  joinedAsAlias: text('joined_as_alias'),
  joinedAsAvatar: text('joined_as_avatar'),
  reputationStatus: text('reputation_status'),
  joinedAt: timestamp('joined_at', { withTimezone: true }),
}, (table) => [
  index('idx_tribe_members_user').on(table.userId, table.tribeId),
  index('idx_tribe_members_tribe').on(table.tribeId, table.role)
]);

export const pendingMembers = pgTable('pending_members', {
  id: text('id').primaryKey(),
  tribeId: text('tribe_id').notNull().references(() => tribes.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  joinedAsAlias: text('joined_as_alias'),
  joinedAsAvatar: text('joined_as_avatar'),
  requestedAt: timestamp('requested_at', { withTimezone: true }),
});

// ============================================================
// CONTENT
// ============================================================

export const posts = pgTable('posts', {
  id: text('id').primaryKey(),
  slug: text('slug'),
  tribeId: text('tribe_id').references(() => tribes.id, { onDelete: 'cascade' }), // Nullable: journal/bond-ring posts have no tribe
  authorId: text('author_id').notNull().references(() => users.id),
  authorName: text('author_name').notNull(),
  authorAvatar: text('author_avatar'),
  authorAvatarFallback: text('author_avatar_fallback').notNull().default('??'),
  title: text('title'),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  imageUrls: jsonb('image_urls').$type<string[]>(),
  imageAlt: text('image_alt'),
  dataAiHintAvatar: text('data_ai_hint_avatar'),
  dataAiHintImage: text('data_ai_hint_image'),
  vibeCount: integer('vibe_count').default(0),
  commentCount: integer('comment_count').default(0),
  isRemoved: boolean('is_removed').default(false),
  canBeReposted: boolean('can_be_reposted').default(true),
  removalReason: text('removal_reason'),
  originalPostId: text('original_post_id'),
  isPinned: boolean('is_pinned').default(false),
  moodVisibility: text('mood_visibility').default('public'), // 'public' | 'tribe_network' | 'members_only'

  // Concentric Rings — post scoping
  ring: text('ring').default('tribes'), // 'journal' | 'inner_circle' | 'my_people' | 'tribes'
  moodTag: text('mood_tag'),            // Primary mood slug (e.g. 'chill', 'kin') — for feed filtering
  pinnedToWall: boolean('pinned_to_wall').default(false), // Journal → Wall promotion

  // E2E encryption (Phase 3)
  ciphertext: bytea('ciphertext'),                                         // Encrypted post body (AES-256-GCM)
  isEncrypted: boolean('is_encrypted').default(false), // True if content is encrypted
  encryptionIv: text('encryption_iv'),                                     // Base64-encoded IV

  // Link preview metadata (unfurled at compose time)
  linkUrl: text('link_url'),                 // The canonical URL being previewed
  linkTitle: text('link_title'),             // OG title
  linkDescription: text('link_description'), // OG description (truncated)
  linkImage: text('link_image'),             // OG image URL (proxied through S3)
  linkSiteName: text('link_site_name'),      // Site name (e.g., "YouTube", "GitHub")

  editedAt: timestamp('edited_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }),
  slugEditedBy: text('slug_edited_by').references(() => users.id),
}, (table) => [
  index('idx_posts_ring_author').on(table.ring, table.authorId),
  index('idx_posts_tribe_ring').on(table.tribeId, table.ring),
  index('idx_posts_author_created').on(table.authorId, table.createdAt),
  index('idx_posts_wall').on(table.authorId, table.pinnedToWall),
  index('idx_posts_slug').on(table.tribeId, table.slug),
  uniqueIndex('posts_tribe_slug_unique').on(table.tribeId, table.slug).where(sql`tribe_id IS NOT NULL`),
  uniqueIndex('posts_standalone_slug_unique').on(table.slug).where(sql`tribe_id IS NULL`),
]);

export const postSlugRedirects = pgTable('post_slug_redirects', {
  id: text('id').primaryKey(),
  oldSlug: text('old_slug').notNull(),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  tribeId: text('tribe_id').references(() => tribes.id, { onDelete: 'cascade' }), // NULL = standalone scope
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
}, (table) => [
  index('idx_post_slug_redirects_slug').on(table.oldSlug),
  uniqueIndex('idx_post_slug_redirects_standalone').on(table.oldSlug).where(sql`tribe_id IS NULL`),
  uniqueIndex('idx_post_slug_redirects_tribe').on(table.tribeId, table.oldSlug).where(sql`tribe_id IS NOT NULL`),
]);

export const postMoodTags = pgTable('post_mood_tags', {
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  moodSlug: text('mood_slug').notNull(),
  promotedAt: timestamp('promoted_at', { withTimezone: true }),
  promotedBy: text('promoted_by').references(() => users.id),
}, (table) => [
  index('idx_post_mood_tags_mood').on(table.moodSlug, table.promotedAt),
  index('idx_post_mood_tags_post').on(table.postId),
  primaryKey({ columns: [table.postId, table.moodSlug] }),
]);

export const comments = pgTable('comments', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  parentCommentId: text('parent_comment_id'),
  authorId: text('author_id').notNull().references(() => users.id),
  authorName: text('author_name').notNull(),
  authorAvatar: text('author_avatar'),
  authorAvatarFallback: text('author_avatar_fallback').notNull().default('??'),
  dataAiHintAvatar: text('data_ai_hint_avatar'),
  content: text('content').notNull(),
  // E2E encryption (matches posts table pattern)
  ciphertext: bytea('ciphertext'),                     // Encrypted comment body (AES-256-GCM)
  isEncrypted: boolean('is_encrypted').default(false),  // True if content is encrypted
  encryptionIv: text('encryption_iv'),                  // Base64-encoded IV
  vibeCount: integer('vibe_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }),
}, (table) => [
  index('idx_comments_post').on(table.postId, table.createdAt)
]);

// Per-recipient key grants for encrypted posts (sender key model)
export const postKeyGrants = pgTable('post_key_grants', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  recipientId: text('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bondId: text('bond_id').references(() => bonds.id, { onDelete: 'cascade' }),  // nullable for tribe group key grants
  wrappedKey: text('wrapped_key').notNull(),  // Base64: post key encrypted with recipient's shared secret (AES-GCM)
  wrapIv: text('wrap_iv').notNull(),          // Base64: IV used for the key wrapping
});

// ============================================================
// TRIBE GROUP ENCRYPTION (E2E — Sender Key Model v2)
// ============================================================

/**
 * Symmetric group keys for private tribe encryption.
 * Each private tribe has exactly ONE active key at any time.
 * Keys are rotated (new version created, old deactivated) when members leave.
 */
export const tribeKeys = pgTable('tribe_keys', {
  id: text('id').primaryKey(),
  tribeId: text('tribe_id').notNull().references(() => tribes.id, { onDelete: 'cascade' }),
  keyVersion: integer('key_version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  rotatedAt: timestamp('rotated_at', { withTimezone: true }),
}, (table) => [
  index('idx_tribe_keys_tribe').on(table.tribeId, table.isActive),
]);

/**
 * Per-member wrapped copies of a tribe's group key.
 * The tribe key is encrypted (wrapped) using the recipient's RSA-OAEP
 * identity public key, so only the recipient can unwrap it with their
 * corresponding private key.
 *
 * When a key admin comes online, they issue grants for any new members
 * who don't yet have one.
 */
export const tribeKeyGrants = pgTable('tribe_key_grants', {
  id: text('id').primaryKey(),
  tribeKeyId: text('tribe_key_id').notNull().references(() => tribeKeys.id, { onDelete: 'cascade' }),
  recipientId: text('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  wrappedKey: text('wrapped_key').notNull(),    // Base64: tribe key encrypted with recipient's RSA public key
  wrapIv: text('wrap_iv').notNull(),            // Base64: IV for the wrapping
  grantedBy: text('granted_by').notNull().references(() => users.id),
  grantedAt: timestamp('granted_at', { withTimezone: true }).default(sql`NOW()`),
  deviceKeyId: text('device_key_id').references(() => userDeviceKeys.id, { onDelete: 'set null' }), // Per-device key grant targeting
}, (table) => [
  index('idx_tribe_key_grants_recipient').on(table.recipientId, table.tribeKeyId),
  index('idx_tribe_key_grants_key').on(table.tribeKeyId),
  index('idx_tribe_key_grants_device').on(table.deviceKeyId),
]);

export const vibes = pgTable('vibes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  targetId: text('target_id').notNull(),
  targetType: text('target_type').notNull(), // 'post' | 'comment'
  emoji: text('emoji').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }),
}, (table) => [
  index('idx_vibes_target').on(table.targetId, table.targetType),
  uniqueIndex('vibes_user_target_idx').on(table.userId, table.targetId, table.targetType)
]);

export const reports = pgTable('reports', {
  id: text('id').primaryKey(),
  targetType: text('target_type').notNull().default('post'), // 'post' | 'comment'
  postId: text('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  commentId: text('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
  reporterId: text('reporter_id').references(() => users.id),
  reporterName: text('reporter_name').notNull(),
  reason: text('reason'),
  status: text('status').default('pending'),
  reportedAt: timestamp('reported_at', { withTimezone: true }),
});

export const nciiReports = pgTable('ncii_reports', {
  id: text('id').primaryKey(),                    // UUID
  trackingNumber: text('tracking_number').notNull().unique(), // Human-readable: 'NCII-2026-00001'

  // Requester info (may not be a platform user)
  requesterName: text('requester_name').notNull(),
  requesterEmail: text('requester_email').notNull(),
  requesterSignature: text('requester_signature').notNull(), // Electronic signature (typed name attestation)
  isDepictedPerson: boolean('is_depicted_person').default(true), // vs authorized representative

  // Content identification
  contentDescription: text('content_description').notNull(),
  contentUrls: text('content_urls'),              // JSON array of URLs/locations on platform
  posterUsername: text('poster_username'),         // Username of who posted it
  searchTerms: text('search_terms'),              // Search terms that surface the content
  contentType: text('content_type').notNull(),    // 'authentic_ncii' | 'deepfake' | 'minor'

  // Linked platform content (if identified)
  linkedPostIds: text('linked_post_ids'),         // JSON array of post IDs matched

  // Non-consent attestation
  nonConsentStatement: boolean('non_consent_statement').notNull(), // Checkbox attestation

  // Status & SLA
  status: text('status').notNull().default('pending'),  // 'pending' | 'in_review' | 'removed' | 'rejected' | 'requires_info'
  slaDeadline: timestamp('sla_deadline', { withTimezone: true }).notNull(), // reportedAt + 48h

  // Action tracking
  reviewedBy: text('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  actionTaken: text('action_taken'),              // 'content_removed' | 'content_not_found' | 'insufficient_info' | 'not_ncii'
  actionNotes: text('action_notes'),

  // Hash storage (for re-upload prevention)
  pdqHashesStored: boolean('pdq_hashes_stored').default(false),

  // Envelope encryption columns
  encryptedPayload: text('encrypted_payload'),   // Base64 AES-256-GCM ciphertext of PII fields
  encryptionIv: text('encryption_iv'),           // Base64 IV for the AES key

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (table) => [
  index('idx_ncii_reports_tracking').on(table.trackingNumber),
  index('idx_ncii_reports_status').on(table.status, table.slaDeadline),
  index('idx_ncii_reports_email').on(table.requesterEmail),
]);

export const nciiHashBlocklist = pgTable('ncii_hash_blocklist', {
  id: text('id').primaryKey(),
  pdqHash: text('pdq_hash').notNull(),            // 64-char hex PDQ hash
  sourceReportId: text('source_report_id').references(() => nciiReports.id),
  sourcePostId: text('source_post_id'),           // Original post that was removed
  addedBy: text('added_by').references(() => users.id), // Admin who added it
  addedAt: timestamp('added_at', { withTimezone: true }).default(sql`NOW()`),
  status: text('status').notNull().default('confirmed'), // 'auto_blocked' | 'confirmed'
}, (table) => [
  index('idx_ncii_blocklist_hash').on(table.pdqHash),
]);

export const nciiReportKeyGrants = pgTable('ncii_report_key_grants', {
  id: text('id').primaryKey(),
  reportId: text('report_id').notNull().references(() => nciiReports.id, { onDelete: 'cascade' }),
  adminId: text('admin_id').notNull().references(() => users.id),
  wrappedKey: text('wrapped_key').notNull(),   // Base64: AES key encrypted with admin's RSA public key
  wrapIv: text('wrap_iv').notNull(),           // Base64: IV for the RSA wrapping
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
}, (table) => [
  index('idx_ncii_key_grants_report').on(table.reportId),
  index('idx_ncii_key_grants_admin').on(table.adminId),
]);


// ============================================================
// PERSONAL SPACE
// ============================================================

export const wallBlocks = pgTable('wall_blocks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  content: text('content').notNull(), // JSON blob
  sortOrder: integer('sort_order').default(0),
});

export const wallStyles = pgTable('wall_styles', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  backgroundColor: text('background_color').default('bg-background'),
  layout: text('layout').default('single-column'),
  nowPlayingUrl: text('now_playing_url'),
});

export const userPreferences = pgTable('user_preferences', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  selectedMoodSlugs: text('selected_mood_slugs'), // JSON array
});

// ============================================================
// DISCOVERY
// ============================================================

export const events = pgTable('events', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  keywords: text('keywords'),
  description: text('description').notNull(),
  eventDate: timestamp('event_date', { withTimezone: true }),
  associatedTribeId: text('associated_tribe_id').references(() => tribes.id),
  associatedTribeName: text('associated_tribe_name'), // Denormalized for display
  coverImage: text('cover_image'),
  dataAiHintCover: text('data_ai_hint_cover'),
  isPublic: boolean('is_public').default(true),
  creatorId: text('creator_id').notNull().references(() => users.id),
  locationName: text('location_name'),
  locationCityRegion: text('location_city_region'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  rsvpPointsReward: integer('rsvp_points_reward').default(0), // Set by coordinator, capped by reputation
  slug: text('slug').unique(),
});

export const eventSlugRedirects = pgTable('event_slug_redirects', {
  id: text('id').primaryKey(),
  oldSlug: text('old_slug').notNull().unique(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (table) => [
  index('idx_event_slug_redirects_slug').on(table.oldSlug),
]);

export const eventRsvps = pgTable('event_rsvps', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull(), // 'going' | 'interested' | 'not_going'
  reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

export const eventStreamPosts = pgTable('event_stream_posts', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references(() => users.id),
  authorNickname: text('author_nickname').notNull(),
  authorAvatarFallback: text('author_avatar_fallback').notNull().default('??'),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  imageAlt: text('image_alt'),
  createdAt: timestamp('created_at', { withTimezone: true }),
});

export const stories = pgTable('stories', {
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
  lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true }),
});

export const storyArticles = pgTable('story_articles', {
  id: text('id').primaryKey(),
  storyId: text('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  url: text('url').notNull(),
  sourceName: text('source_name').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  summarySnippet: text('summary_snippet'),
  dataAiHint: text('data_ai_hint'),
});

export const storyComments = pgTable('story_comments', {
  id: text('id').primaryKey(),
  storyId: text('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  parentCommentId: text('parent_comment_id'),
  authorId: text('author_id').notNull().references(() => users.id),
  authorName: text('author_name').notNull(),
  authorAvatarFallback: text('author_avatar_fallback').notNull().default('??'),
  dataAiHintAvatar: text('data_ai_hint_avatar'),
  content: text('content').notNull(),
  vibeCount: integer('vibe_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }),
});

// ============================================================
// MESSAGES (Schema ready — E2E encryption in Phase 3)
// ============================================================

export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  bondId: text('bond_id').notNull().references(() => bonds.id, { onDelete: 'cascade' }),
  senderId: text('sender_id').notNull().references(() => users.id),
  ciphertext: bytea('ciphertext'),
  plaintext: text('plaintext'),
  // Encrypted file attachment (Phase 2B)
  attachmentFileId: text('attachment_file_id'),       // References media_files.id
  attachmentName: text('attachment_name'),             // Original filename (encrypted in ciphertext if sensitive)
  attachmentType: text('attachment_type'),             // MIME type
  attachmentSize: integer('attachment_size'),          // Original file size in bytes
  attachmentEncryptionMeta: text('attachment_encryption_meta'), // JSON: EncryptionMeta for client-side decryption
  // Soft self-reference to messages.id — no FK so replies survive deletion of the original
  replyToId: text('reply_to_id'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  // readAt = read receipt SHARED with the sender (drives their ✓✓ ticks).
  // Only set when the recipient has read receipts enabled.
  readAt: timestamp('read_at', { withTimezone: true }),
  // seenAt = recipient has locally viewed the message (drives THEIR own unread
  // badge). Always set on view, regardless of the read-receipt preference, so
  // turning off read receipts never leaves a stuck unread badge.
  seenAt: timestamp('seen_at', { withTimezone: true }),
  // editedAt = last time the sender edited the message (re-encrypted ciphertext).
  editedAt: timestamp('edited_at', { withTimezone: true }),
  // deletedAt = soft-delete tombstone. Content is cleared but the row remains
  // so reply references stay intact.
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('idx_messages_bond').on(table.bondId, table.sentAt),
  index('idx_messages_sender').on(table.senderId)
]);

export const messageReactions = pgTable('message_reactions', {
  id: text('id').primaryKey(),
  messageId: text('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  emoji: text('emoji').notNull(), // raw emoji string, e.g. '❤️'
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
}, (table) => [
  index('idx_message_reactions_message').on(table.messageId),
  uniqueIndex('idx_message_reactions_user_message').on(table.userId, table.messageId),
]);

// ============================================================
// NOTIFICATION PREFERENCES
// ============================================================

export const notificationPreferences = pgTable('notification_preferences', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  pushEnabled: boolean('push_enabled').default(true),
  emailEnabled: boolean('email_enabled').default(true),
  mentionsEnabled: boolean('mentions_enabled').default(true),
  bondMessagesEnabled: boolean('bond_messages_enabled').default(true),
  tribeActivityEnabled: boolean('tribe_activity_enabled').default(true),
  eventRemindersEnabled: boolean('event_reminders_enabled').default(true),
  governanceEnabled: boolean('governance_enabled').default(true),
  readReceiptsEnabled: boolean('read_receipts_enabled').default(true),
  typingIndicatorsEnabled: boolean('typing_indicators_enabled').default(true),
  lastActivityViewedAt: timestamp('last_activity_viewed_at', { withTimezone: true }),
  readActivityIds: jsonb('read_activity_ids').$type<string[]>().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

// ============================================================
// PUSH NOTIFICATIONS
// ============================================================

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  keysP256dh: text('keys_p256dh'),
  keysAuth: text('keys_auth'),
  platform: text('platform').default('web'),
  /**
   * APNs sandbox routing flag (iOS only).
   * ⚠️ DO NOT REMOVE THIS COLUMN — it controls which Apple Push gateway receives
   * notifications for each iOS device. TestFlight/dev builds use the APNs sandbox
   * gateway; App Store builds use the production gateway. Removing this causes
   * TestFlight push notifications to silently fail with BadDeviceToken errors.
   *
   * Set at registration time by the client: true = sandbox (dev/TestFlight),
   * false = production (App Store). Null for non-iOS platforms.
   */
  apnsSandbox: boolean('apns_sandbox').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// ============================================================
// USER DEVICE KEYS (Multi-device E2E key management)
// ============================================================

/**
 * Tracks per-device public keys for multi-device E2E encryption.
 * Each device registers its own key pair; tribe key grants can
 * target a specific device key so all of a user's devices can
 * independently decrypt tribe content.
 */
export const userDeviceKeys = pgTable('user_device_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  deviceLabel: text('device_label').notNull(),       // Human-readable (e.g. "Pixel 9", "MacBook Pro")
  publicKey: text('public_key').notNull(),            // JWK-exported public key
  keyFingerprint: text('key_fingerprint').notNull(),  // SHA-256 hash of publicKey for dedup
  isActive: boolean('is_active').notNull().default(true),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).default(sql`NOW()`),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
}, (table) => [
  index('idx_udk_user').on(table.userId, table.isActive),
  uniqueIndex('idx_udk_fingerprint').on(table.userId, table.keyFingerprint),
]);

// ============================================================
// EMAIL VERIFICATION TOKENS
// ============================================================

export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  type: text('type').notNull(), // 'verify_email' | 'passkey_recovery'
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// ============================================================
// APP SETTINGS (Admin-configurable key-value store)
// ============================================================

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
});

// ============================================================
// USER BANS (Platform-level)
// ============================================================

export const userBans = pgTable('user_bans', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bannedBy: text('banned_by').notNull().references(() => users.id),
  reason: text('reason'),
  duration: text('duration').notNull(), // '1_day' | '7_days' | '30_days' | 'permanent'
  relatedPostId: text('related_post_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }), // null = permanent
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// ============================================================
// ADMIN AUDIT LOGS
// ============================================================

export const adminAuditLogs = pgTable('admin_audit_logs', {
  id: text('id').primaryKey(),
  adminId: text('admin_id').notNull().references(() => users.id),
  action: text('action').notNull(), // 'role_change' | 'ban_issued' | 'ban_revoked' | 'user_deleted'
  targetUserId: text('target_user_id').notNull().references(() => users.id),
  details: text('details'), // JSON string with more info
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
}, (table) => [
  index('idx_admin_audit_logs_target').on(table.targetUserId),
  index('idx_admin_audit_logs_admin').on(table.adminId)
]);

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

export const mediaFiles = pgTable('media_files', {
  id: text('id').primaryKey(),                // UUID
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bucket: text('bucket').notNull(),           // 'public' | 'private'
  s3Key: text('s3_key').notNull(),            // Full S3 object key
  context: text('context').notNull(),         // UploadContext enum value
  fileName: text('file_name').notNull(),      // Original filename
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  encrypted: boolean('encrypted').default(false),
  encryptionMeta: text('encryption_meta'),    // JSON: { algo, iv, salt } for E2E
  publicUrl: text('public_url'),              // CDN URL (public bucket only)
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  deletedAt: timestamp('deleted_at', { withTimezone: true }), // Soft delete
}, (table) => [
  index('idx_media_files_user').on(table.userId, table.createdAt)
]);

// ============================================================
// @MENTIONS
// ============================================================

export const mentions = pgTable('mentions', {
  id: text('id').primaryKey(),
  sourceType: text('source_type').notNull(), // 'post' | 'comment' | 'story_comment'
  sourceId: text('source_id').notNull(),
  mentionedUserId: text('mentioned_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mentionerUserId: text('mentioner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  read: boolean('read').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
}, (table) => [
  index('idx_mentions_user').on(table.mentionedUserId, table.read)
]);

// ============================================================
// CO-OP VOTING (Phase 4A)
// ============================================================

export const proposals = pgTable('proposals', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('active'), // 'active' | 'closed' | 'canceled'
  tribeId: text('tribe_id').references(() => tribes.id, { onDelete: 'cascade' }), // null = platform-wide
  deadline: timestamp('deadline', { withTimezone: true }).notNull(),
  voteCount: integer('vote_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  slug: text('slug').unique(),
});

export const proposalSlugRedirects = pgTable('proposal_slug_redirects', {
  id: text('id').primaryKey(),
  oldSlug: text('old_slug').notNull().unique(),
  proposalId: text('proposal_id').notNull().references(() => proposals.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (table) => [
  index('idx_proposal_slug_redirects_slug').on(table.oldSlug),
]);

export const proposalOptions = pgTable('proposal_options', {
  id: text('id').primaryKey(),
  proposalId: text('proposal_id').notNull().references(() => proposals.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  voteCount: integer('vote_count').default(0),
  sortOrder: integer('sort_order').default(0),
});

export const votes = pgTable('votes', {
  id: text('id').primaryKey(),
  proposalId: text('proposal_id').notNull().references(() => proposals.id, { onDelete: 'cascade' }),
  optionId: text('option_id').notNull().references(() => proposalOptions.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
}, (table) => [
  uniqueIndex('votes_user_proposal_idx').on(table.userId, table.proposalId),
]);

/**
 * Discussion comments on proposals.
 * Reuses the same tree model as post comments (parentCommentId for nesting).
 */
export const proposalComments = pgTable('proposal_comments', {
  id: text('id').primaryKey(),
  proposalId: text('proposal_id').notNull().references(() => proposals.id, { onDelete: 'cascade' }),
  parentCommentId: text('parent_comment_id'), // null = root-level comment
  authorId: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  authorName: text('author_name').notNull(),
  authorAvatar: text('author_avatar'),
  authorAvatarFallback: text('author_avatar_fallback').notNull().default('??'),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
}, (table) => [
  index('idx_proposal_comments_proposal').on(table.proposalId, table.createdAt),
]);

/**
 * Reactions on proposal comments.
 * Only three choices: 👍 (agree), 😐 (neutral), 👎 (disagree).
 * One reaction per user per comment (unique constraint enforced).
 */
export const proposalCommentReactions = pgTable('proposal_comment_reactions', {
  id: text('id').primaryKey(),
  commentId: text('comment_id').notNull().references(() => proposalComments.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reaction: text('reaction').notNull(), // '👍' | '👊' | '👎'
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
}, (table) => [
  index('idx_proposal_comment_reactions_comment').on(table.commentId),
  uniqueIndex('proposal_comment_reactions_user_comment_idx').on(table.userId, table.commentId),
]);

// ============================================================
// COMMERCE — STRIPE CONNECT (Phase 4B)
// ============================================================

/** Stripe Connect account linked to a tribe for receiving payments */
export const connectedAccounts = pgTable('connected_accounts', {
  id: text('id').primaryKey(),
  tribeId: text('tribe_id').notNull().references(() => tribes.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), // Owner who connected
  stripeAccountId: text('stripe_account_id').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'active' | 'restricted' | 'disabled'
  chargesEnabled: boolean('charges_enabled').default(false),
  payoutsEnabled: boolean('payouts_enabled').default(false),
  platformFeePercent: integer('platform_fee_percent').default(5), // Default 5% for Base
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// ============================================================
// USER FAVORITES (sidebar pins)
// ============================================================

export const userFavorites = pgTable('user_favorites', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetType: text('target_type').notNull(), // 'bond' | 'tribe'
  targetId: text('target_id').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
}, (table) => [
  uniqueIndex('idx_user_favorites_unique').on(table.userId, table.targetType, table.targetId),
  index('idx_user_favorites_user').on(table.userId, table.sortOrder),
]);

/** Records every payment transaction through the platform */
export const transactions = pgTable('transactions', {
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
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});


