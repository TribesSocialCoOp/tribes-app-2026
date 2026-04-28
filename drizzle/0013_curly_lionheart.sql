ALTER TABLE `bonds` ADD `dormant_at` integer;--> statement-breakpoint
ALTER TABLE `bonds` ADD `reconnect_requested_at` integer;--> statement-breakpoint
ALTER TABLE `bonds` ADD `reconnect_requested_by` text;