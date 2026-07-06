ALTER TABLE "tribes" ADD COLUMN "is_nsfw" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "age_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "age_verification_method" text;