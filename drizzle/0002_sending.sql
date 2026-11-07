ALTER TYPE "public"."delivery_status" ADD VALUE 'sending' BEFORE 'sent';--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "confirm_sent_at" timestamp with time zone;