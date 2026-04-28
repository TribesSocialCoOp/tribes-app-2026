CREATE TABLE `key_vaults` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text,
	`vault_type` text NOT NULL,
	`encrypted_vault` blob NOT NULL,
	`salt` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `key_vaults_user_credential_idx` ON `key_vaults` (`user_id`,`credential_id`);--> statement-breakpoint
ALTER TABLE `bonds` ADD `connection_score` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `bonds` ADD `last_interacted_at` integer;--> statement-breakpoint
ALTER TABLE `bonds` ADD `daily_score_added` integer DEFAULT 0;