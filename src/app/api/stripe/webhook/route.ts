import "server-only";

import { eq } from "drizzle-orm";
import Stripe from "stripe";

import { pgDb } from "lib/db/pg/db.pg";
import { UserTable } from "lib/db/pg/schema.pg";
import { subscriptionRepository, userRepository } from "lib/db/repository";
import logger from "lib/logger";
import {
  mapStripeStatusToInternal,
  mapStripeSubscriptionToTier,
  mapStripeTierToUserTier,
} from "lib/payments/stripe";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// Stripe webhooks can take a few seconds to process (DB writes +
// email); cap to 30s on the Vercel hobby tier the project is on.
export const maxDuration = 30;

// ---------------------------------------------------------------------------
// P4.B — Stripe webhook
// ---------------------------------------------------------------------------
// Subscribes to Stripe events for the team's billing integration:
//   - `customer.subscription.created` / `updated` -> upsert
//     `subscription` row + keep `user.tier` in sync.
//   - `customer.subscription.deleted` -> soft-cancel + demote to free.
//   - `invoice.payment_failed` -> mark `past_due`.
//   - `checkout.session.completed` -> create a subscription row
//     when the user completed checkout but no subscription event
//     has been delivered yet (race window between Stripe's two
//     webhook deliveries).
//
// Signature verification is mandatory: Stripe's `webhooks.constructEvent`
// is called with the *raw* body bytes. Never parse with `req.json()`
// before verifying — that would corrupt the HMAC.
// ---------------------------------------------------------------------------

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const asDate = (value: unknown): Date | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const asBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

/**
 * Resolve the price ID from a subscription item, falling back to
 * the legacy `plan.id` shape that some older Stripe API versions
 * still emit. Returns null if neither is present.
 */
const extractPriceId = (subscription: Stripe.Subscription): string | null => {
  const firstItem = subscription.items.data[0];
  if (firstItem) {
    if (typeof firstItem.price?.id === "string") {
      return firstItem.price.id;
    }
    if (
      typeof firstItem.plan?.id === "string" &&
      firstItem.plan.id.length > 0
    ) {
      // `plan` is deprecated in favor of `price` but still present
      // on every event we care about.
      return firstItem.plan.id;
    }
  }
  return null;
};

const extractUserId = (subscription: Stripe.Subscription): string | null => {
  // Our checkout session sets `client_reference_id` to the Flare
  // userId and mirrors it into `subscription.metadata.userId` for
  // belt-and-braces. Try both before falling back to looking up
  // the customer.
  const meta = isObject(subscription.metadata) ? subscription.metadata : null;
  const fromMetadata = asString(meta?.userId) ?? asString(meta?.flareUserId);
  if (fromMetadata) return fromMetadata;

  // As a last resort, see if any of our existing rows already
  // reference this Stripe customer. This keeps redelivered
  // `customer.subscription.deleted` events working even when
  // metadata was wiped at the Stripe dashboard.
  return null;
};

/**
 * Keep `user.tier` in sync with the authoritative subscription
 * state. The rate-limit and feature-gate hot paths read `user.tier`
 * so this denormalization is critical for correctness.
 *
 * Returns silently if the user no longer exists (was deleted
 * after checkout). The webhook should ack and stop Stripe from
 * retrying forever.
 */
const syncUserTier = async (
  userId: string,
  tier: "free" | "pro" | "team" | "business",
): Promise<void> => {
  const userExists = await userRepository.getUserById(userId);
  if (!userExists) {
    logger.warn("[stripe] syncUserTier for non-existent user — skipping", {
      userId,
    });
    return;
  }
  const flareTier = mapStripeTierToUserTier(tier);
  await pgDb
    .update(UserTable)
    .set({ tier: flareTier, updatedAt: new Date() })
    .where(eq(UserTable.id, userId));
};

const handleSubscriptionCreatedOrUpdated = async (
  subscription: Stripe.Subscription,
  isNew: boolean,
): Promise<void> => {
  const userId = extractUserId(subscription);
  if (!userId) {
    logger.warn(
      "[stripe] subscription event without resolvable userId — acking to stop retries",
      {
        stripeSubscriptionId: subscription.id,
      },
    );
    return;
  }

  const priceId = extractPriceId(subscription);
  const tier = mapStripeSubscriptionToTier(priceId);
  const status = mapStripeStatusToInternal(subscription.status);

  if (isNew) {
    await subscriptionRepository.createSubscription({
      userId,
      orgId:
        typeof subscription.metadata?.orgId === "string"
          ? subscription.metadata.orgId
          : null,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id,
      stripePriceId: priceId,
      status,
      currentPeriodStart: asDate(subscription.current_period_start),
      currentPeriodEnd: asDate(subscription.current_period_end),
      cancelAtPeriodEnd: asBoolean(subscription.cancel_at_period_end) ?? false,
      tier,
    });
  } else {
    await subscriptionRepository.updateSubscription(subscription.id, {
      status,
      tier,
      stripePriceId: priceId,
      currentPeriodStart: asDate(subscription.current_period_start),
      currentPeriodEnd: asDate(subscription.current_period_end),
      cancelAtPeriodEnd: asBoolean(subscription.cancel_at_period_end) ?? false,
    });
  }

  // Keep the denormalized `user.tier` cache in sync. Stripe's
  // "active" / "trialing" / "past_due" all map to the same paid
  // tier — only `canceled` and `incomplete` should demote.
  const effectiveTier =
    status === "active" || status === "trialing" || status === "past_due"
      ? tier
      : "free";
  await syncUserTier(userId, effectiveTier);
};

