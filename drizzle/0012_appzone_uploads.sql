CREATE TYPE "public"."appzone_app_type" AS ENUM('standalone', 'tool');--> statement-breakpoint
CREATE TYPE "public"."appzone_file_role" AS ENUM('icon', 'main_image', 'gallery', 'package');--> statement-breakpoint
CREATE TYPE "public"."upload_fee_purpose" AS ENUM('listing', 'update');--> statement-breakpoint
CREATE TABLE "appzone_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"version_id" uuid,
	"role" "appzone_file_role" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appzone_files_package_has_version" CHECK (("appzone_files"."role" = 'package') = ("appzone_files"."version_id" is not null)),
	CONSTRAINT "appzone_files_type" CHECK (("appzone_files"."role" = 'package' and "appzone_files"."content_type" = 'application/zip') or ("appzone_files"."role" <> 'package' and "appzone_files"."content_type" in ('image/png', 'image/jpeg', 'image/webp'))),
	CONSTRAINT "appzone_files_size" CHECK ("appzone_files"."size_bytes" > 0 and "appzone_files"."size_bytes" = octet_length("appzone_files"."data") and "appzone_files"."size_bytes" <= case "appzone_files"."role" when 'icon' then 262144 when 'package' then 4194304 else 1048576 end),
	CONSTRAINT "appzone_files_sha256" CHECK ("appzone_files"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "upload_fees" DROP CONSTRAINT "upload_fees_item_id_unique";--> statement-breakpoint
ALTER TABLE "upload_fees" DROP CONSTRAINT "upload_fees_amount_matches_kind";--> statement-breakpoint
ALTER TABLE "upload_fees" DROP CONSTRAINT "upload_fees_paid_has_payment";--> statement-breakpoint
ALTER TABLE "appzone_item_versions" ALTER COLUMN "bundle_storage_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "appzone_item_versions" ALTER COLUMN "bundle_sha256" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "appzone_item_versions" ADD COLUMN "release_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "appzone_item_versions" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "appzone_items" ADD COLUMN "yearly_price_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "appzone_items" ADD COLUMN "app_type" "appzone_app_type";--> statement-breakpoint
ALTER TABLE "appzone_items" ADD COLUMN "target_app" text;--> statement-breakpoint
ALTER TABLE "appzone_items" ADD COLUMN "theme_layout" text;--> statement-breakpoint
ALTER TABLE "appzone_items" ADD COLUMN "main_color" text DEFAULT '#2563eb' NOT NULL;--> statement-breakpoint
ALTER TABLE "appzone_items" ADD COLUMN "copyright" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "appzone_items" ADD COLUMN "support_email" text;--> statement-breakpoint
ALTER TABLE "appzone_items" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "appzone_items" ADD COLUMN "privacy_url" text;--> statement-breakpoint
ALTER TABLE "appzone_items" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "upload_fees" ADD COLUMN "version_id" uuid;--> statement-breakpoint
ALTER TABLE "upload_fees" ADD COLUMN "purpose" "upload_fee_purpose" DEFAULT 'listing' NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_fees" ADD COLUMN "stripe_payment_intent_id" text;--> statement-breakpoint
-- Backfill rows made before these rules existed.
UPDATE "appzone_items" SET "app_type" = 'standalone' WHERE "kind" = 'app' AND "app_type" IS NULL;--> statement-breakpoint
UPDATE "appzone_items" SET "theme_layout" = 'standard' WHERE "kind" = 'theme' AND "theme_layout" IS NULL;--> statement-breakpoint
UPDATE "appzone_items" SET "yearly_price_cents" = "price_cents" * 10 WHERE "price_cents" > 0 AND "yearly_price_cents" = 0;--> statement-breakpoint
UPDATE "appzone_item_versions" SET "submitted_at" = "created_at" WHERE "submitted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "appzone_files" ADD CONSTRAINT "appzone_files_item_id_appzone_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."appzone_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appzone_files" ADD CONSTRAINT "appzone_files_version_id_appzone_item_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."appzone_item_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appzone_files_one_icon_main_idx" ON "appzone_files" USING btree ("item_id","role") WHERE "appzone_files"."role" in ('icon', 'main_image');--> statement-breakpoint
CREATE UNIQUE INDEX "appzone_files_one_package_idx" ON "appzone_files" USING btree ("version_id") WHERE "appzone_files"."role" = 'package';--> statement-breakpoint
CREATE UNIQUE INDEX "appzone_item_versions_one_open_idx" ON "appzone_item_versions" USING btree ("item_id") WHERE "appzone_item_versions"."review_status" = 'pending';--> statement-breakpoint
CREATE INDEX "appzone_files_item_idx" ON "appzone_files" USING btree ("item_id","role","position");--> statement-breakpoint
ALTER TABLE "upload_fees" ADD CONSTRAINT "upload_fees_version_id_appzone_item_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."appzone_item_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "upload_fees_one_listing_idx" ON "upload_fees" USING btree ("item_id") WHERE "upload_fees"."purpose" = 'listing';--> statement-breakpoint
CREATE INDEX "upload_fees_developer_idx" ON "upload_fees" USING btree ("developer_id","created_at");--> statement-breakpoint
ALTER TABLE "upload_fees" ADD CONSTRAINT "upload_fees_version_id_unique" UNIQUE("version_id");--> statement-breakpoint
ALTER TABLE "upload_fees" ADD CONSTRAINT "upload_fees_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id");--> statement-breakpoint
ALTER TABLE "appzone_item_versions" ADD CONSTRAINT "appzone_item_versions_submitted_has_bundle" CHECK ("appzone_item_versions"."submitted_at" is null or ("appzone_item_versions"."bundle_storage_key" is not null and "appzone_item_versions"."bundle_sha256" is not null));--> statement-breakpoint
ALTER TABLE "appzone_item_versions" ADD CONSTRAINT "appzone_item_versions_reviewed_was_submitted" CHECK ("appzone_item_versions"."review_status" = 'pending' or "appzone_item_versions"."submitted_at" is not null);--> statement-breakpoint
ALTER TABLE "appzone_items" ADD CONSTRAINT "appzone_items_yearly_price_valid" CHECK ("appzone_items"."yearly_price_cents" = 0 or "appzone_items"."yearly_price_cents" >= 99);--> statement-breakpoint
ALTER TABLE "appzone_items" ADD CONSTRAINT "appzone_items_free_both_or_neither" CHECK (("appzone_items"."price_cents" = 0) = ("appzone_items"."yearly_price_cents" = 0));--> statement-breakpoint
ALTER TABLE "appzone_items" ADD CONSTRAINT "appzone_items_app_type_for_apps" CHECK (("appzone_items"."kind" = 'app') = ("appzone_items"."app_type" is not null));--> statement-breakpoint
ALTER TABLE "appzone_items" ADD CONSTRAINT "appzone_items_tool_has_target" CHECK ("appzone_items"."app_type" is distinct from 'tool' or "appzone_items"."target_app" is not null);--> statement-breakpoint
ALTER TABLE "appzone_items" ADD CONSTRAINT "appzone_items_theme_layout" CHECK (("appzone_items"."kind" = 'theme') = ("appzone_items"."theme_layout" is not null) and ("appzone_items"."theme_layout" is null or "appzone_items"."theme_layout" = 'standard'));--> statement-breakpoint
ALTER TABLE "appzone_items" ADD CONSTRAINT "appzone_items_main_color" CHECK ("appzone_items"."main_color" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
ALTER TABLE "upload_fees" ADD CONSTRAINT "upload_fees_amount_matches_purpose" CHECK (("upload_fees"."purpose" = 'update' and "upload_fees"."amount_cents" = 999) or ("upload_fees"."purpose" = 'listing' and (("upload_fees"."kind" = 'app' and "upload_fees"."amount_cents" = 3999) or ("upload_fees"."kind" = 'theme' and "upload_fees"."amount_cents" = 2999) or ("upload_fees"."kind" = 'widget' and "upload_fees"."amount_cents" = 1999))));--> statement-breakpoint
ALTER TABLE "upload_fees" ADD CONSTRAINT "upload_fees_paid_has_charge" CHECK ("upload_fees"."paid_at" is null or "upload_fees"."stripe_payment_intent_id" is not null or "upload_fees"."payment_id" is not null);--> statement-breakpoint
ALTER TABLE "upload_fees" ADD CONSTRAINT "upload_fees_update_has_version" CHECK ("upload_fees"."purpose" = 'listing' or "upload_fees"."version_id" is not null);