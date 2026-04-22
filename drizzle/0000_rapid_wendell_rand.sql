CREATE TABLE `blocked_users` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`blocked_user_id` text NOT NULL,
	`blocked_at` integer,
	`reason` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bonds` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_name` text NOT NULL,
	`bond_type` text NOT NULL,
	`formation_method` text NOT NULL,
	`passkey_status` text DEFAULT 'active',
	`expires_at` integer,
	`last_refreshed_at` integer,
	`reconnects_count` integer DEFAULT 0,
	`pseudonym` text,
	`target_pseudonym_for_me` text,
	`tribe_assigned_nickname` text,
	`display_preference` text,
	`nickname_vibe` text,
	`is_nickname_reported` integer DEFAULT false,
	`show_in_intercom` integer DEFAULT true,
	`allow_chat_initiation` integer DEFAULT false,
	`key_type` text DEFAULT 'standard',
	`event_id` text,
	`access_tier` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`parent_comment_id` text,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`author_avatar` text,
	`author_avatar_fallback` text DEFAULT '??' NOT NULL,
	`data_ai_hint_avatar` text,
	`content` text NOT NULL,
	`vibe_count` integer DEFAULT 0,
	`created_at` integer,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`public_key` blob NOT NULL,
	`counter` integer DEFAULT 0,
	`transports` text,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`keywords` text,
	`description` text NOT NULL,
	`event_date` integer,
	`associated_tribe_id` text,
	`associated_tribe_name` text,
	`cover_image` text,
	`data_ai_hint_cover` text,
	`is_public` integer DEFAULT true,
	`creator_id` text NOT NULL,
	`location_name` text,
	`location_city_region` text,
	`latitude` real,
	`longitude` real,
	FOREIGN KEY (`associated_tribe_id`) REFERENCES `tribes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`bond_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`ciphertext` blob,
	`plaintext` text,
	`sent_at` integer,
	`read_at` integer,
	FOREIGN KEY (`bond_id`) REFERENCES `bonds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pending_members` (
	`id` text PRIMARY KEY NOT NULL,
	`tribe_id` text NOT NULL,
	`user_id` text NOT NULL,
	`requested_at` integer,
	FOREIGN KEY (`tribe_id`) REFERENCES `tribes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `post_mood_tags` (
	`post_id` text NOT NULL,
	`mood_slug` text NOT NULL,
	`promoted_at` integer,
	`promoted_by` text,
	PRIMARY KEY(`post_id`, `mood_slug`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`promoted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`tribe_id` text NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`author_avatar` text,
	`author_avatar_fallback` text DEFAULT '??' NOT NULL,
	`title` text,
	`content` text NOT NULL,
	`image_url` text,
	`image_alt` text,
	`data_ai_hint_avatar` text,
	`data_ai_hint_image` text,
	`vibe_count` integer DEFAULT 0,
	`comment_count` integer DEFAULT 0,
	`is_removed` integer DEFAULT false,
	`can_be_reposted` integer DEFAULT true,
	`removal_reason` text,
	`original_post_id` text,
	`is_pinned` integer DEFAULT false,
	`mood_visibility` text DEFAULT 'public',
	`created_at` integer,
	FOREIGN KEY (`tribe_id`) REFERENCES `tribes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`reporter_id` text,
	`reporter_name` text NOT NULL,
	`reason` text,
	`status` text DEFAULT 'pending',
	`reported_at` integer,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `stories` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`category` text NOT NULL,
	`curator_name` text,
	`curator_avatar` text,
	`curator_avatar_fallback` text,
	`data_ai_hint_curator_avatar` text,
	`cover_image` text,
	`data_ai_hint_cover` text,
	`discussion_count` integer DEFAULT 0,
	`last_updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `story_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`source_name` text NOT NULL,
	`published_at` integer,
	`summary_snippet` text,
	`data_ai_hint` text,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `story_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text NOT NULL,
	`parent_comment_id` text,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`author_avatar_fallback` text DEFAULT '??' NOT NULL,
	`data_ai_hint_avatar` text,
	`content` text NOT NULL,
	`vibe_count` integer DEFAULT 0,
	`created_at` integer,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tribe_members` (
	`id` text PRIMARY KEY NOT NULL,
	`tribe_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member',
	`tribe_assigned_nickname` text,
	`reputation_status` text,
	`joined_at` integer,
	FOREIGN KEY (`tribe_id`) REFERENCES `tribes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tribe_mood_tags` (
	`tribe_id` text NOT NULL,
	`mood_slug` text NOT NULL,
	PRIMARY KEY(`tribe_id`, `mood_slug`),
	FOREIGN KEY (`tribe_id`) REFERENCES `tribes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tribes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`member_count` integer DEFAULT 0,
	`is_public` integer DEFAULT true,
	`cover` text,
	`data_ai_hint` text,
	`homepage_url` text,
	`join_mechanism` text DEFAULT 'instant',
	`minimum_reputation` text,
	`minimum_account_age_days` integer,
	`created_by` text,
	`created_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tribes_name_unique` ON `tribes` (`name`);--> statement-breakpoint
CREATE TABLE `user_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`alias` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`selected_mood_slugs` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`role` text DEFAULT 'Human_Free' NOT NULL,
	`bio` text,
	`avatar` text,
	`reserved_alias` text,
	`reputation_score` integer DEFAULT 0,
	`reputation_status` text DEFAULT 'Onboarding',
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `vibes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_id` text NOT NULL,
	`target_type` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vibes_user_target_idx` ON `vibes` (`user_id`,`target_id`,`target_type`);--> statement-breakpoint
CREATE TABLE `wall_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`sort_order` integer DEFAULT 0,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `wall_styles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`background_color` text DEFAULT 'bg-background',
	`layout` text DEFAULT 'single-column',
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
