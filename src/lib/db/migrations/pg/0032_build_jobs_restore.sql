-- Restore build_job for the E2B Build feature.
--
-- History: created by 0018_build_jobs, dropped by 0019_drop_build_jobs when
-- the Build feature was removed (2026-05-23). The E2B integration is being
-- rebuilt, so the table comes back. Schema is 0018's, plus two columns the
-- original lacked:
--   sandbox_id         - E2B sandbox handle, required to reconnect to a
--                        running sandbox instead of rebuilding from scratch
--                        (the old implementation had recurring "workspace
--                        reopen" problems, see context.md 2026-05-16/17).
--   sandbox_expires_at - when the sandbox is expected to be reclaimed, so
--                        the UI can show staleness and a reaper can clean up
--                        orphans rather than letting them bill silently.
--
-- Idempotent (IF NOT EXISTS + duplicate_object guards) so a re-run cannot
-- repeat the 0030 failure loop.

CREATE TABLE IF NOT EXISTS "build_job" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"assistant_message_id" text,
	"tool_call_id" text,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"prompt" text NOT NULL,
	"framework" varchar(32),
	"title" text,
	"summary" text,
	"files" json DEFAULT '[]'::json,
	"preview_url" text,
	"sandbox_id" text,
	"sandbox_expires_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "build_job" ADD CONSTRAINT "build_job_user_id_user_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "build_job" ADD CONSTRAINT "build_job_thread_id_chat_thread_id_fk"
		FOREIGN KEY ("thread_id") REFERENCES "public"."chat_thread"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
-- Columns are added separately so the migration also upgrades an existing
-- 0018-era table rather than only working on a clean create.
ALTER TABLE "build_job" ADD COLUMN IF NOT EXISTS "sandbox_id" text;
--> statement-breakpoint
ALTER TABLE "build_job" ADD COLUMN IF NOT EXISTS "sandbox_expires_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "build_job_thread_id_idx" ON "build_job" ("thread_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "build_job_user_id_idx" ON "build_job" ("user_id");
--> statement-breakpoint
-- Reaper lookup: find live sandboxes that are due for cleanup.
CREATE INDEX IF NOT EXISTS "build_job_sandbox_active_idx"
	ON "build_job" ("sandbox_expires_at") WHERE "sandbox_id" IS NOT NULL;
