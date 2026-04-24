CREATE TABLE `connected_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`tribe_id` text NOT NULL,
	`user_id` text NOT NULL,
	`stripe_account_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`charges_enabled` integer DEFAULT false,
	`payouts_enabled` integer DEFAULT false,
	`platform_fee_percent` integer DEFAULT 5,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`tribe_id`) REFERENCES `tribes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `proposal_options` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`label` text NOT NULL,
	`vote_count` integer DEFAULT 0,
	`sort_order` integer DEFAULT 0,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`created_by` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`tribe_id` text,
	`deadline` integer NOT NULL,
	`vote_count` integer DEFAULT 0,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tribe_id`) REFERENCES `tribes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`tribe_id` text NOT NULL,
	`buyer_id` text NOT NULL,
	`seller_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`platform_fee_cents` integer NOT NULL,
	`seller_amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`description` text,
	`stripe_payment_intent_id` text,
	`stripe_transfer_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`tribe_id`) REFERENCES `tribes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`buyer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`option_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`option_id`) REFERENCES `proposal_options`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `plans` ADD `max_members` integer;--> statement-breakpoint
ALTER TABLE `tribes` ADD `cover_position` text;--> statement-breakpoint
ALTER TABLE `tribes` ADD `brand_color` text;--> statement-breakpoint
ALTER TABLE `tribes` ADD `brand_logo` text;--> statement-breakpoint
ALTER TABLE `users` ADD `is_verified` integer DEFAULT false;