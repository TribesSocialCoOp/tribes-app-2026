ALTER TABLE `users` ADD `totp_secret` text;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_enabled` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `users` ADD `ai_data_sharing_enabled` integer DEFAULT true;