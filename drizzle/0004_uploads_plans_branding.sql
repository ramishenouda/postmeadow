CREATE TABLE "account_billing" (
	"user_id" text PRIMARY KEY NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"storage_addons" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"key" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"original_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "images_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "accent_color" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "font_style" text DEFAULT 'sans' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_billing" ADD CONSTRAINT "account_billing_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "images_owner_idx" ON "images" USING btree ("owner_id");