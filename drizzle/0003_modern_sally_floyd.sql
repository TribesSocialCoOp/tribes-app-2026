CREATE TABLE "ncii_hash_blocklist" (
	"id" text PRIMARY KEY NOT NULL,
	"pdq_hash" text NOT NULL,
	"source_report_id" text,
	"source_post_id" text,
	"added_by" text,
	"added_at" timestamp with time zone DEFAULT NOW(),
	"status" text DEFAULT 'confirmed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ncii_report_key_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"admin_id" text NOT NULL,
	"wrapped_key" text NOT NULL,
	"wrap_iv" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "ncii_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"tracking_number" text NOT NULL,
	"requester_name" text NOT NULL,
	"requester_email" text NOT NULL,
	"requester_signature" text NOT NULL,
	"is_depicted_person" boolean DEFAULT true,
	"content_description" text NOT NULL,
	"content_urls" text,
	"poster_username" text,
	"search_terms" text,
	"content_type" text NOT NULL,
	"linked_post_ids" text,
	"non_consent_statement" boolean NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sla_deadline" timestamp with time zone NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"action_taken" text,
	"action_notes" text,
	"pdq_hashes_stored" boolean DEFAULT false,
	"encrypted_payload" text,
	"encryption_iv" text,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"updated_at" timestamp with time zone,
	CONSTRAINT "ncii_reports_tracking_number_unique" UNIQUE("tracking_number")
);
--> statement-breakpoint
ALTER TABLE "ncii_hash_blocklist" ADD CONSTRAINT "ncii_hash_blocklist_source_report_id_ncii_reports_id_fk" FOREIGN KEY ("source_report_id") REFERENCES "public"."ncii_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncii_hash_blocklist" ADD CONSTRAINT "ncii_hash_blocklist_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncii_report_key_grants" ADD CONSTRAINT "ncii_report_key_grants_report_id_ncii_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."ncii_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncii_report_key_grants" ADD CONSTRAINT "ncii_report_key_grants_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncii_reports" ADD CONSTRAINT "ncii_reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ncii_blocklist_hash" ON "ncii_hash_blocklist" USING btree ("pdq_hash");--> statement-breakpoint
CREATE INDEX "idx_ncii_key_grants_report" ON "ncii_report_key_grants" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "idx_ncii_key_grants_admin" ON "ncii_report_key_grants" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "idx_ncii_reports_tracking" ON "ncii_reports" USING btree ("tracking_number");--> statement-breakpoint
CREATE INDEX "idx_ncii_reports_status" ON "ncii_reports" USING btree ("status","sla_deadline");--> statement-breakpoint
CREATE INDEX "idx_ncii_reports_email" ON "ncii_reports" USING btree ("requester_email");