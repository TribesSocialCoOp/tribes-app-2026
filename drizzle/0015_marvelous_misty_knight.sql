CREATE TABLE `post_key_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`bond_id` text,
	`wrapped_key` text NOT NULL,
	`wrap_iv` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bond_id`) REFERENCES `bonds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `posts` ADD `ciphertext` blob;--> statement-breakpoint
ALTER TABLE `posts` ADD `is_encrypted` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `posts` ADD `encryption_iv` text;