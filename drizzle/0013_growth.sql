CREATE TABLE "landing_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"headline" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"button_text" text,
	"tag_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"publication_id" uuid NOT NULL,
	"recommended_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendations_publication_id_recommended_id_pk" PRIMARY KEY("publication_id","recommended_id")
);
--> statement-breakpoint
CREATE TABLE "referral_grants" (
	"subscriber_id" uuid NOT NULL,
	"reward_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_grants_subscriber_id_reward_id_pk" PRIMARY KEY("subscriber_id","reward_id")
);
--> statement-breakpoint
CREATE TABLE "referral_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"threshold" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "referrals_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "popup_delay_seconds" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "popup_headline" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "referred_by" uuid;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_recommended_id_publications_id_fk" FOREIGN KEY ("recommended_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_grants" ADD CONSTRAINT "referral_grants_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_grants" ADD CONSTRAINT "referral_grants_reward_id_referral_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."referral_rewards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "landing_pages_publication_slug_idx" ON "landing_pages" USING btree ("publication_id","slug");--> statement-breakpoint
CREATE INDEX "recommendations_recommended_idx" ON "recommendations" USING btree ("recommended_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_rewards_threshold_idx" ON "referral_rewards" USING btree ("publication_id","threshold");--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_referred_by_subscribers_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscribers_referred_by_idx" ON "subscribers" USING btree ("referred_by");--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_referral_code_unique" UNIQUE("referral_code");