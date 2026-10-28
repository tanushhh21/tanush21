ALTER TABLE "document" ADD COLUMN "excluded" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluation" ADD COLUMN "suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL;