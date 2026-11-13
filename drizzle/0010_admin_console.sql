CREATE TYPE "public"."user_status" AS ENUM('active', 'needs_attention', 'inactive', 'marked_for_deletion', 'deleted');--> statement-breakpoint
ALTER TYPE "public"."support_access_scope" ADD VALUE 'notifications.view';--> statement-breakpoint
CREATE TABLE "console_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid,
	"storage_object_id" uuid,
	"content" text NOT NULL,
	"line_count" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "console_recordings_size" CHECK (octet_length("console_recordings"."content") <= 2000000),
	CONSTRAINT "console_recordings_order" CHECK ("console_recordings"."ended_at" >= "console_recordings"."started_at")
);
--> statement-breakpoint
CREATE TABLE "system_status" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" "user_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "admin_note" text;--> statement-breakpoint
ALTER TABLE "console_recordings" ADD CONSTRAINT "console_recordings_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "console_recordings" ADD CONSTRAINT "console_recordings_storage_object_id_storage_objects_id_fk" FOREIGN KEY ("storage_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "console_recordings_admin_idx" ON "console_recordings" USING btree ("admin_id","created_at");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_admin_note_length" CHECK ("users"."admin_note" is null or length("users"."admin_note") <= 2000);