CREATE TYPE "public"."member_permission" AS ENUM('storage.view', 'storage.upload', 'storage.mark_for_deletion', 'calendar.view', 'calendar.edit', 'contacts.view', 'contacts.edit', 'messages.use', 'apps.use', 'appzone.install', 'billing.view');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."billing_interval" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('subscription', 'appzone_purchase', 'upload_fee', 'refund');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."subscription_source" AS ENUM('stripe', 'admin');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."storage_object_kind" AS ENUM('file', 'folder');--> statement-breakpoint
CREATE TYPE "public"."acquisition_source" AS ENUM('free_download', 'purchase', 'admin_grant');--> statement-breakpoint
CREATE TYPE "public"."appzone_item_kind" AS ENUM('app', 'widget', 'theme');--> statement-breakpoint
CREATE TYPE "public"."appzone_item_status" AS ENUM('draft', 'in_review', 'published', 'rejected', 'unlisted');--> statement-breakpoint
CREATE TYPE "public"."purchase_status" AS ENUM('pending', 'paid', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."conversation_kind" AS ENUM('team', 'support');--> statement-breakpoint
CREATE TYPE "public"."support_access_scope" AS ENUM('account.view', 'storage.view', 'apps.view', 'billing.view', 'messages.view');--> statement-breakpoint
CREATE TYPE "public"."support_access_status" AS ENUM('requested', 'approved', 'denied', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'pending', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'admin', 'support', 'system', 'stripe');--> statement-breakpoint
CREATE TABLE "account_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_members_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"stripe_customer_id" text,
	"storage_used_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_owner_user_id_unique" UNIQUE("owner_user_id"),
	CONSTRAINT "accounts_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "accounts_storage_used_nonnegative" CHECK ("accounts"."storage_used_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invitation_permissions" (
	"invitation_id" uuid NOT NULL,
	"permission" "member_permission" NOT NULL,
	CONSTRAINT "invitation_permissions_invitation_id_permission_pk" PRIMARY KEY("invitation_id","permission")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitations_email_lowercase" CHECK ("invitations"."email" = lower("invitations"."email")),
	CONSTRAINT "invitations_not_both_accepted_and_revoked" CHECK ("invitations"."accepted_at" is null or "invitations"."revoked_at" is null)
);
--> statement-breakpoint
CREATE TABLE "member_permissions" (
	"member_id" uuid NOT NULL,
	"permission" "member_permission" NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_permissions_member_id_permission_pk" PRIMARY KEY("member_id","permission")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"user_id" uuid,
	"kind" "payment_kind" NOT NULL,
	"status" "payment_status" NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_invoice_id" text,
	"stripe_charge_id" text,
	"subscription_id" uuid,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "payments_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id"),
	CONSTRAINT "payments_amount_nonnegative" CHECK ("payments"."amount_cents" >= 0),
	CONSTRAINT "payments_currency_format" CHECK ("payments"."currency" ~ '^[a-z]{3}$'),
	CONSTRAINT "payments_has_stripe_reference" CHECK ("payments"."stripe_payment_intent_id" is not null or "payments"."stripe_invoice_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "plan_apps" (
	"plan_id" text NOT NULL,
	"app_slug" text NOT NULL,
	CONSTRAINT "plan_apps_plan_id_app_slug_pk" PRIMARY KEY("plan_id","app_slug")
);
--> statement-breakpoint
CREATE TABLE "plan_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" text NOT NULL,
	"interval" "billing_interval" NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"stripe_price_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_prices_stripe_price_id_unique" UNIQUE("stripe_price_id"),
	CONSTRAINT "plan_prices_amount_positive" CHECK ("plan_prices"."amount_cents" > 0),
	CONSTRAINT "plan_prices_currency_format" CHECK ("plan_prices"."currency" ~ '^[a-z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"storage_bytes" bigint NOT NULL,
	"team_member_limit" integer NOT NULL,
	"free_appzone_download_limit" integer,
	"is_paid" boolean NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_storage_positive" CHECK ("plans"."storage_bytes" > 0),
	CONSTRAINT "plans_team_nonnegative" CHECK ("plans"."team_member_limit" >= 0),
	CONSTRAINT "plans_download_limit_nonnegative" CHECK ("plans"."free_appzone_download_limit" is null or "plans"."free_appzone_download_limit" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"price_id" uuid,
	"source" "subscription_source" NOT NULL,
	"status" "subscription_status" NOT NULL,
	"interval" "billing_interval",
	"stripe_subscription_id" text,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id"),
	CONSTRAINT "subscriptions_paid_plan_only" CHECK ("subscriptions"."plan_id" <> 'free'),
	CONSTRAINT "subscriptions_stripe_fields" CHECK (("subscriptions"."source" = 'stripe' and "subscriptions"."stripe_subscription_id" is not null and "subscriptions"."interval" is not null) or ("subscriptions"."source" = 'admin' and "subscriptions"."stripe_subscription_id" is null)),
	CONSTRAINT "subscriptions_period_order" CHECK ("subscriptions"."current_period_end" is null or "subscriptions"."current_period_start" is null or "subscriptions"."current_period_end" > "subscriptions"."current_period_start")
);
--> statement-breakpoint
CREATE TABLE "storage_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"parent_id" uuid,
	"kind" "storage_object_kind" NOT NULL,
	"name" text NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"mime_type" text,
	"storage_key" text,
	"sha256" text,
	"created_by" uuid,
	"marked_for_deletion_at" timestamp with time zone,
	"marked_for_deletion_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_objects_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "storage_objects_size_nonnegative" CHECK ("storage_objects"."size_bytes" >= 0),
	CONSTRAINT "storage_objects_name_valid" CHECK (length("storage_objects"."name") between 1 and 255 and "storage_objects"."name" !~ '[/\\]'),
	CONSTRAINT "storage_objects_kind_fields" CHECK (("storage_objects"."kind" = 'folder' and "storage_objects"."size_bytes" = 0 and "storage_objects"."storage_key" is null) or ("storage_objects"."kind" = 'file' and "storage_objects"."storage_key" is not null)),
	CONSTRAINT "storage_objects_not_own_parent" CHECK ("storage_objects"."parent_id" is null or "storage_objects"."parent_id" <> "storage_objects"."id")
);
--> statement-breakpoint
CREATE TABLE "appzone_acquisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"acquired_by" uuid,
	"source" "acquisition_source" NOT NULL,
	"purchase_id" uuid,
	"counts_toward_free_limit" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appzone_acquisitions_purchase_id_unique" UNIQUE("purchase_id"),
	CONSTRAINT "appzone_acquisitions_purchase_link" CHECK (("appzone_acquisitions"."source" = 'purchase') = ("appzone_acquisitions"."purchase_id" is not null)),
	CONSTRAINT "appzone_acquisitions_only_free_counts" CHECK (not "appzone_acquisitions"."counts_toward_free_limit" or "appzone_acquisitions"."source" = 'free_download')
);
--> statement-breakpoint
CREATE TABLE "appzone_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"version_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"installed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appzone_item_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"version" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"bundle_storage_key" text NOT NULL,
	"bundle_sha256" text NOT NULL,
	"review_status" "review_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appzone_item_versions_semver" CHECK ("appzone_item_versions"."version" ~ '^[0-9]+\.[0-9]+\.[0-9]+$')
);
--> statement-breakpoint
CREATE TABLE "appzone_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"kind" "appzone_item_kind" NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "appzone_item_status" DEFAULT 'draft' NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appzone_items_slug_unique" UNIQUE("slug"),
	CONSTRAINT "appzone_items_price_valid" CHECK ("appzone_items"."price_cents" = 0 or "appzone_items"."price_cents" >= 99),
	CONSTRAINT "appzone_items_currency_format" CHECK ("appzone_items"."currency" ~ '^[a-z]{3}$'),
	CONSTRAINT "appzone_items_slug_format" CHECK ("appzone_items"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "appzone_items_published_has_date" CHECK ("appzone_items"."status" <> 'published' or "appzone_items"."published_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "developer_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "developer_status" DEFAULT 'pending' NOT NULL,
	"display_name" text NOT NULL,
	"website" text,
	"application_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"stripe_connect_account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "developer_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "developer_profiles_stripe_connect_account_id_unique" UNIQUE("stripe_connect_account_id"),
	CONSTRAINT "developer_profiles_status_not_none" CHECK ("developer_profiles"."status" <> 'none'),
	CONSTRAINT "developer_profiles_review_consistent" CHECK ("developer_profiles"."status" = 'pending' or "developer_profiles"."reviewed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"buyer_user_id" uuid,
	"status" "purchase_status" DEFAULT 'pending' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"platform_fee_cents" integer NOT NULL,
	"developer_amount_cents" integer NOT NULL,
	"payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "purchases_amount_positive" CHECK ("purchases"."amount_cents" > 0),
	CONSTRAINT "purchases_split_adds_up" CHECK ("purchases"."platform_fee_cents" + "purchases"."developer_amount_cents" = "purchases"."amount_cents"),
	CONSTRAINT "purchases_fee_is_15_percent" CHECK ("purchases"."platform_fee_cents" = round("purchases"."amount_cents" * 0.15)),
	CONSTRAINT "purchases_paid_has_payment" CHECK ("purchases"."status" <> 'paid' or "purchases"."payment_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "upload_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"kind" "appzone_item_kind" NOT NULL,
	"amount_cents" integer NOT NULL,
	"payment_id" uuid,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upload_fees_item_id_unique" UNIQUE("item_id"),
	CONSTRAINT "upload_fees_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "upload_fees_amount_matches_kind" CHECK (("upload_fees"."kind" = 'app' and "upload_fees"."amount_cents" = 3999) or ("upload_fees"."kind" = 'theme' and "upload_fees"."amount_cents" = 2999) or ("upload_fees"."kind" = 'widget' and "upload_fees"."amount_cents" = 1999)),
	CONSTRAINT "upload_fees_paid_has_payment" CHECK ("upload_fees"."paid_at" is null or "upload_fees"."payment_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_participants_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" "conversation_kind" NOT NULL,
	"subject" text,
	"created_by" uuid,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "messages_body_length" CHECK (length("messages"."body") between 1 and 10000)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"data" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_link_relative" CHECK ("notifications"."link" is null or "notifications"."link" ~ '^/[^/]')
);
--> statement-breakpoint
CREATE TABLE "support_access_grant_scopes" (
	"grant_id" uuid NOT NULL,
	"scope" "support_access_scope" NOT NULL,
	CONSTRAINT "support_access_grant_scopes_grant_id_scope_pk" PRIMARY KEY("grant_id","scope")
);
--> statement-breakpoint
CREATE TABLE "support_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"ticket_id" uuid,
	"requested_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "support_access_status" DEFAULT 'requested' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_access_reason_length" CHECK (length("support_access_grants"."reason") between 10 and 1000),
	CONSTRAINT "support_access_approved_fields" CHECK ("support_access_grants"."status" <> 'approved' or ("support_access_grants"."decided_at" is not null and "support_access_grants"."expires_at" is not null)),
	CONSTRAINT "support_access_max_24h" CHECK ("support_access_grants"."expires_at" is null or "support_access_grants"."decided_at" is null or "support_access_grants"."expires_at" <= "support_access_grants"."decided_at" + interval '24 hours')
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"opened_by" uuid,
	"assigned_to" uuid,
	"conversation_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'normal' NOT NULL,
	"first_response_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_conversation_id_unique" UNIQUE("conversation_id"),
	CONSTRAINT "support_tickets_subject_length" CHECK (length("support_tickets"."subject") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"actor_user_id" uuid,
	"actor_type" "audit_actor_type" NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"support_grant_id" uuid,
	"ip" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_members" ADD CONSTRAINT "account_members_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_members" ADD CONSTRAINT "account_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_members" ADD CONSTRAINT "account_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_permissions" ADD CONSTRAINT "invitation_permissions_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_permissions" ADD CONSTRAINT "member_permissions_member_id_account_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."account_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_permissions" ADD CONSTRAINT "member_permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_apps" ADD CONSTRAINT "plan_apps_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_price_id_plan_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "public"."plan_prices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_parent_id_storage_objects_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."storage_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_marked_for_deletion_by_users_id_fk" FOREIGN KEY ("marked_for_deletion_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appzone_acquisitions" ADD CONSTRAINT "appzone_acquisitions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appzone_acquisitions" ADD CONSTRAINT "appzone_acquisitions_item_id_appzone_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."appzone_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appzone_acquisitions" ADD CONSTRAINT "appzone_acquisitions_acquired_by_users_id_fk" FOREIGN KEY ("acquired_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appzone_acquisitions" ADD CONSTRAINT "appzone_acquisitions_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appzone_installations" ADD CONSTRAINT "appzone_installations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appzone_installations" ADD CONSTRAINT "appzone_installations_item_id_appzone_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."appzone_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appzone_installations" ADD CONSTRAINT "appzone_installations_version_id_appzone_item_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."appzone_item_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appzone_installations" ADD CONSTRAINT "appzone_installations_installed_by_users_id_fk" FOREIGN KEY ("installed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appzone_item_versions" ADD CONSTRAINT "appzone_item_versions_item_id_appzone_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."appzone_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appzone_item_versions" ADD CONSTRAINT "appzone_item_versions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appzone_items" ADD CONSTRAINT "appzone_items_developer_id_developer_profiles_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developer_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_profiles" ADD CONSTRAINT "developer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_profiles" ADD CONSTRAINT "developer_profiles_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_item_id_appzone_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."appzone_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_fees" ADD CONSTRAINT "upload_fees_developer_id_developer_profiles_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developer_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_fees" ADD CONSTRAINT "upload_fees_item_id_appzone_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."appzone_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_fees" ADD CONSTRAINT "upload_fees_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_grant_scopes" ADD CONSTRAINT "support_access_grant_scopes_grant_id_support_access_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."support_access_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_members_account_user_idx" ON "account_members" USING btree ("account_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_members_one_owner_idx" ON "account_members" USING btree ("account_id") WHERE "account_members"."role" = 'owner';--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_open_email_idx" ON "invitations" USING btree ("account_id","email") WHERE "invitations"."accepted_at" is null and "invitations"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "invitations_account_idx" ON "invitations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "payments_account_idx" ON "payments" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_prices_one_active_idx" ON "plan_prices" USING btree ("plan_id","interval","currency") WHERE "plan_prices"."active";--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_current_idx" ON "subscriptions" USING btree ("account_id") WHERE "subscriptions"."status" in ('incomplete', 'trialing', 'active', 'past_due');--> statement-breakpoint
CREATE INDEX "subscriptions_account_idx" ON "subscriptions" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_objects_unique_name_idx" ON "storage_objects" USING btree ("account_id",coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("name"));--> statement-breakpoint
CREATE INDEX "storage_objects_parent_idx" ON "storage_objects" USING btree ("account_id","parent_id");--> statement-breakpoint
CREATE INDEX "storage_objects_marked_idx" ON "storage_objects" USING btree ("account_id") WHERE "storage_objects"."marked_for_deletion_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "appzone_acquisitions_account_item_idx" ON "appzone_acquisitions" USING btree ("account_id","item_id");--> statement-breakpoint
CREATE INDEX "appzone_acquisitions_limit_idx" ON "appzone_acquisitions" USING btree ("account_id") WHERE "appzone_acquisitions"."counts_toward_free_limit";--> statement-breakpoint
CREATE UNIQUE INDEX "appzone_installations_account_item_idx" ON "appzone_installations" USING btree ("account_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appzone_item_versions_item_version_idx" ON "appzone_item_versions" USING btree ("item_id","version");--> statement-breakpoint
CREATE INDEX "appzone_item_versions_review_idx" ON "appzone_item_versions" USING btree ("review_status","created_at");--> statement-breakpoint
CREATE INDEX "appzone_items_listing_idx" ON "appzone_items" USING btree ("status","kind","published_at");--> statement-breakpoint
CREATE INDEX "appzone_items_developer_idx" ON "appzone_items" USING btree ("developer_id");--> statement-breakpoint
CREATE INDEX "developer_profiles_status_idx" ON "developer_profiles" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_one_paid_idx" ON "purchases" USING btree ("account_id","item_id") WHERE "purchases"."status" = 'paid';--> statement-breakpoint
CREATE INDEX "purchases_item_idx" ON "purchases" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "conversation_participants_user_idx" ON "conversation_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_account_idx" ON "conversations" USING btree ("account_id","last_message_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "support_access_one_open_idx" ON "support_access_grants" USING btree ("account_id","requested_by") WHERE "support_access_grants"."status" in ('requested', 'approved');--> statement-breakpoint
CREATE INDEX "support_access_account_idx" ON "support_access_grants" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_open_idx" ON "support_tickets" USING btree ("created_at") WHERE "support_tickets"."status" in ('open', 'pending');--> statement-breakpoint
CREATE INDEX "support_tickets_account_idx" ON "support_tickets" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_account_idx" ON "audit_logs" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
ALTER TABLE "app_installations" ADD CONSTRAINT "app_installations_settings_object" CHECK (jsonb_typeof("app_installations"."settings") = 'object');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"));--> statement-breakpoint
-- ===== Data backfill (hand-written; runs once, inside this migration) =====
-- Plan limits from the product spec. Checked against src/lib/plans.ts by tests.
INSERT INTO "plans" ("id", "name", "storage_bytes", "team_member_limit", "free_appzone_download_limit", "is_paid", "sort_order") VALUES
  ('free',    'Free',    1073741824,   0,  10,   false, 0),
  ('starter', 'Starter', 21474836480,  1,  NULL, true,  1),
  ('plus',    'Plus',    53687091200,  3,  NULL, true,  2),
  ('pro',     'Pro',     107374182400, 10, NULL, true,  3);
--> statement-breakpoint
INSERT INTO "plan_apps" ("plan_id", "app_slug")
  SELECT p."id", a.slug FROM "plans" p CROSS JOIN (VALUES ('assistant'), ('storage'), ('calendar'), ('messages'), ('contacts')) AS a(slug);
--> statement-breakpoint
INSERT INTO "plan_apps" ("plan_id", "app_slug")
  SELECT p."id", a.slug FROM "plans" p CROSS JOIN (VALUES ('wordbase'), ('codebase'), ('spreadsheets')) AS a(slug) WHERE p."id" <> 'free';
--> statement-breakpoint
-- One workspace per non-team-member user. The account id reuses the owner's user id so existing
-- app_installations.account_id values (which held host user ids) stay valid.
INSERT INTO "accounts" ("id", "owner_user_id", "name")
  SELECT "id", "id", "name" || '''s workspace' FROM "users" WHERE "host_id" IS NULL;
--> statement-breakpoint
INSERT INTO "account_members" ("account_id", "user_id", "role")
  SELECT "id", "id", 'owner' FROM "users" WHERE "host_id" IS NULL;
--> statement-breakpoint
INSERT INTO "account_members" ("account_id", "user_id", "role", "invited_by")
  SELECT "host_id", "id", 'member', "host_id" FROM "users" WHERE "host_id" IS NOT NULL;
--> statement-breakpoint
-- Existing team members keep everyday access (the host can change this later).
INSERT INTO "member_permissions" ("member_id", "permission")
  SELECT m."id", p.perm::"member_permission"
  FROM "account_members" m
  CROSS JOIN (VALUES ('storage.view'), ('storage.upload'), ('storage.mark_for_deletion'), ('calendar.view'), ('calendar.edit'),
                     ('contacts.view'), ('contacts.edit'), ('messages.use'), ('apps.use')) AS p(perm)
  WHERE m."role" = 'member';
--> statement-breakpoint
-- Plans set directly on users (there was no billing yet) become admin-granted subscriptions.
INSERT INTO "subscriptions" ("account_id", "plan_id", "source", "status")
  SELECT "id", "plan"::text, 'admin', 'active' FROM "users" WHERE "host_id" IS NULL AND "plan" <> 'free';
--> statement-breakpoint
INSERT INTO "developer_profiles" ("user_id", "status", "display_name", "reviewed_at")
  SELECT "id", "developer_status", "name", CASE WHEN "developer_status" = 'pending' THEN NULL ELSE now() END
  FROM "users" WHERE "developer_status" <> 'none';
--> statement-breakpoint
-- Audit log is append-only: no UPDATE, DELETE or TRUNCATE, even by the app's own DB user.
CREATE FUNCTION "audit_logs_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "audit_logs_no_update_delete" BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION "audit_logs_append_only"();
--> statement-breakpoint
CREATE TRIGGER "audit_logs_no_truncate" BEFORE TRUNCATE ON "audit_logs" FOR EACH STATEMENT EXECUTE FUNCTION "audit_logs_append_only"();
