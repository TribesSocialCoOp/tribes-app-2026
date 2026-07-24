CREATE TABLE "tribe_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"tribe_id" text NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"status" text DEFAULT 'pending',
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
ALTER TABLE "tribe_invites" ADD CONSTRAINT "tribe_invites_tribe_id_tribes_id_fk" FOREIGN KEY ("tribe_id") REFERENCES "public"."tribes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tribe_invites" ADD CONSTRAINT "tribe_invites_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tribe_invites" ADD CONSTRAINT "tribe_invites_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tribe_invites_to_user" ON "tribe_invites" USING btree ("to_user_id","status");--> statement-breakpoint
CREATE INDEX "idx_tribe_invites_tribe_to" ON "tribe_invites" USING btree ("tribe_id","to_user_id");