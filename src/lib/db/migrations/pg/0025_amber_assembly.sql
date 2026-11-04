-- Phase 4 — Sharing: Marketplace + Gallery + Teams (#14, #15, #19) + Stripe prereq
-- ============================================================================
-- This migration adds the schema foundation for the Phase 4 "Sharing" slice:
--
--   * #14 MCP marketplace
--       - ALTER mcp_server (curated, category, install_count, description,
--         homepage_url) + a curated/install_count compound index.
--       - New mcp_server_install (user_id, org_id, mcp_server_id, config).
--         UNIQUE (user_id, mcp_server_id) so a user can install each server
--         at most once. `org_id` is a forward reference to team(id) and
--         intentionally FK-less for now — the constraint is added when the
--         team table is created below and a follow-up migration tightens
--         things up.
--
--   * #15 Agent gallery
--       - ALTER agent (published_at, install_count, gallery_metadata,
--         cover_image_url) + a partial index on published_at for the
--         public gallery query.
--       - New agent_install (user_id, org_id, agent_id, config).
--       - New agent_view — analytics: one row per page view, no unique
--         constraint, anonymous views permitted (user_id NULL).
--
--   * #19 Team seats
--       - New team (Better Auth organization-plugin-compatible): id,
--         name, slug (UNIQUE), owner_id (FK user), plan (free|team|
--         business), Stripe customer/subscription ids, timestamps.
--       - New team_member: team_id, user_id, role (owner|admin|member|
--         viewer), UNIQUE (team_id, user_id).
--       - ALTER chat_thread, chat_message, workflow, collection, bookmark,
--         user_memory — add nullable org_id + per-table btree index.
--         NULL = personal scope. The `scopedWhere(table, userId, orgId)`
--         helper that P4.A authors will rely on these columns.
--
--   * Stripe prereq (#19)
--       - New subscription: user_id (NOT NULL), org_id (nullable),
--         stripe_subscription_id (UNIQUE), stripe_customer_id,
--         status (active|past_due|canceled|incomplete|trialing),
--         period timestamps, cancel_at_period_end, tier (free|pro|team|
--         business — matches user.tier enum), timestamps. Used by the
--         webhook that P4.B authors.
--
-- All FKs use `ON DELETE CASCADE` (or SET NULL for the nullable
-- install.org_id / view.user_id) so user / team / agent / mcp_server
-- deletion cleans up every dependent row. Every ALTER and CREATE TABLE
-- is idempotent (`IF NOT EXISTS` / `IF EXISTS`) so this migration is
-- safe to replay against a partially-applied database.
--
-- Naming: Drizzle-style snake_case column names with `gen_random_uuid()`
-- primary keys, matching the conventions established in 0020-0024.
-- ============================================================================--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- #14 — MCP marketplace
-- ----------------------------------------------------------------------------

ALTER TABLE "mcp_server"
  ADD COLUMN IF NOT EXISTS "curated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_server"
  ADD COLUMN IF NOT EXISTS "category" varchar(64);--> statement-breakpoint
ALTER TABLE "mcp_server"
  ADD COLUMN IF NOT EXISTS "install_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_server"
  ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "mcp_server"
  ADD COLUMN IF NOT EXISTS "homepage_url" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_server_curated_idx" ON "mcp_server" USING btree ("curated","install_count" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_server_category_idx" ON "mcp_server" USING btree ("category");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mcp_server_install" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	-- Forward reference to team(id); the FK is added once team rows exist
	-- (see Risks in context.md). Plain uuid for now.
	"org_id" uuid,
	"mcp_server_id" uuid NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "mcp_server_install_user_id_mcp_server_id_unique" UNIQUE("user_id","mcp_server_id")
);
--> statement-breakpoint

ALTER TABLE "mcp_server_install" ADD CONSTRAINT "mcp_server_install_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_server_install" ADD CONSTRAINT "mcp_server_install_mcp_server_id_mcp_server_id_fk" FOREIGN KEY ("mcp_server_id") REFERENCES "public"."mcp_server"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_server_install_user_id_idx" ON "mcp_server_install" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_server_install_mcp_server_id_idx" ON "mcp_server_install" USING btree ("mcp_server_id");--> statement-breakpoint
CREATE INDEX "mcp_server_install_org_id_idx" ON "mcp_server_install" USING btree ("org_id");--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- #15 — Agent gallery
-- ----------------------------------------------------------------------------

ALTER TABLE "agent"
  ADD COLUMN IF NOT EXISTS "published_at" timestamp;--> statement-breakpoint
ALTER TABLE "agent"
  ADD COLUMN IF NOT EXISTS "install_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent"
  ADD COLUMN IF NOT EXISTS "gallery_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "agent"
  ADD COLUMN IF NOT EXISTS "cover_image_url" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_published_idx" ON "agent" USING btree ("published_at" DESC) WHERE "published_at" IS NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agent_install" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid,
	"agent_id" uuid NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "agent_install_user_id_agent_id_unique" UNIQUE("user_id","agent_id")
);
--> statement-breakpoint

