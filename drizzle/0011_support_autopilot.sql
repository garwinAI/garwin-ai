CREATE TYPE "public"."assistant_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TABLE "assistant_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"role" "assistant_role" NOT NULL,
	"text" text NOT NULL,
	"commit_sha" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_chat_text_length" CHECK (length("assistant_chat_messages"."text") between 1 and 20000)
);
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assistant_chat_messages" ADD CONSTRAINT "assistant_chat_messages_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_chat_admin_idx" ON "assistant_chat_messages" USING btree ("admin_id","created_at");