-- Migration: add is_paused column to user_connector
-- Allows pausing a connector without losing tokens or fully disconnecting.
-- Pause preserves isConnected=true so resume restores without re-OAuth.
BEGIN;

DO $$
BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'google-calendar';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE user_connector
ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN user_connector.is_paused IS
  'When true, connector is paused (tokens retained, not usable). Resume re-enables without re-OAuth.';

COMMIT;