ALTER TABLE "agent_install" ADD CONSTRAINT "agent_install_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_install" ADD CONSTRAINT "agent_install_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_install_user_id_idx" ON "agent_install" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_install_agent_id_idx" ON "agent_install" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_install_org_id_idx" ON "agent_install" USING btree ("org_id");--> statement-breakpoint

-- One row per page view. Anonymous views allowed (user_id NULL with
-- ON DELETE SET NULL). No unique constraint — high-volume append-only.
CREATE TABLE IF NOT EXISTS "agent_view" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" uuid,
	"viewed_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"referrer" text
);
--> statement-breakpoint

ALTER TABLE "agent_view" ADD CONSTRAINT "agent_view_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_view" ADD CONSTRAINT "agent_view_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_view_agent_id_viewed_at_idx" ON "agent_view" USING btree ("agent_id","viewed_at" DESC);--> statement-breakpoint
CREATE INDEX "agent_view_user_id_idx" ON "agent_view" USING btree ("user_id");--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- #19 — Team seats
-- ----------------------------------------------------------------------------
-- `team` is Better Auth organization-plugin-compatible. `slug` is the
-- URL-safe handle (e.g. `acme-co`). `plan` is application-side enum'd
-- (free | team | business). `stripe_customer_id` / `stripe_subscription_id`
-- are nullable — a team is created on signup and Stripe is wired later.

CREATE TABLE IF NOT EXISTS "team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"owner_id" uuid NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "team_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "team_member_team_id_user_id_unique" UNIQUE("team_id","user_id")
);
--> statement-breakpoint

ALTER TABLE "team" ADD CONSTRAINT "team_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_plan_check" CHECK ("plan" IN ('free','team','business')) NOT VALID;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_role_check" CHECK ("role" IN ('owner','admin','member','viewer')) NOT VALID;--> statement-breakpoint
CREATE INDEX "team_owner_id_idx" ON "team" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "team_plan_idx" ON "team" USING btree ("plan");--> statement-breakpoint
CREATE INDEX "team_member_user_id_idx" ON "team_member" USING btree ("user_id");--> statement-breakpoint

-- Now that the `team` table exists, add the org_id FKs to the install
-- tables that were intentionally omitted above. The forward reference
-- is no longer a forward reference.
ALTER TABLE "mcp_server_install" ADD CONSTRAINT "mcp_server_install_org_id_team_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_install" ADD CONSTRAINT "agent_install_org_id_team_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Sprinkled org_id columns. NULL = personal scope. These are nullable
-- so the migration is a no-op for existing rows; the scopedWhere helper
-- in P4.A treats NULL as "user-owned".
ALTER TABLE "chat_thread"
  ADD COLUMN IF NOT EXISTS "org_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_message"
  ADD COLUMN IF NOT EXISTS "org_id" uuid;--> statement-breakpoint
ALTER TABLE "workflow"
  ADD COLUMN IF NOT EXISTS "org_id" uuid;--> statement-breakpoint
ALTER TABLE "collection"
  ADD COLUMN IF NOT EXISTS "org_id" uuid;--> statement-breakpoint
ALTER TABLE "bookmark"
  ADD COLUMN IF NOT EXISTS "org_id" uuid;--> statement-breakpoint
ALTER TABLE "user_memory"
  ADD COLUMN IF NOT EXISTS "org_id" uuid;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_thread_org_id_idx" ON "chat_thread" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_message_org_id_idx" ON "chat_message" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_org_id_idx" ON "workflow" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collection_org_id_idx" ON "collection" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookmark_org_id_idx" ON "bookmark" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_memory_org_id_idx" ON "user_memory" USING btree ("org_id");--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Stripe prereq (#19) — `subscription` table for the webhook that P4.B authors
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid,
	"stripe_subscription_id" text NOT NULL UNIQUE,
	"stripe_customer_id" text NOT NULL,
	"stripe_price_id" text,
	"status" text NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint

ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_org_id_team_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_status_check" CHECK ("status" IN ('active','past_due','canceled','incomplete','trialing')) NOT VALID;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_tier_check" CHECK ("tier" IN ('free','pro','team','business')) NOT VALID;--> statement-breakpoint
CREATE INDEX "subscription_user_id_idx" ON "subscription" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscription_org_id_idx" ON "subscription" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "subscription_status_idx" ON "subscription" USING btree ("status");--> statement-breakpoint
