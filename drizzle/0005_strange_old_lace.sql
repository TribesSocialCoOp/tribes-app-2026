ALTER TABLE "notification_preferences" ADD COLUMN "governance_enabled" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "apns_sandbox" boolean DEFAULT true;