ALTER TABLE `invite_codes` ADD `type` text DEFAULT 'referral' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `image_urls` text;--> statement-breakpoint
ALTER TABLE `mentions` ADD `read` integer DEFAULT false;