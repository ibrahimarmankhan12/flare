import {
  DEFAULT_SUBSCRIPTION_TIER,
  SubscriptionTierName,
  normalizeSubscriptionTier,
} from "app-types/subscription";
import { eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { UserTable } from "lib/db/pg/schema.pg";
import { dodoPaymentsRepository, userRepository } from "lib/db/repository";
import { notifyAccountUpgraded } from "lib/email/admin-triggers";
import logger from "lib/logger";
import {
  getTierForDodoProductId,
  isDodoPaymentsEnabled,
  parseWebhookRequest,
} from "lib/payments/dodo";
import { getDodoConfig } from "lib/payments/dodo";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// Dodo webhooks are external; never run on the Edge runtime.
export const runtime = "nodejs";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const asDate = (value: unknown): Date | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const metadataTier = (metadata: unknown): SubscriptionTierName => {
  if (!isObject(metadata)) return DEFAULT_SUBSCRIPTION_TIER;
  const tier = metadata.tier;
  if (typeof tier !== "string") return DEFAULT_SUBSCRIPTION_TIER;
  return normalizeSubscriptionTier(tier);
};

const dataObject = (
  payload: Record<string, unknown>,
): Record<string, unknown> => {
  if (isObject(payload.data)) return payload.data as Record<string, unknown>;
  return payload;
};

const resolveUserId = async (
  payload: Record<string, unknown>,
  dodoSubscriptionId: string | null,
): Promise<string | null> => {
  const data = dataObject(payload);
  const metadata = isObject(data.metadata) ? data.metadata : null;
  // SECURITY: Trust the server-set `flareUserId` first. Dodo's
  // `customer.customer_id` is a Dodo-assigned identifier that we
  // never use as a Flare userId — falling back to it could let a
  // crafted or replayed payload escalate privileges if the IDs
  // ever collide or are manipulated.
  const fromMetadata =
    asString(metadata?.flareUserId) ?? asString(metadata?.user_id);
  if (fromMetadata) return fromMetadata;

  // Fall back to looking up the user via the already-known
  // Dodo subscription. This handles the (rare) case where the
  // webhook fires before our checkout metadata is propagated.
  if (dodoSubscriptionId) {
    const sub =
      await dodoPaymentsRepository.getSubscriptionByDodoId(dodoSubscriptionId);
    return sub?.userId ?? null;
  }
  return null;
};

const handleSubscriptionActive = async (
  payload: Record<string, unknown>,
): Promise<void> => {
  const data = dataObject(payload);
  const dodoSubscriptionId = asString(data.subscription_id);
  const dodoProductId = asString(data.product_id) ?? "";
  if (!dodoSubscriptionId) {
    logger.warn("[dodo] subscription.active without subscription_id");
    return;
  }

  // SECURITY: prefer the product_id (what the user actually paid
  // for) over the checkout metadata. Metadata is set by the server
  // but a corrupt or replayed payload could disagree with the
  // product, so the payment is the source of truth.
  const tierFromProduct = getTierForDodoProductId(dodoProductId);
  const tier =
    (tierFromProduct && normalizeSubscriptionTier(tierFromProduct)) ||
    metadataTier(data.metadata);

  const userId = await resolveUserId(payload, dodoSubscriptionId);
  if (!userId) {
    logger.warn("[dodo] subscription.active could not resolve userId", {
      dodoSubscriptionId,
    });
    return;
  }

  // Skip with 200-ack semantics if the user no longer exists (was
  // deleted after the checkout was created). Drizzle would FK-fail
  // the insert and Dodo would retry forever, which we explicitly
  // don't want.
  const userExists = await userRepository.getUserById(userId);
  if (!userExists) {
    logger.warn(
      "[dodo] subscription.active for non-existent user — acking to stop retries",
      { userId, dodoSubscriptionId },
    );
    return;
  }

  // Real Dodo subscription.active payload field names:
  //   data.customer.customer_id      (nested)
  //   data.previous_billing_date    (start of current period)
  //   data.next_billing_date        (end of current period)
  //   data.cancel_at_next_billing_date
  // We accept the older `current_period_*` and `cancel_at_period_end`
  // aliases as fallbacks so a payload from a future Dodo shape change
  // still works.
  const nestedCustomer = isObject(data.customer) ? data.customer : null;
  const dodoCustomerId =
    (nestedCustomer && asString(nestedCustomer.customer_id)) ??
    asString(data.customer_id);

  await dodoPaymentsRepository.upsertSubscription({
    userId,
    dodoSubscriptionId,
    dodoCustomerId,
    dodoProductId,
    tier,
    status: "active",
    previousBillingDate:
      asDate(data.previous_billing_date) ??
      asDate(data.current_period_start),
    nextBillingDate:
      asDate(data.next_billing_date) ?? asDate(data.current_period_end),
    cancelAtNextBillingDate:
      typeof data.cancel_at_next_billing_date === "boolean"
        ? data.cancel_at_next_billing_date
        : typeof data.cancel_at_period_end === "boolean"
          ? data.cancel_at_period_end
          : false,
    metadata: isObject(data.metadata) ? data.metadata : {},
  });

  // Fire-and-forget upgrade email; we don't want a flaky SMTP server
  // to fail the webhook processing.
  void notifyAccountUpgraded(userId, tier).catch((err) =>
    logger.error("[dodo] upgrade email failed", err),
  );
};

const handleSubscriptionRenewedOrUpdated = async (
  payload: Record<string, unknown>,
): Promise<void> => {
  const data = dataObject(payload);
  const dodoSubscriptionId = asString(data.subscription_id);
  if (!dodoSubscriptionId) return;

  const updates: Parameters<
    typeof dodoPaymentsRepository.updateSubscription
  >[0] = { dodoSubscriptionId };
  const productId = asString(data.product_id);
  if (productId) {
    const tierFromProduct = getTierForDodoProductId(productId);
    if (tierFromProduct)
      updates.tier = normalizeSubscriptionTier(tierFromProduct);
  }
  const tierMeta = metadataTier(data.metadata);
  if (tierMeta !== DEFAULT_SUBSCRIPTION_TIER) updates.tier = tierMeta;
  // Prefer real Dodo field names; fall back to the older aliases.
  if (typeof data.cancel_at_next_billing_date === "boolean") {
    updates.cancelAtNextBillingDate = data.cancel_at_next_billing_date;
  } else if (typeof data.cancel_at_period_end === "boolean") {
    updates.cancelAtNextBillingDate = data.cancel_at_period_end;
  }
  if (data.previous_billing_date !== undefined) {
    updates.previousBillingDate = asDate(data.previous_billing_date);
  } else if (data.current_period_start !== undefined) {
    updates.previousBillingDate = asDate(data.current_period_start);
  }
  if (data.next_billing_date !== undefined) {
    updates.nextBillingDate = asDate(data.next_billing_date);
  } else if (data.current_period_end !== undefined) {
    updates.nextBillingDate = asDate(data.current_period_end);
  }
  if (isObject(data.metadata)) updates.metadata = data.metadata;
  // `customer_id` is nested under `customer` in real Dodo payloads.
  const nestedCustomer = isObject(data.customer) ? data.customer : null;
  const customerId =
    (nestedCustomer && asString(nestedCustomer.customer_id)) ??
    asString(data.customer_id);
  if (customerId) updates.dodoCustomerId = customerId;

  await dodoPaymentsRepository.updateSubscription(updates);
};

const handleSubscriptionCancelled = async (
  payload: Record<string, unknown>,
): Promise<void> => {
  const data = dataObject(payload);
  const dodoSubscriptionId = asString(data.subscription_id);
  if (!dodoSubscriptionId) return;

  await dodoPaymentsRepository.updateSubscription({
    dodoSubscriptionId,
    status: "cancelled",
    cancelledAt: new Date(),
    cancelAtNextBillingDate: true,
  });

  const sub =
    await dodoPaymentsRepository.getSubscriptionByDodoId(dodoSubscriptionId);
  if (sub) {
    // Demote to free tier explicitly because the cached `user.tier`
    // must always reflect the most recent authoritative source.
    await pgDb
      .update(UserTable)
      .set({ tier: DEFAULT_SUBSCRIPTION_TIER, updatedAt: new Date() })
      .where(eq(UserTable.id, sub.userId));
  }
};

const handleSubscriptionFailed = async (
  payload: Record<string, unknown>,
): Promise<void> => {
  const data = dataObject(payload);
  const dodoSubscriptionId = asString(data.subscription_id);
  if (!dodoSubscriptionId) return;
  await dodoPaymentsRepository.updateSubscription({
    dodoSubscriptionId,
    status: "failed",
  });
};

const handleSubscriptionOnHold = async (
  payload: Record<string, unknown>,
): Promise<void> => {
  const data = dataObject(payload);
  const dodoSubscriptionId = asString(data.subscription_id);
  if (!dodoSubscriptionId) return;
  await dodoPaymentsRepository.updateSubscription({
    dodoSubscriptionId,
    status: "on_hold",
  });
  const sub =
    await dodoPaymentsRepository.getSubscriptionByDodoId(dodoSubscriptionId);
  if (sub) {
    await pgDb
      .update(UserTable)
      .set({ tier: DEFAULT_SUBSCRIPTION_TIER, updatedAt: new Date() })
      .where(eq(UserTable.id, sub.userId));
  }
};

const handlePaymentSucceeded = async (
  payload: Record<string, unknown>,
): Promise<void> => {
  const data = dataObject(payload);
  const dodoPaymentId = asString(data.payment_id);
  if (!dodoPaymentId) return;
  const userId = await resolveUserId(payload, asString(data.subscription_id));
  if (!userId) {
    logger.warn("[dodo] payment.succeeded could not resolve userId", {
      dodoPaymentId,
    });
    return;
  }
  // Skip if the user no longer exists; Drizzle would FK-fail and
  // Dodo would retry indefinitely.
  const userExists = await userRepository.getUserById(userId);
  if (!userExists) {
    logger.warn(
      "[dodo] payment.succeeded for non-existent user — acking to stop retries",
      { userId, dodoPaymentId },
    );
    return;
  }
  const productId = asString(data.product_id);
  const tierFromProduct = getTierForDodoProductId(productId);
  const tier =
    (tierFromProduct && normalizeSubscriptionTier(tierFromProduct)) ||
    metadataTier(data.metadata);

  await dodoPaymentsRepository.recordPayment({
    userId,
    dodoPaymentId,
    dodoSubscriptionId: asString(data.subscription_id) ?? null,
    amount: asNumber(data.amount) ?? 0,
    currency: asString(data.currency) ?? "USD",
    status: "succeeded",
    tier,
    paidAt: asDate(data.created_at) ?? new Date(),
    metadata: isObject(data.metadata) ? data.metadata : {},
  });
};

const handlePaymentFailed = async (
  payload: Record<string, unknown>,
): Promise<void> => {
  const data = dataObject(payload);
  const dodoPaymentId = asString(data.payment_id);
  if (!dodoPaymentId) return;
  const userId = await resolveUserId(payload, asString(data.subscription_id));
  if (!userId) return;

  const productId = asString(data.product_id);
  const tierFromProduct = getTierForDodoProductId(productId);
  const tier =
    (tierFromProduct && normalizeSubscriptionTier(tierFromProduct)) ||
    metadataTier(data.metadata);

  await dodoPaymentsRepository.recordPayment({
    userId,
    dodoPaymentId,
    dodoSubscriptionId: asString(data.subscription_id) ?? null,
    amount: asNumber(data.amount) ?? 0,
    currency: asString(data.currency) ?? "USD",
    status: "failed",
    tier,
    paidAt: null,
    metadata: isObject(data.metadata) ? data.metadata : {},
  });
};

const handleRefund = async (
  payload: Record<string, unknown>,
): Promise<void> => {
  const data = dataObject(payload);
  const dodoPaymentId = asString(data.payment_id);
  if (!dodoPaymentId) return;
  const userId = await resolveUserId(payload, asString(data.subscription_id));
  if (!userId) return;
  const productId = asString(data.product_id);
  const tierFromProduct = getTierForDodoProductId(productId);
  const tier =
    (tierFromProduct && normalizeSubscriptionTier(tierFromProduct)) ||
    metadataTier(data.metadata);

  await dodoPaymentsRepository.recordPayment({
    userId,
    dodoPaymentId,
    dodoSubscriptionId: asString(data.subscription_id) ?? null,
    amount: -(asNumber(data.amount) ?? 0),
    currency: asString(data.currency) ?? "USD",
    status: "refunded",
    tier,
    paidAt: asDate(data.created_at),
    metadata: isObject(data.metadata) ? data.metadata : {},
  });
};

const dispatchEvent = async (
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> => {
  switch (eventType) {
    case "subscription.active":
    case "subscription.created":
      return handleSubscriptionActive(payload);
    case "subscription.updated":
    case "subscription.renewed":
    case "subscription.plan_changed":
      return handleSubscriptionRenewedOrUpdated(payload);
    case "subscription.cancelled":
    case "subscription.canceled":
      return handleSubscriptionCancelled(payload);
    case "subscription.on_hold":
      return handleSubscriptionOnHold(payload);
    case "subscription.failed":
    case "subscription.payment_failed":
      return handleSubscriptionFailed(payload);
    case "payment.succeeded":
    case "payment.completed":
      return handlePaymentSucceeded(payload);
    case "payment.failed":
      return handlePaymentFailed(payload);
    case "refund.succeeded":
    case "payment.refunded":
      return handleRefund(payload);
    default:
      logger.info(`[dodo] unhandled event type: ${eventType}`);
  }
};

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const { webhookSecret } = await getDodoConfig();
  if (!webhookSecret) {
    logger.error("[dodo] webhook received but DODO_WEBHOOK_SECRET is unset");
    return NextResponse.json({ error: "DODO_NOT_CONFIGURED" }, { status: 503 });
  }

  if (!(await isDodoPaymentsEnabled())) {
    return NextResponse.json({ error: "DODO_NOT_CONFIGURED" }, { status: 503 });
  }

  // We need the raw body for signature verification, so do not
  // attempt to parse it as JSON first.
  const rawBody = await request.text();
  if (!rawBody) {
    return NextResponse.json({ error: "EMPTY_BODY" }, { status: 400 });
  }

  let event;
  try {
    event = await parseWebhookRequest(rawBody, request.headers);
  } catch (error) {
    logger.warn("[dodo] webhook signature rejected", error);
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  if (!event.webhookId) {
    return NextResponse.json({ error: "MISSING_WEBHOOK_ID" }, { status: 400 });
  }

  const { isNew, existing } =
    await dodoPaymentsRepository.recordWebhookReceived(
      event.webhookId,
      event.eventType,
      event.payload,
    );

  if (!isNew) {
    // Already processed; just ack so Dodo stops retrying.
    logger.info(`[dodo] duplicate webhook ${event.webhookId} ignored`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await dispatchEvent(event.eventType, event.payload);
    await dodoPaymentsRepository.markWebhookProcessed(event.webhookId);
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await dodoPaymentsRepository.markWebhookProcessed(event.webhookId, message);
    logger.error("[dodo] webhook processing failed", error);
    // Return 500 so Dodo retries the delivery.
    return NextResponse.json({ error: "PROCESSING_FAILED" }, { status: 500 });
  }

  // Unused, but keeps the existing reference for future use:
  void existing;
};
