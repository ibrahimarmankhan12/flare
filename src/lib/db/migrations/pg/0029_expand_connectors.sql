-- Migration: expand `connector_provider` enum with 42 new providers.
-- Mirrors the canonical list in `src/lib/connectors/providers-list.ts` and the
-- `provider` enum in `src/lib/db/pg/schema.pg.ts`.
--
-- `ALTER TYPE ... ADD VALUE` cannot run inside a multi-statement transaction
-- in older PG versions, so we wrap each value in a DO block that swallows the
-- duplicate-object error. Same pattern as 0027_connector_pause.sql.
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'confluence';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'jira';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'linear';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'asana';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'clickup';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'productboard';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'testrail';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'coda';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'outline';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'slab';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'guru';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'highspot';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'document360';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'gitlab';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'bitbucket';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'dropbox';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'zendesk';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'freshdesk';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'salesforce';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'hubspot';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'airtable';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'gong';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'egnyte';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'teams';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'discord';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'bookstack';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'gitbook';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'canvas';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'loopio';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'discourse';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'xenforo';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'drupal-wiki';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'axero';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'zulip';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'mediawiki';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'fireflies';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'wikipedia';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
