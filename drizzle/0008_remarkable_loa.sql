CREATE TABLE "message_reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "reply_to_id" text;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "read_receipts_enabled" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "typing_indicators_enabled" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_message_reactions_message" ON "message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_message_reactions_user_message" ON "message_reactions" USING btree ("user_id","message_id");