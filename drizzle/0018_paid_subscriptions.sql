ALTER TABLE "posts" ADD COLUMN "paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "stripe_charges_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "paid_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "paid_currency" text DEFAULT 'usd' NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "paid_monthly_cents" integer;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "paid_yearly_cents" integer;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "paid_description" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "paid_product_id" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "paid_monthly_price_id" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "paid_yearly_price_id" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "paid_status" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "paid_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "paid_interval" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_stripe_account_id_unique" UNIQUE("stripe_account_id");--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id");