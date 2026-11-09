ALTER TYPE "public"."subscriber_status" ADD VALUE 'declined';--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "invited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "invite_count" integer DEFAULT 0 NOT NULL;