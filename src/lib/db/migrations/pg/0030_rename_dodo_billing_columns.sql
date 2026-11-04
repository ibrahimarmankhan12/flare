-- Migration: rename Dodo subscription billing columns to match the
-- field names Dodo's API actually returns.
--
-- Dodo's `GET /subscriptions/{id}` response uses:
--   previous_billing_date   (start of current billing period)
--   next_billing_date       (end of current billing period)
--   cancel_at_next_billing_date
--
-- Our `dodo_subscription` table had generic names from a different
-- provider's convention. Aligning the column names to the source of
-- truth (Dodo's response shape) means the data we read on the profile
-- page is actually populated, and the next person to touch this code
-- doesn't have to guess why the field names don't match the docs.
--
-- The Stripe-side `subscription` table is left untouched — Stripe
-- genuinely uses `current_period_start` / `current_period_end` /
-- `cancel_at_period_end` as the response field names, so the columns
-- on that table are correctly named.
--
-- The rename is atomic per column; PG handles each RENAME inline.
-- All existing data is preserved (rename is metadata-only in PG).

ALTER TABLE "dodo_subscription" RENAME COLUMN "current_period_start" TO "previous_billing_date";
ALTER TABLE "dodo_subscription" RENAME COLUMN "current_period_end" TO "next_billing_date";
ALTER TABLE "dodo_subscription" RENAME COLUMN "cancel_at_period_end" TO "cancel_at_next_billing_date";
