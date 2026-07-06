CREATE TABLE "app_attest_keys" (
	"key_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"public_key_pem" text NOT NULL,
	"sign_count" integer DEFAULT 0 NOT NULL,
	"receipt" text,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"last_used_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
ALTER TABLE "app_attest_keys" ADD CONSTRAINT "app_attest_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_aak_user" ON "app_attest_keys" USING btree ("user_id");