-- Phase 3 — Automation: Scheduler + Triggers + Webhooks (#11, #12, #24)
-- ============================================================================
-- This migration adds the schema foundation for three features that all share
-- a common worker/outbox code path:
--
--   * #11 Scheduled agents   — `scheduled_job` + `scheduled_run`
--   * #12 Inbound triggers   — `inbound_endpoint` + `inbound_delivery`
--   * #24 REST & webhooks    — `api_key`, `webhook_subscription`,
--                               `webhook_event_outbox`, `webhook_delivery`
--
-- All eight tables are user-owned (except the outbox / delivery tables which
-- are worker-owned, but are still scoped through subscriptions or jobs to a
-- user). Foreign keys use `ON DELETE CASCADE` so user deletion cleans up
-- every dependent row. Every CREATE TABLE is `IF NOT EXISTS` so this
-- migration is safe to replay against a partially-applied database.
--
-- Naming: Drizzle-style snake_case column names with `gen_random_uuid()`
-- primary keys, matching the conventions established in 0020-0022.
-- ============================================================================--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "scheduled_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"name" text NOT NULL,
	"cron" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheduled_job_id" uuid NOT NULL,
	"started_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"completed_at" timestamp,
	"status" text DEFAULT 'running' NOT NULL,
	"output" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbound_endpoint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"token" text NOT NULL UNIQUE,
	"secret_hash" text,
	"kind" text NOT NULL,
	"thread_template" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbound_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inbound_endpoint_id" uuid NOT NULL,
	"received_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"error" text,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "api_key_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"url" text NOT NULL,
	"event_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"secret_hash" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_event_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "webhook_delivery_event_subscription_unique" UNIQUE("event_id","subscription_id")
);
--> statement-breakpoint

-- Foreign keys. All `ON DELETE CASCADE` so user / parent deletion cleans up
-- dependent rows in one shot. The worker / outbox tables are intentionally
-- NOT cascaded to a user — they hold cross-cutting traffic that lives
-- independently of the subscription or job that produced them.
ALTER TABLE "scheduled_job" ADD CONSTRAINT "scheduled_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_job" ADD CONSTRAINT "scheduled_job_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_run" ADD CONSTRAINT "scheduled_run_scheduled_job_id_scheduled_job_id_fk" FOREIGN KEY ("scheduled_job_id") REFERENCES "public"."scheduled_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_endpoint" ADD CONSTRAINT "inbound_endpoint_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_endpoint" ADD CONSTRAINT "inbound_endpoint_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_delivery" ADD CONSTRAINT "inbound_delivery_inbound_endpoint_id_inbound_endpoint_id_fk" FOREIGN KEY ("inbound_endpoint_id") REFERENCES "public"."inbound_endpoint"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_subscription" ADD CONSTRAINT "webhook_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_event_outbox" ADD CONSTRAINT "webhook_event_outbox_kind_check" CHECK ("kind" IN ('inbound','outbound')) NOT VALID;--> statement-breakpoint
ALTER TABLE "webhook_event_outbox" ADD CONSTRAINT "webhook_event_outbox_status_check" CHECK ("status" IN ('pending','delivering','delivered','failed')) NOT VALID;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_event_id_webhook_event_outbox_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."webhook_event_outbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_subscription_id_webhook_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."webhook_subscription"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Indexes
CREATE INDEX "scheduled_job_status_next_run_at_idx" ON "scheduled_job" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE INDEX "scheduled_job_user_id_idx" ON "scheduled_job" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scheduled_run_scheduled_job_id_idx" ON "scheduled_run" USING btree ("scheduled_job_id");--> statement-breakpoint
CREATE INDEX "scheduled_run_status_started_at_idx" ON "scheduled_run" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "inbound_endpoint_user_id_idx" ON "inbound_endpoint" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "inbound_endpoint_kind_enabled_idx" ON "inbound_endpoint" USING btree ("kind","enabled");--> statement-breakpoint
CREATE INDEX "inbound_delivery_inbound_endpoint_id_idx" ON "inbound_delivery" USING btree ("inbound_endpoint_id");--> statement-breakpoint
CREATE INDEX "inbound_delivery_status_received_at_idx" ON "inbound_delivery" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "api_key_user_id_idx" ON "api_key" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_key_prefix_idx" ON "api_key" USING btree ("prefix");--> statement-breakpoint
CREATE INDEX "webhook_subscription_user_id_idx" ON "webhook_subscription" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "webhook_subscription_enabled_idx" ON "webhook_subscription" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "webhook_event_outbox_status_next_attempt_at_idx" ON "webhook_event_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "webhook_event_outbox_event_type_idx" ON "webhook_event_outbox" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "webhook_event_outbox_kind_idx" ON "webhook_event_outbox" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "webhook_delivery_event_id_idx" ON "webhook_delivery" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_subscription_id_idx" ON "webhook_delivery" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_status_idx" ON "webhook_delivery" USING btree ("status");
