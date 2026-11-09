ALTER TYPE "public"."delivery_status" ADD VALUE 'held';--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "variant" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "subject_b" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "ab_metric" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "ab_test_percent" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "ab_wait_hours" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "ab_decide_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "ab_winner" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "resend_of" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "sponsor" jsonb;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "sponsor_report_token" text;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_resend_of_posts_id_fk" FOREIGN KEY ("resend_of") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_sponsor_report_token_unique" UNIQUE("sponsor_report_token");