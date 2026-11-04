-- Phase 3.4 — Webhook signing secret plaintext column
-- ============================================================================
-- P3.0's `webhook_subscription` table only stored a `secret_hash` — a one-way
-- HMAC of the signing secret suitable for verification, but NOT for signing.
-- A worker that needs to sign outbound webhooks (P3.4) requires the plaintext
-- secret. Storing it in plaintext is a known limitation: encrypt-at-rest is
-- deferred to a Phase 4+ hardening pass. For Phase 3 we accept the risk in
-- exchange for shipping the outbox worker.
--
-- This migration is replay-safe (`IF NOT EXISTS` on the ALTER) and additive
-- only — no data is migrated. Existing subscriptions have `signing_secret =
-- NULL`, which the worker treats as "skip this subscription" until a secret
-- is provisioned (a future P3.4 dashboard flow will populate it).
-- ============================================================================--> statement-breakpoint

ALTER TABLE "webhook_subscription"
  ADD COLUMN IF NOT EXISTS "signing_secret" text;
