ALTER TABLE "publications" ADD COLUMN "custom_domain" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "custom_domain_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "sender_email" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "sender_domain_id" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "sender_domain_status" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "sender_domain_records" jsonb;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_custom_domain_unique" UNIQUE("custom_domain");