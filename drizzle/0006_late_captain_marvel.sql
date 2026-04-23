CREATE TABLE `mentions` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`mentioned_user_id` text NOT NULL,
	`mentioner_user_id` text NOT NULL,
	`read` integer DEFAULT false,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`mentioned_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mentioner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
