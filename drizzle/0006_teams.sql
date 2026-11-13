CREATE TYPE "public"."invitation_channel" AS ENUM('email', 'sms');--> statement-breakpoint
ALTER TABLE "account_members" DROP CONSTRAINT "account_members_user_id_unique";--> statement-breakpoint
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_email_lowercase";--> statement-breakpoint
DROP INDEX "invitations_open_email_idx";--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "active_account_id" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "channel" "invitation_channel" DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "phone" text;--> statement-breakpoint
CREATE UNIQUE INDEX "account_members_one_owned_idx" ON "account_members" USING btree ("user_id") WHERE "account_members"."role" = 'owner';--> statement-breakpoint
CREATE INDEX "account_members_user_idx" ON "account_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_open_phone_idx" ON "invitations" USING btree ("account_id","phone") WHERE "invitations"."accepted_at" is null and "invitations"."revoked_at" is null and "invitations"."phone" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_open_email_idx" ON "invitations" USING btree ("account_id","email") WHERE "invitations"."accepted_at" is null and "invitations"."revoked_at" is null and "invitations"."email" is not null;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_channel_target" CHECK (("invitations"."channel" = 'email' and "invitations"."email" is not null and "invitations"."phone" is null) or ("invitations"."channel" = 'sms' and "invitations"."phone" is not null and "invitations"."email" is null));--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_phone_e164" CHECK ("invitations"."phone" is null or "invitations"."phone" ~ '^[+][1-9][0-9]{7,14}$');--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_email_lowercase" CHECK ("invitations"."email" is null or "invitations"."email" = lower("invitations"."email"));--> statement-breakpoint
-- Declared here rather than in Drizzle to avoid a circular import between auth.ts and accounts.ts.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_account_id_accounts_id_fk" FOREIGN KEY ("active_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
