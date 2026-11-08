ALTER TYPE "public"."delivery_status" ADD VALUE 'bounced';--> statement-breakpoint
ALTER TYPE "public"."delivery_status" ADD VALUE 'complained';--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "status_reason" text;