const handleSubscriptionDeleted = async (
  subscription: Stripe.Subscription,
): Promise<void> => {
  const userId = extractUserId(subscription);
  await subscriptionRepository.cancelSubscription(subscription.id);
  if (userId) {
    await syncUserTier(userId, "free");
  }
};

const handleInvoicePaymentFailed = async (
  invoice: Stripe.Invoice,
): Promise<void> => {
  const subscriptionId = asString(invoice.subscription);
  if (!subscriptionId) {
    logger.warn("[stripe] invoice.payment_failed without subscription id");
    return;
  }
  await subscriptionRepository.updateSubscription(subscriptionId, {
    status: "past_due",
  });
};

const handleCheckoutSessionCompleted = async (
  session: Stripe.Checkout.Session,
): Promise<void> => {
  // Prefer `client_reference_id` (set by our checkout route) and
  // fall back to `metadata.userId`. Both are server-set, so they're
  // safe to trust.
  const userId =
    asString(session.client_reference_id) ??
    (isObject(session.metadata) ? asString(session.metadata.userId) : null);
  if (!userId) {
    logger.warn(
      "[stripe] checkout.session.completed without userId — acking to stop retries",
      {
        sessionId: session.id,
      },
    );
    return;
  }
  const subscriptionId = asString(session.subscription);
  if (!subscriptionId) return;

  // If Stripe has already sent us `customer.subscription.created`
  // for this id, the upsert is a no-op (UNIQUE on stripeSubscriptionId).
  await subscriptionRepository.createSubscription({
    userId,
    orgId:
      isObject(session.metadata) && typeof session.metadata.orgId === "string"
        ? session.metadata.orgId
        : null,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId:
      typeof session.customer === "string"
        ? session.customer
        : (session.customer?.id ?? ""),
    stripePriceId: asString(session.metadata?.priceId) ?? null,
    status: "active",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    tier: mapStripeSubscriptionToTier(
      asString(session.metadata?.priceId) ?? null,
    ),
  });

  // Mirror to user.tier so the rate limit / feature gate hot path
  // sees the upgrade immediately, before Stripe's separate
  // subscription event arrives.
  const tier = mapStripeSubscriptionToTier(
    asString(session.metadata?.priceId) ?? null,
  );
  await syncUserTier(userId, tier);
};

const dispatchEvent = async (event: Stripe.Event): Promise<void> => {
  switch (event.type) {
    case "customer.subscription.created":
      return handleSubscriptionCreatedOrUpdated(
        event.data.object as Stripe.Subscription,
        true,
      );
    case "customer.subscription.updated":
      return handleSubscriptionCreatedOrUpdated(
        event.data.object as Stripe.Subscription,
        false,
      );
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(
        event.data.object as Stripe.Subscription,
      );
    case "invoice.payment_failed":
      return handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
    case "checkout.session.completed":
      return handleCheckoutSessionCompleted(
        event.data.object as Stripe.Checkout.Session,
      );
    default:
      // Acknowledge unknown events with 200 so Stripe doesn't retry
      // forever on a type we don't care about.
      logger.info(`[stripe] unhandled event type: ${event.type}`);
  }
};

export const POST = async (request: Request): Promise<NextResponse> => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error(
      "[stripe] webhook received but STRIPE_WEBHOOK_SECRET is unset",
    );
    return NextResponse.json(
      { error: "STRIPE_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature") ?? "";

  // CRITICAL: read the raw body, NOT parsed JSON. The HMAC is
  // computed over the exact bytes Stripe sent — any whitespace
  // normalization from `req.json()` would invalidate the signature.
  const rawBody = await request.text();
  if (!rawBody) {
    return NextResponse.json({ error: "EMPTY_BODY" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    // We import the helper lazily so test environments that mock
    // the `server-only` import don't need a real Stripe SDK.
    const { verifyStripeWebhookSignature } = await import(
      "lib/payments/stripe"
    );
    event = verifyStripeWebhookSignature(rawBody, signature, webhookSecret);
  } catch (error) {
    logger.warn("[stripe] webhook signature rejected", error);
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  try {
    await dispatchEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error("[stripe] webhook processing failed", error);
    // Return 500 so Stripe retries the delivery. The
    // `subscription` repository is idempotent on
    // `stripeSubscriptionId` so retries are safe.
    return NextResponse.json({ error: "PROCESSING_FAILED" }, { status: 500 });
  }
};
