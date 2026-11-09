ALTER TABLE "posts" ADD COLUMN "import_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "posts_import_key_idx" ON "posts" USING btree ("publication_id","import_key");