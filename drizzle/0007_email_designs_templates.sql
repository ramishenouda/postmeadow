CREATE TABLE "post_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"subtitle" text,
	"content_format" text DEFAULT 'markdown' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "email_design" text DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE "post_templates" ADD CONSTRAINT "post_templates_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_templates_publication_idx" ON "post_templates" USING btree ("publication_id");