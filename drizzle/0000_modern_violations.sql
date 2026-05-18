CREATE TABLE "admin_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"action" text NOT NULL,
	"target_user_id" text NOT NULL,
	"details" text,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "blocked_users" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"blocked_user_id" text NOT NULL,
	"blocked_at" timestamp with time zone,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "bond_key_history" (
	"id" text PRIMARY KEY NOT NULL,
	"bond_id" text NOT NULL,
	"public_key_jwk" text NOT NULL,
	"key_hash" text NOT NULL,
	"rotated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bond_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"bond_type" text NOT NULL,
	"formation_method" text NOT NULL,
	"message" text,
	"public_key_jwk" text,
	"status" text DEFAULT 'pending',
	"created_at" timestamp with time zone DEFAULT NOW(),
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bonds" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"target_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_name" text NOT NULL,
	"bond_type" text NOT NULL,
	"formation_method" text NOT NULL,
	"passkey_status" text DEFAULT 'active',
	"expires_at" timestamp with time zone,
	"last_refreshed_at" timestamp with time zone,
	"reconnects_count" integer DEFAULT 0,
	"pseudonym" text,
	"target_pseudonym_for_me" text,
	"tribe_assigned_nickname" text,
	"display_preference" text,
	"nickname_vibe" text,
	"is_nickname_reported" boolean DEFAULT false,
	"show_in_intercom" boolean DEFAULT true,
	"allow_chat_initiation" boolean DEFAULT false,
	"inner_circle" boolean DEFAULT false,
	"key_type" text DEFAULT 'standard',
	"event_id" text,
	"access_tier" text,
	"public_key_jwk" text,
	"connection_score" integer DEFAULT 0,
	"last_interacted_at" timestamp with time zone,
	"daily_score_added" integer DEFAULT 0,
	"dormant_at" timestamp with time zone,
	"reconnect_requested_at" timestamp with time zone,
	"reconnect_requested_by" text
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"parent_comment_id" text,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"author_avatar" text,
	"author_avatar_fallback" text DEFAULT '??' NOT NULL,
	"data_ai_hint_avatar" text,
	"content" text NOT NULL,
	"ciphertext" "bytea",
	"is_encrypted" boolean DEFAULT false,
	"encryption_iv" text,
	"vibe_count" integer DEFAULT 0,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "connected_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"tribe_id" text NOT NULL,
	"user_id" text NOT NULL,
	"stripe_account_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"charges_enabled" boolean DEFAULT false,
	"payouts_enabled" boolean DEFAULT false,
	"platform_fee_percent" integer DEFAULT 5,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"reference_id" text,
	"points" integer NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"public_key" "bytea" NOT NULL,
	"counter" integer DEFAULT 0,
	"transports" text,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"type" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "event_rsvps" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "event_slug_redirects" (
	"id" text PRIMARY KEY NOT NULL,
	"old_slug" text NOT NULL,
	"event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"expires_at" timestamp with time zone,
	CONSTRAINT "event_slug_redirects_old_slug_unique" UNIQUE("old_slug")
);
--> statement-breakpoint
CREATE TABLE "event_stream_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"author_id" text NOT NULL,
	"author_nickname" text NOT NULL,
	"author_avatar_fallback" text DEFAULT '??' NOT NULL,
	"content" text NOT NULL,
	"image_url" text,
	"image_alt" text,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"keywords" text,
	"description" text NOT NULL,
	"event_date" timestamp with time zone,
	"associated_tribe_id" text,
	"associated_tribe_name" text,
	"cover_image" text,
	"data_ai_hint_cover" text,
	"is_public" boolean DEFAULT true,
	"creator_id" text NOT NULL,
	"location_name" text,
	"location_city_region" text,
	"latitude" double precision,
	"longitude" double precision,
	"rsvp_points_reward" integer DEFAULT 0,
	"slug" text,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "invite_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text DEFAULT 'referral' NOT NULL,
	"created_by" text,
	"grants_plan_id" text NOT NULL,
	"max_uses" integer DEFAULT 1,
	"used_count" integer DEFAULT 0,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "invite_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"invite_code_id" text NOT NULL,
	"user_id" text NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "key_vaults" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text,
	"vault_type" text NOT NULL,
	"encrypted_vault" "bytea" NOT NULL,
	"salt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media_files" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"bucket" text NOT NULL,
	"s3_key" text NOT NULL,
	"context" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"encrypted" boolean DEFAULT false,
	"encryption_meta" text,
	"public_url" text,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mentions" (
	"id" text PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"mentioned_user_id" text NOT NULL,
	"mentioner_user_id" text NOT NULL,
	"read" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"bond_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"ciphertext" "bytea",
	"plaintext" text,
	"attachment_file_id" text,
	"attachment_name" text,
	"attachment_type" text,
	"attachment_size" integer,
	"attachment_encryption_meta" text,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"push_enabled" boolean DEFAULT true,
	"email_enabled" boolean DEFAULT true,
	"mentions_enabled" boolean DEFAULT true,
	"bond_messages_enabled" boolean DEFAULT true,
	"tribe_activity_enabled" boolean DEFAULT true,
	"event_reminders_enabled" boolean DEFAULT true,
	"last_activity_viewed_at" timestamp with time zone,
	"read_activity_ids" jsonb DEFAULT '[]'::jsonb,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "pending_members" (
	"id" text PRIMARY KEY NOT NULL,
	"tribe_id" text NOT NULL,
	"user_id" text NOT NULL,
	"joined_as_alias" text,
	"joined_as_avatar" text,
	"requested_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_monthly" integer,
	"price_yearly" integer,
	"max_bonds" integer,
	"max_tribes_owned" integer,
	"max_members" integer,
	"stripe_price_id_monthly" text,
	"stripe_price_id_yearly" text,
	"target_role" text NOT NULL,
	"features" text,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "post_key_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"bond_id" text,
	"wrapped_key" text NOT NULL,
	"wrap_iv" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_mood_tags" (
	"post_id" text NOT NULL,
	"mood_slug" text NOT NULL,
	"promoted_at" timestamp with time zone,
	"promoted_by" text,
	CONSTRAINT "post_mood_tags_post_id_mood_slug_pk" PRIMARY KEY("post_id","mood_slug")
);
--> statement-breakpoint
CREATE TABLE "post_slug_redirects" (
	"id" text PRIMARY KEY NOT NULL,
	"old_slug" text NOT NULL,
	"post_id" text NOT NULL,
	"tribe_id" text,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text,
	"tribe_id" text,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"author_avatar" text,
	"author_avatar_fallback" text DEFAULT '??' NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"image_url" text,
	"image_urls" jsonb,
	"image_alt" text,
	"data_ai_hint_avatar" text,
	"data_ai_hint_image" text,
	"vibe_count" integer DEFAULT 0,
	"comment_count" integer DEFAULT 0,
	"is_removed" boolean DEFAULT false,
	"can_be_reposted" boolean DEFAULT true,
	"removal_reason" text,
	"original_post_id" text,
	"is_pinned" boolean DEFAULT false,
	"mood_visibility" text DEFAULT 'public',
	"ring" text DEFAULT 'tribes',
	"mood_tag" text,
	"pinned_to_wall" boolean DEFAULT false,
	"ciphertext" "bytea",
	"is_encrypted" boolean DEFAULT false,
	"encryption_iv" text,
	"link_url" text,
	"link_title" text,
	"link_description" text,
	"link_image" text,
	"link_site_name" text,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone,
	"slug_edited_by" text
);
--> statement-breakpoint
CREATE TABLE "proposal_comment_reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"comment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reaction" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "proposal_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" text NOT NULL,
	"parent_comment_id" text,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"author_avatar" text,
	"author_avatar_fallback" text DEFAULT '??' NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "proposal_options" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" text NOT NULL,
	"label" text NOT NULL,
	"vote_count" integer DEFAULT 0,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "proposal_slug_redirects" (
	"id" text PRIMARY KEY NOT NULL,
	"old_slug" text NOT NULL,
	"proposal_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"expires_at" timestamp with time zone,
	CONSTRAINT "proposal_slug_redirects_old_slug_unique" UNIQUE("old_slug")
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"created_by" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"tribe_id" text,
	"deadline" timestamp with time zone NOT NULL,
	"vote_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"slug" text,
	CONSTRAINT "proposals_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"keys_p256dh" text,
	"keys_auth" text,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"target_type" text DEFAULT 'post' NOT NULL,
	"post_id" text,
	"comment_id" text,
	"reporter_id" text,
	"reporter_name" text NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending',
	"reported_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"revoked_at" timestamp with time zone,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"category" text NOT NULL,
	"curator_name" text,
	"curator_avatar" text,
	"curator_avatar_fallback" text,
	"data_ai_hint_curator_avatar" text,
	"cover_image" text,
	"data_ai_hint_cover" text,
	"discussion_count" integer DEFAULT 0,
	"last_updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "story_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"source_name" text NOT NULL,
	"published_at" timestamp with time zone,
	"summary_snippet" text,
	"data_ai_hint" text
);
--> statement-breakpoint
CREATE TABLE "story_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"story_id" text NOT NULL,
	"parent_comment_id" text,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"author_avatar_fallback" text DEFAULT '??' NOT NULL,
	"data_ai_hint_avatar" text,
	"content" text NOT NULL,
	"vibe_count" integer DEFAULT 0,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"status" text NOT NULL,
	"source" text DEFAULT 'paid' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"tribe_id" text NOT NULL,
	"buyer_id" text NOT NULL,
	"seller_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"platform_fee_cents" integer NOT NULL,
	"seller_amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"description" text,
	"stripe_payment_intent_id" text,
	"stripe_transfer_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "tribe_key_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"tribe_key_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"wrapped_key" text NOT NULL,
	"wrap_iv" text NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "tribe_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"tribe_id" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"rotated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tribe_members" (
	"id" text PRIMARY KEY NOT NULL,
	"tribe_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member',
	"tribe_assigned_nickname" text,
	"joined_as_alias" text,
	"joined_as_avatar" text,
	"reputation_status" text,
	"joined_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tribe_mood_tags" (
	"tribe_id" text NOT NULL,
	"mood_slug" text NOT NULL,
	CONSTRAINT "tribe_mood_tags_tribe_id_mood_slug_pk" PRIMARY KEY("tribe_id","mood_slug")
);
--> statement-breakpoint
CREATE TABLE "tribe_slug_redirects" (
	"id" text PRIMARY KEY NOT NULL,
	"old_slug" text NOT NULL,
	"tribe_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "tribe_slug_redirects_old_slug_unique" UNIQUE("old_slug")
);
--> statement-breakpoint
CREATE TABLE "tribes" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"member_count" integer DEFAULT 0,
	"is_public" boolean DEFAULT true,
	"cover" text,
	"cover_position" text,
	"data_ai_hint" text,
	"homepage_url" text,
	"join_mechanism" text DEFAULT 'instant',
	"minimum_reputation" text,
	"minimum_account_age_days" integer,
	"created_by" text,
	"brand_color" text,
	"brand_logo" text,
	"invite_token" text,
	"bond_duration_days" integer,
	"created_at" timestamp with time zone,
	CONSTRAINT "tribes_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tribes_name_unique" UNIQUE("name"),
	CONSTRAINT "tribes_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
CREATE TABLE "user_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"alias" text NOT NULL,
	"avatar" text
);
--> statement-breakpoint
CREATE TABLE "user_bans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"banned_by" text NOT NULL,
	"reason" text,
	"duration" text NOT NULL,
	"related_post_id" text,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"selected_mood_slugs" text
);
--> statement-breakpoint
CREATE TABLE "user_slug_redirects" (
	"id" text PRIMARY KEY NOT NULL,
	"old_slug" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"expires_at" timestamp with time zone,
	CONSTRAINT "user_slug_redirects_old_slug_unique" UNIQUE("old_slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"role" text DEFAULT 'Human_Free' NOT NULL,
	"bio" text,
	"avatar" text,
	"reserved_alias" text,
	"reserved_alias_avatar" text,
	"reputation_score" integer DEFAULT 0,
	"reputation_status" text DEFAULT 'Newcomer',
	"email_verified" boolean DEFAULT false,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false,
	"ai_data_sharing_enabled" boolean DEFAULT true,
	"is_verified" boolean DEFAULT false,
	"tos_accepted_version" text,
	"deletion_requested_at" timestamp with time zone,
	"has_pii_access" boolean DEFAULT false,
	"encryption_public_key" text,
	"age_confirmed_at" timestamp with time zone,
	"slug" text,
	"created_at" timestamp with time zone,
	CONSTRAINT "users_reserved_alias_unique" UNIQUE("reserved_alias"),
	CONSTRAINT "users_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "vault_backups" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"encrypted_vault" "bytea" NOT NULL,
	"salt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "vibes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"target_id" text NOT NULL,
	"target_type" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" text NOT NULL,
	"option_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "wall_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "wall_styles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"background_color" text DEFAULT 'bg-background',
	"layout" text DEFAULT 'single-column',
	"now_playing_url" text
);
--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bond_key_history" ADD CONSTRAINT "bond_key_history_bond_id_bonds_id_fk" FOREIGN KEY ("bond_id") REFERENCES "public"."bonds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bond_requests" ADD CONSTRAINT "bond_requests_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bond_requests" ADD CONSTRAINT "bond_requests_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonds" ADD CONSTRAINT "bonds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_tribe_id_tribes_id_fk" FOREIGN KEY ("tribe_id") REFERENCES "public"."tribes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_slug_redirects" ADD CONSTRAINT "event_slug_redirects_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_stream_posts" ADD CONSTRAINT "event_stream_posts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_stream_posts" ADD CONSTRAINT "event_stream_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_associated_tribe_id_tribes_id_fk" FOREIGN KEY ("associated_tribe_id") REFERENCES "public"."tribes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_grants_plan_id_plans_id_fk" FOREIGN KEY ("grants_plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_invite_code_id_invite_codes_id_fk" FOREIGN KEY ("invite_code_id") REFERENCES "public"."invite_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_vaults" ADD CONSTRAINT "key_vaults_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_mentioned_user_id_users_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_mentioner_user_id_users_id_fk" FOREIGN KEY ("mentioner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_bond_id_bonds_id_fk" FOREIGN KEY ("bond_id") REFERENCES "public"."bonds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_members" ADD CONSTRAINT "pending_members_tribe_id_tribes_id_fk" FOREIGN KEY ("tribe_id") REFERENCES "public"."tribes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_members" ADD CONSTRAINT "pending_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_key_grants" ADD CONSTRAINT "post_key_grants_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_key_grants" ADD CONSTRAINT "post_key_grants_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_key_grants" ADD CONSTRAINT "post_key_grants_bond_id_bonds_id_fk" FOREIGN KEY ("bond_id") REFERENCES "public"."bonds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_mood_tags" ADD CONSTRAINT "post_mood_tags_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_mood_tags" ADD CONSTRAINT "post_mood_tags_promoted_by_users_id_fk" FOREIGN KEY ("promoted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_slug_redirects" ADD CONSTRAINT "post_slug_redirects_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_slug_redirects" ADD CONSTRAINT "post_slug_redirects_tribe_id_tribes_id_fk" FOREIGN KEY ("tribe_id") REFERENCES "public"."tribes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_tribe_id_tribes_id_fk" FOREIGN KEY ("tribe_id") REFERENCES "public"."tribes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_slug_edited_by_users_id_fk" FOREIGN KEY ("slug_edited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_comment_reactions" ADD CONSTRAINT "proposal_comment_reactions_comment_id_proposal_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."proposal_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_comment_reactions" ADD CONSTRAINT "proposal_comment_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_comments" ADD CONSTRAINT "proposal_comments_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_comments" ADD CONSTRAINT "proposal_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_options" ADD CONSTRAINT "proposal_options_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_slug_redirects" ADD CONSTRAINT "proposal_slug_redirects_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_tribe_id_tribes_id_fk" FOREIGN KEY ("tribe_id") REFERENCES "public"."tribes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_articles" ADD CONSTRAINT "story_articles_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_comments" ADD CONSTRAINT "story_comments_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_comments" ADD CONSTRAINT "story_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tribe_id_tribes_id_fk" FOREIGN KEY ("tribe_id") REFERENCES "public"."tribes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tribe_key_grants" ADD CONSTRAINT "tribe_key_grants_tribe_key_id_tribe_keys_id_fk" FOREIGN KEY ("tribe_key_id") REFERENCES "public"."tribe_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tribe_key_grants" ADD CONSTRAINT "tribe_key_grants_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tribe_key_grants" ADD CONSTRAINT "tribe_key_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tribe_keys" ADD CONSTRAINT "tribe_keys_tribe_id_tribes_id_fk" FOREIGN KEY ("tribe_id") REFERENCES "public"."tribes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tribe_keys" ADD CONSTRAINT "tribe_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tribe_members" ADD CONSTRAINT "tribe_members_tribe_id_tribes_id_fk" FOREIGN KEY ("tribe_id") REFERENCES "public"."tribes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tribe_members" ADD CONSTRAINT "tribe_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tribe_mood_tags" ADD CONSTRAINT "tribe_mood_tags_tribe_id_tribes_id_fk" FOREIGN KEY ("tribe_id") REFERENCES "public"."tribes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tribe_slug_redirects" ADD CONSTRAINT "tribe_slug_redirects_tribe_id_tribes_id_fk" FOREIGN KEY ("tribe_id") REFERENCES "public"."tribes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tribes" ADD CONSTRAINT "tribes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_aliases" ADD CONSTRAINT "user_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_banned_by_users_id_fk" FOREIGN KEY ("banned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_slug_redirects" ADD CONSTRAINT "user_slug_redirects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_backups" ADD CONSTRAINT "vault_backups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vibes" ADD CONSTRAINT "vibes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_option_id_proposal_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."proposal_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wall_blocks" ADD CONSTRAINT "wall_blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wall_styles" ADD CONSTRAINT "wall_styles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_admin_audit_logs_target" ON "admin_audit_logs" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "idx_admin_audit_logs_admin" ON "admin_audit_logs" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "idx_blocked_users_user" ON "blocked_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_bond_key_history_bond_id" ON "bond_key_history" USING btree ("bond_id");--> statement-breakpoint
CREATE INDEX "idx_bond_key_history_key_hash" ON "bond_key_history" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "idx_bonds_user_target" ON "bonds" USING btree ("user_id","target_type");--> statement-breakpoint
CREATE INDEX "idx_bonds_target_user" ON "bonds" USING btree ("target_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_comments_post" ON "comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_credentials_user" ON "credentials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_event_slug_redirects_slug" ON "event_slug_redirects" USING btree ("old_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "key_vaults_user_credential_idx" ON "key_vaults" USING btree ("user_id","credential_id");--> statement-breakpoint
CREATE INDEX "idx_media_files_user" ON "media_files" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_mentions_user" ON "mentions" USING btree ("mentioned_user_id","read");--> statement-breakpoint
CREATE INDEX "idx_messages_bond" ON "messages" USING btree ("bond_id","sent_at");--> statement-breakpoint
CREATE INDEX "idx_messages_sender" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "idx_post_mood_tags_mood" ON "post_mood_tags" USING btree ("mood_slug","promoted_at");--> statement-breakpoint
CREATE INDEX "idx_post_mood_tags_post" ON "post_mood_tags" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "idx_post_slug_redirects_slug" ON "post_slug_redirects" USING btree ("old_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_post_slug_redirects_standalone" ON "post_slug_redirects" USING btree ("old_slug") WHERE tribe_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_post_slug_redirects_tribe" ON "post_slug_redirects" USING btree ("tribe_id","old_slug") WHERE tribe_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_posts_ring_author" ON "posts" USING btree ("ring","author_id");--> statement-breakpoint
CREATE INDEX "idx_posts_tribe_ring" ON "posts" USING btree ("tribe_id","ring");--> statement-breakpoint
CREATE INDEX "idx_posts_author_created" ON "posts" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_posts_wall" ON "posts" USING btree ("author_id","pinned_to_wall");--> statement-breakpoint
CREATE INDEX "idx_posts_slug" ON "posts" USING btree ("tribe_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_tribe_slug_unique" ON "posts" USING btree ("tribe_id","slug") WHERE tribe_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "posts_standalone_slug_unique" ON "posts" USING btree ("slug") WHERE tribe_id IS NULL;--> statement-breakpoint
CREATE INDEX "idx_proposal_comment_reactions_comment" ON "proposal_comment_reactions" USING btree ("comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_comment_reactions_user_comment_idx" ON "proposal_comment_reactions" USING btree ("user_id","comment_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_comments_proposal" ON "proposal_comments" USING btree ("proposal_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_proposal_slug_redirects_slug" ON "proposal_slug_redirects" USING btree ("old_slug");--> statement-breakpoint
CREATE INDEX "idx_sessions_user" ON "sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_user" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_stripe" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "idx_tribe_key_grants_recipient" ON "tribe_key_grants" USING btree ("recipient_id","tribe_key_id");--> statement-breakpoint
CREATE INDEX "idx_tribe_key_grants_key" ON "tribe_key_grants" USING btree ("tribe_key_id");--> statement-breakpoint
CREATE INDEX "idx_tribe_keys_tribe" ON "tribe_keys" USING btree ("tribe_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_tribe_members_user" ON "tribe_members" USING btree ("user_id","tribe_id");--> statement-breakpoint
CREATE INDEX "idx_tribe_members_tribe" ON "tribe_members" USING btree ("tribe_id","role");--> statement-breakpoint
CREATE INDEX "idx_slug_redirects_slug" ON "tribe_slug_redirects" USING btree ("old_slug");--> statement-breakpoint
CREATE INDEX "idx_user_slug_redirects_slug" ON "user_slug_redirects" USING btree ("old_slug");--> statement-breakpoint
CREATE INDEX "idx_vibes_target" ON "vibes" USING btree ("target_id","target_type");--> statement-breakpoint
CREATE UNIQUE INDEX "vibes_user_target_idx" ON "vibes" USING btree ("user_id","target_id","target_type");