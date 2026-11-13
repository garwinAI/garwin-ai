ALTER TABLE "conversations" ADD COLUMN "channel_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_channel_idx" ON "conversations" USING btree ("account_id","channel_key");--> statement-breakpoint
-- Backfill: any existing team conversations become their account's team-wide chat (oldest wins);
-- extras get a unique legacy key so the new constraints hold.
UPDATE "conversations" c SET "channel_key" = CASE
  WHEN c."id" = (SELECT c2."id" FROM "conversations" c2 WHERE c2."account_id" = c."account_id" AND c2."kind" = 'team' ORDER BY c2."created_at", c2."id" LIMIT 1) THEN 'all'
  ELSE 'legacy:' || c."id" END
WHERE c."kind" = 'team' AND c."channel_key" IS NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_team_has_channel" CHECK ("conversations"."kind" <> 'team' or "conversations"."channel_key" is not null);