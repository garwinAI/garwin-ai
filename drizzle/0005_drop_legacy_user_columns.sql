ALTER TABLE "users" DROP CONSTRAINT "users_host_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "app_installations" DROP CONSTRAINT "app_installations_account_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "users_host_idx";--> statement-breakpoint
ALTER TABLE "app_installations" ADD CONSTRAINT "app_installations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "plan";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "host_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "developer_status";--> statement-breakpoint
DROP TYPE "public"."plan_tier";