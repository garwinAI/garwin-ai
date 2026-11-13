CREATE TABLE "launch_checklist" (
	"key" text PRIMARY KEY NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_by" uuid
);
--> statement-breakpoint
ALTER TABLE "launch_checklist" ADD CONSTRAINT "launch_checklist_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;