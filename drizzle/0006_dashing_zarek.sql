CREATE TABLE "user_device_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"device_label" text NOT NULL,
	"public_key" text NOT NULL,
	"key_fingerprint" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT NOW(),
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
ALTER TABLE "tribe_key_grants" ADD COLUMN "device_key_id" text;--> statement-breakpoint
ALTER TABLE "user_device_keys" ADD CONSTRAINT "user_device_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_udk_user" ON "user_device_keys" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_udk_fingerprint" ON "user_device_keys" USING btree ("user_id","key_fingerprint");--> statement-breakpoint
ALTER TABLE "tribe_key_grants" ADD CONSTRAINT "tribe_key_grants_device_key_id_user_device_keys_id_fk" FOREIGN KEY ("device_key_id") REFERENCES "public"."user_device_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tribe_key_grants_device" ON "tribe_key_grants" USING btree ("device_key_id");