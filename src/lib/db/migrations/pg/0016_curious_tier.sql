ALTER TABLE "user"
ADD COLUMN IF NOT EXISTS "tier" varchar(64) DEFAULT 'flare-smart' NOT NULL;--> statement-breakpoint

UPDATE "user"
SET "tier" = 'flare-smart'
WHERE "tier" IS NULL;--> statement-breakpoint
