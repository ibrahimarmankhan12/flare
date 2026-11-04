-- Phase 5 — External surface: Widget + API hardening (#16, #24 hardening)
-- ============================================================================
-- Schema foundation only: embeddable anonymous chat sessions, API-key usage
-- accounting, generic rate-limit buckets, API-key rotation metadata, and
-- webhook subscription health counters. Application routes, JWT auth, CSP, and
-- UI are owned by later Phase 5 agents.
-- ============================================================================--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "embed_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" uuid,
	"anonymous_token" text NOT NULL UNIQUE,
	"rate_limit_tier" text DEFAULT 'free' NOT NULL,
	"daily_message_count" integer DEFAULT 0 NOT NULL,
	"daily_reset_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"first_message_captcha_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "embed_session" ADD CONSTRAINT "embed_session_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "embed_session" ADD CONSTRAINT "embed_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "embed_session" ADD CONSTRAINT "embed_session_rate_limit_tier_check" CHECK ("rate_limit_tier" IN ('free','pro','team','business')) NOT VALID;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embed_session_agent_id_idx" ON "embed_session" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embed_session_anonymous_token_idx" ON "embed_session" USING btree ("anonymous_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embed_session_expires_at_idx" ON "embed_session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embed_session_revoked_at_idx" ON "embed_session" USING btree ("revoked_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "api_key_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"route" text NOT NULL,
	"method" text NOT NULL,
	"status" integer NOT NULL,
	"cost_units" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "api_key_usage" ADD CONSTRAINT "api_key_usage_api_key_id_api_key_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_key"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "api_key_usage" ADD CONSTRAINT "api_key_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_usage_api_key_id_created_at_idx" ON "api_key_usage" USING btree ("api_key_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_usage_user_id_created_at_idx" ON "api_key_usage" USING btree ("user_id","created_at" DESC);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "api_rate_limit_bucket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL UNIQUE,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "api_rate_limit_bucket_reset_at_idx" ON "api_rate_limit_bucket" USING btree ("reset_at");--> statement-breakpoint

ALTER TABLE "api_key"
	ADD COLUMN IF NOT EXISTS "rotated_from_key_id" uuid;--> statement-breakpoint
ALTER TABLE "api_key"
	ADD COLUMN IF NOT EXISTS "rotation_grace_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "api_key"
	ADD COLUMN IF NOT EXISTS "last_four" text;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "api_key" ADD CONSTRAINT "api_key_rotated_from_key_id_api_key_id_fk" FOREIGN KEY ("rotated_from_key_id") REFERENCES "public"."api_key"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_rotated_from_key_id_idx" ON "api_key" USING btree ("rotated_from_key_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_key_rotation_grace_ends_at_idx" ON "api_key" USING btree ("rotation_grace_ends_at");--> statement-breakpoint

ALTER TABLE "webhook_subscription"
	ADD COLUMN IF NOT EXISTS "failure_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_subscription"
	ADD COLUMN IF NOT EXISTS "last_success_at" timestamp;--> statement-breakpoint
ALTER TABLE "webhook_subscription"
	ADD COLUMN IF NOT EXISTS "last_failure_at" timestamp;--> statement-breakpoint
ALTER TABLE "webhook_subscription"
	ADD COLUMN IF NOT EXISTS "last_failure_reason" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_subscription_user_id_enabled_idx" ON "webhook_subscription" USING btree ("user_id","enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_subscription_failure_count_idx" ON "webhook_subscription" USING btree ("failure_count");--> statement-breakpoint
