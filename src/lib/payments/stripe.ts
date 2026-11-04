import "server-only";

import type { SubscriptionTierName } from "app-types/subscription";
import Stripe from "stripe";

// ---------------------------------------------------------------------------
// P4.B — Stripe helper module
// ---------------------------------------------------------------------------
// Pure helpers for the Stripe integration. No I/O, no DB access — the webhook
// route owns persistence. The 4-tier enum (`free | pro | team | business`)
// matches the `subscription.tier` CHECK constraint added in migration 0025
// (P4.0). The 5-status enum matches the `subscription.status` CHECK.
// ---------------------------------------------------------------------------

/**
 * The 4-tier enum that the Stripe webhook writes to `subscription.tier`
 * and the denormalized `user.tier`. Re-exported so callers (webhook
 * route, tests) don't have to import the same literal twice.
 */
export type StripeSubscriptionTier = "free" | "pro" | "team" | "business";

/**
 * The 5-status enum the Stripe webhook writes to `subscription.status`.
 * Mirrors `subscriptionRepository.SubscriptionStatus` but is re-declared
 * here to avoid pulling the repository into the client bundle.
 */
export type StripeSubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "trialing";

/**
 * Mapping of internal 4-tier to the Flare 6-tier that `user.tier`
 * accepts. The user.tier column is a `varchar` with
 * `SUBSCRIPTION_TIER_VALUES` (free, flare-pro, flare-max,
 * flare-enterprises, flare-enterprises-pro, flare-enterprises-max),
 * so the webhook must coerce 4-tier into one of those values. We
 * pick the lowest-cost Flare tier that covers the billing class:
 *   free       -> free
 *   pro        -> flare-pro
 *   team       -> flare-enterprises
 *   business   -> flare-enterprises-max
 */
const STRIPE_TIER_TO_USER_TIER: Record<
  StripeSubscriptionTier,
  SubscriptionTierName
> = {
  free: "free",
  pro: "flare-pro",
  team: "flare-enterprises",
  business: "flare-enterprises-max",
};

export const mapStripeTierToUserTier = (
  tier: StripeSubscriptionTier,
): SubscriptionTierName => STRIPE_TIER_TO_USER_TIER[tier];

// ---------------------------------------------------------------------------
// Stripe SDK singleton
// ---------------------------------------------------------------------------

let cachedClient: Stripe | null = null;

/**
 * Lazily build a Stripe client. We memoize per-process so the
 * route handlers don't re-instantiate the SDK on every request.
 * The `apiVersion` is pinned to the SDK's default at the version
 * we depend on — pinning explicitly is brittle and we prefer the
 * SDK's "Stripe will pick the right version for your account" behavior.
 */
export const getStripeClient = (): Stripe => {
  if (cachedClient) return cachedClient;
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY in the environment.",
    );
  }
  cachedClient = new Stripe(secret, {
    typescript: true,
    appInfo: {
      name: "Flare AI",
      version: "1.0.0",
    },
  });
  return cachedClient;
};

/** Reset the cached client — only used by tests. */
export const __resetStripeClientForTests = (): void => {
  cachedClient = null;
};

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

/**
 * Verify the `stripe-signature` header against the raw request body
 * and the configured webhook signing secret. Throws
 * `Stripe.errors.StripeSignatureVerificationError` (or a generic
 * `Error` for missing headers) on any failure. The webhook route
 * catches both and returns HTTP 400.
 */
