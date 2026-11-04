ALTER TABLE "user"
ALTER COLUMN "tier" SET DEFAULT 'free';--> statement-breakpoint

UPDATE "user"
SET "tier" = 'free';--> statement-breakpoint
