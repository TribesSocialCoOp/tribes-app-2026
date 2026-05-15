ALTER TABLE "notification_preferences" ADD COLUMN IF NOT EXISTS "last_activity_viewed_at" timestamp with time zone;
