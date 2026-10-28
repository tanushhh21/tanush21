CREATE TABLE "rights_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"person_id" uuid,
	"requester" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"handled_by" text
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "joined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "protected" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "company_fact" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "away_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_pref" ADD COLUMN "frequency" text DEFAULT 'instant' NOT NULL;--> statement-breakpoint
ALTER TABLE "org" ADD COLUMN "share_with_winnow" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org" ADD COLUMN "plan" text DEFAULT 'pilot' NOT NULL;--> statement-breakpoint
ALTER TABLE "rights_request" ADD CONSTRAINT "rights_request_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_request" ADD CONSTRAINT "rights_request_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_request" ADD CONSTRAINT "rights_request_handled_by_user_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_fact_key" ON "company_fact" USING btree ("org_id","key");