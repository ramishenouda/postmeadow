CREATE TABLE "email_usage" (
	"user_id" text NOT NULL,
	"month" text NOT NULL,
	"emails" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "email_usage_user_id_month_pk" PRIMARY KEY("user_id","month")
);
--> statement-breakpoint
CREATE TABLE "post_audience_tags" (
	"post_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "post_audience_tags_post_id_tag_id_pk" PRIMARY KEY("post_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "subscriber_tags" (
	"subscriber_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "subscriber_tags_subscriber_id_tag_id_pk" PRIMARY KEY("subscriber_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "audience" text DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "send_error" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "postal_address" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "subscribers" ADD COLUMN "source" text DEFAULT 'signup' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_usage" ADD CONSTRAINT "email_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_audience_tags" ADD CONSTRAINT "post_audience_tags_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_audience_tags" ADD CONSTRAINT "post_audience_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_tags" ADD CONSTRAINT "subscriber_tags_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_tags" ADD CONSTRAINT "subscriber_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriber_tags_tag_idx" ON "subscriber_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_publication_name_idx" ON "tags" USING btree ("publication_id",lower("name"));