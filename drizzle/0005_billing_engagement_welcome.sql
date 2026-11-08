CREATE TABLE "delivery_link_clicks" (
	"delivery_id" uuid NOT NULL,
	"url" text NOT NULL,
	"clicks" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "delivery_link_clicks_delivery_id_url_pk" PRIMARY KEY("delivery_id","url")
);
--> statement-breakpoint
ALTER TABLE "account_billing" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "account_billing" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "account_billing" ADD COLUMN "billing_interval" text;--> statement-breakpoint
ALTER TABLE "account_billing" ADD COLUMN "subscription_status" text;--> statement-breakpoint
ALTER TABLE "account_billing" ADD COLUMN "current_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_billing" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "account_billing" ADD COLUMN "stripe_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "clicked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "opens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "clicks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "welcome_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "welcome_message" text;--> statement-breakpoint
ALTER TABLE "delivery_link_clicks" ADD CONSTRAINT "delivery_link_clicks_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_billing" ADD CONSTRAINT "account_billing_stripe_customer_id_unique" UNIQUE("stripe_customer_id");