ALTER TYPE "public"."post_status" ADD VALUE 'scheduled' BEFORE 'sending';--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "web_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "posts_scheduled_idx" ON "posts" USING btree ("status","scheduled_at");