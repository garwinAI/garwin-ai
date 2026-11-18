CREATE TABLE "workspace_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"layout" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_layouts_layout_object" CHECK (jsonb_typeof("workspace_layouts"."layout") = 'object'),
	CONSTRAINT "workspace_layouts_layout_size" CHECK (octet_length("workspace_layouts"."layout"::text) <= 200000)
);
--> statement-breakpoint
ALTER TABLE "workspace_layouts" ADD CONSTRAINT "workspace_layouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_layouts" ADD CONSTRAINT "workspace_layouts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_layouts_user_account_idx" ON "workspace_layouts" USING btree ("user_id","account_id");