export const verifyStripeWebhookSignature = (
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Stripe.Event => {
  if (!signatureHeader) {
    // Mirror the Stripe SDK's own "missing header" error when the
    // SDK/test shim exposes it; fall back to a generic Error for
    // Stripe SDK versions that do not export NoSignatureError.
    const noSignatureError = (
      Stripe as unknown as {
        errors?: {
          NoSignatureError?: new (message: string, header: string) => Error;
        };
      }
    ).errors?.NoSignatureError;
    if (noSignatureError) {
      throw new noSignatureError(
        "No stripe-signature header value was provided.",
        "stripe-signature",
      );
    }
    throw new Error("No stripe-signature header value was provided.");
  }
  const client = getStripeClient();
  return client.webhooks.constructEvent(rawBody, signatureHeader, secret);
};

// ---------------------------------------------------------------------------
// Price ID → internal tier mapping
// ---------------------------------------------------------------------------

/**
 * The set of env-var names that map to each tier. We read these at
 * call time so tests can override `process.env` between cases.
 */
const PRICE_ENV: Record<Exclude<StripeSubscriptionTier, "free">, string> = {
  pro: "STRIPE_PRICE_PRO",
  team: "STRIPE_PRICE_TEAM",
  business: "STRIPE_PRICE_BUSINESS",
};

/**
 * Build the reverse lookup (price ID -> tier) from the current
 * `process.env`. `free` is not a Stripe price — a null/undefined
 * price ID always maps to the free tier.
 */
const buildPriceToTierMap = (): Map<string, StripeSubscriptionTier> => {
  const map = new Map<string, StripeSubscriptionTier>();
  for (const [tier, envName] of Object.entries(PRICE_ENV) as Array<
    [Exclude<StripeSubscriptionTier, "free">, string]
  >) {
    const priceId = process.env[envName];
    if (priceId && priceId.trim().length > 0) {
      map.set(priceId.trim(), tier);
    }
  }
  return map;
};

/**
 * Map a Stripe price ID to the internal 4-tier enum. A null/empty
 * price ID always returns `"free"` (no paid plan). An unknown
 * price ID throws so a misconfigured deployment is caught at
 * webhook time, not silently demoted to free.
 */
export const mapStripeSubscriptionToTier = (
  stripePriceId: string | null | undefined,
): StripeSubscriptionTier => {
  if (!stripePriceId) return "free";
  const trimmed = stripePriceId.trim();
  if (trimmed.length === 0) return "free";
  const map = buildPriceToTierMap();
  const tier = map.get(trimmed);
  if (!tier) {
    throw new Error(
      `Unknown Stripe price ID: ${trimmed}. Set STRIPE_PRICE_PRO, STRIPE_PRICE_TEAM, or STRIPE_PRICE_BUSINESS in the environment.`,
    );
  }
  return tier;
};

/**
 * The inverse of `mapStripeSubscriptionToTier` — returns the
 * Stripe price ID for an internal tier, or null if the tier has
 * no configured price (i.e. `free` or an unset env var).
 */
export const getStripePriceIdForTier = (
  tier: StripeSubscriptionTier,
): string | null => {
  if (tier === "free") return null;
  const envName = PRICE_ENV[tier];
  const priceId = process.env[envName];
  if (!priceId || priceId.trim().length === 0) return null;
  return priceId.trim();
};

// ---------------------------------------------------------------------------
// Stripe status → internal status mapping
// ---------------------------------------------------------------------------

const STRIPE_STATUS_MAP: Record<
  Stripe.Subscription.Status,
  StripeSubscriptionStatus
> = {
  active: "active",
  canceled: "canceled",
  incomplete: "incomplete",
  incomplete_expired: "canceled", // terminal — treat as canceled
  past_due: "past_due",
  paused: "incomplete", // paused plans can't serve; surface as incomplete
  trialing: "trialing",
  unpaid: "past_due", // unpaid is a flavor of past-due from our perspective
};

/**
 * Map a Stripe subscription status to the internal 5-status enum.
 * Throws on a status that doesn't exist in the Stripe SDK's type
 * union (e.g. a future version adding a new state we don't know).
 */
export const mapStripeStatusToInternal = (
  stripeStatus: Stripe.Subscription.Status,
): StripeSubscriptionStatus => {
  const mapped = STRIPE_STATUS_MAP[stripeStatus];
  if (!mapped) {
    throw new Error(`Unknown Stripe subscription status: ${stripeStatus}`);
  }
  return mapped;
};

// ---------------------------------------------------------------------------
// Helpers used by the checkout / portal routes
// ---------------------------------------------------------------------------

/**
 * Resolve the public app base URL (used for Stripe Checkout return
 * URLs and the billing portal). Centralized so the webhook can
 * verify that Stripe-returned URLs match a known origin in the
 * future (Phase 5 hardening).
 */
export const getStripeAppBaseUrl = (): string => {
  const explicit = process.env.FLARE_AUTH_URL;
  if (explicit && explicit.length > 0) return explicit.replace(/\/$/, "");
  const nextPublic = process.env.NEXT_PUBLIC_BASE_URL;
  if (nextPublic && nextPublic.length > 0) return nextPublic.replace(/\/$/, "");
  // Last-resort local dev fallback. Stripe will reject http:// return
  // URLs in live mode; the routes that call this return 500 if the
  // explicit env var is missing.
  return "http://localhost:3000";
};
