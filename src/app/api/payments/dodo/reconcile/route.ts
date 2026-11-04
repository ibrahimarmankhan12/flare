import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { auth } from "auth/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserTable } from "lib/db/pg/schema.pg";
import {
  DodoPaymentsError,
  getDodoSubscription,
  isDodoPaymentsEnabled,
} from "lib/payments/dodo";
import { dodoPaymentsRepository, userRepository } from "lib/db/repository";
import logger from "lib/logger";
import {
  DEFAULT_SUBSCRIPTION_TIER,
  normalizeSubscriptionTier,
} from "app-types/subscription";
import { getTierForDodoProductId } from "lib/payments/dodo";

export const dynamic = "force-dynamic";

const ReconcileBodySchema = z.object({
  // The Dodo subscription id (e.g. `sub_0NgEJRNDjSjOU8cKBkWvv`)
  // taken from the post-checkout redirect URL.
  subscriptionId: z
    .string()
    .min(3)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/, "Invalid subscription id format"),
});

const DODO_SUBSCRIPTION_ACTIVE_STATES = new Set([
  "active",
  "trialing",
  "past_due",
]);

/**
 * Recovery path for the case where Dodo's webhook never reached us
 * (e.g. webhook secret was rotated, deployment drift, transient
 * outage). The user is bounced back to /profile with a real
 * `subscription_id` from Dodo's URL, but our DB has no row — so
 * the page shows "Payment is processing" forever.
 *
 * This route lets the *authenticated* user who completed the
 * checkout ask us to reconcile their subscription directly against
 * the Dodo API. We:
 *   1. Auth the user (Better Auth session).
 *   2. Call `GET /subscriptions/{id}` on Dodo.
 *   3. Verify the user owns the subscription by checking
 *      `metadata.flareUserId` (set by our checkout route). If
 *      that's missing we fall back to looking up an existing
 *      `dodo_subscription` row by id — that row only exists for
 *      users who have already gone through this flow once.
 *   4. Run the same `upsertSubscription` flow the webhook handler
 *      runs, then bump the user's tier.
 *
 * SECURITY: the userId bound check is the critical gate. Without
 * it, anyone authenticated could call this with any Dodo
 * subscription id and elevate their tier to whatever that
 * subscription is on. With it, a user can only reconcile
 * subscriptions the server (via checkout metadata) associated
 * with their account.
 */
export const POST = async (request: NextRequest) => {
  let session;
  try {
    session = await auth.api.getSession({ headers: request.headers });
  } catch {
    return NextResponse.json(
      { success: false, error: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  // We don't strictly need Dodo "fully enabled" to reconcile — we
  // only need the API key to call /subscriptions/{id}. The webhook
  // secret can still be missing in this env; that's exactly the
  // situation this route exists to recover from.
  if (!(await isDodoPaymentsEnabled())) {
    return NextResponse.json(
      {
        success: false,
        error: "DODO_NOT_CONFIGURED",
        message:
          "Dodo API is not configured on the server. Please contact support.",
      },
      { status: 503 },
    );
  }

  let payload: z.infer<typeof ReconcileBodySchema>;
  try {
    payload = ReconcileBodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_REQUEST",
        message:
          error instanceof z.ZodError
            ? error.issues[0]?.message
            : "Invalid request body",
      },
      { status: 400 },
    );
  }

  // 1. Look up the subscription on Dodo's side.
  let details;
  try {
    details = await getDodoSubscription(payload.subscriptionId);
  } catch (error) {
    if (error instanceof DodoPaymentsError) {
      // 404 from Dodo: the subscription id the user has doesn't
      // exist on Dodo. Either they typed it manually, the URL was
      // tampered, or this is a checkout from a different Dodo
      // account/environment.
      if (error.status === 404) {
        return NextResponse.json(
          {
            success: false,
            error: "SUBSCRIPTION_NOT_FOUND",
            message:
              "We couldn't find this subscription on the payment provider.",
          },
          { status: 404 },
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: "DODO_API_ERROR",
          message: error.message,
        },
        { status: error.status >= 500 ? 502 : 400 },
      );
    }
    throw error;
  }

  // 2. Ownership check. Prefer `metadata.flareUserId` (set at
  // checkout time by our own server, signed via HTTPS to Dodo).
  const metadataUserId =
    typeof details.metadata?.flareUserId === "string"
      ? (details.metadata.flareUserId as string)
      : typeof details.metadata?.user_id === "string"
        ? (details.metadata.user_id as string)
        : null;

  let ownerUserId: string | null = metadataUserId;
  if (!ownerUserId) {
    // Fall back: look up an existing row for this Dodo subscription.
    // This handles older checkouts (pre-metadata) where the binding
    // lives only in our DB.
    const existing =
      await dodoPaymentsRepository.getSubscriptionByDodoId(
        details.subscriptionId,
      );
    ownerUserId = existing?.userId ?? null;
  }

  if (!ownerUserId) {
    // No binding anywhere — reject. This is the "user typed
    // someone else's subscription id" defence.
    return NextResponse.json(
      {
        success: false,
        error: "OWNERSHIP_UNKNOWN",
        message:
          "We couldn't verify that this subscription belongs to your account. Please contact support with your receipt.",
      },
      { status: 403 },
    );
  }

  if (ownerUserId !== session.user.id) {
    logger.warn("[dodo] reconcile ownership mismatch", {
      sessionUserId: session.user.id,
      ownerUserId,
      dodoSubscriptionId: details.subscriptionId,
    });
    return NextResponse.json(
      {
        success: false,
        error: "OWNERSHIP_MISMATCH",
        message: "This subscription does not belong to your account.",
      },
      { status: 403 },
    );
  }

  // 3. Skip if the subscription isn't actually active. Don't write
  // a row for `pending` or `failed` — that would falsely elevate
  // the user's tier.
  if (!DODO_SUBSCRIPTION_ACTIVE_STATES.has(details.status)) {
    return NextResponse.json(
      {
        success: false,
        error: "SUBSCRIPTION_NOT_ACTIVE",
        message: `Subscription status is "${details.status}". We won't apply this to your account yet — try again in a few minutes, or contact support.`,
        status: details.status,
      },
      { status: 409 },
    );
  }

  // 4. Skip if the user was deleted (parallel to the webhook
  // handler's defensive check).
  const userExists = await userRepository.getUserById(ownerUserId);
  if (!userExists) {
    return NextResponse.json(
      { success: false, error: "USER_NOT_FOUND" },
      { status: 404 },
    );
  }

  // 5. Tier: trust the product_id (payment source of truth) over
  // metadata. Mirror the webhook handler's logic.
  const tierFromProduct = getTierForDodoProductId(details.productId);
  const tier = (tierFromProduct && normalizeSubscriptionTier(tierFromProduct)) ||
    (typeof details.metadata?.tier === "string"
      ? normalizeSubscriptionTier(details.metadata.tier as string)
      : DEFAULT_SUBSCRIPTION_TIER);

  // 6. Write the subscription row. `upsertSubscription` keeps the
  // user's tier in sync (active → tier, anything else → free).
  await dodoPaymentsRepository.upsertSubscription({
    userId: ownerUserId,
    dodoSubscriptionId: details.subscriptionId,
    dodoCustomerId: details.customerId,
    dodoProductId: details.productId,
    tier,
    status: "active",
    previousBillingDate: details.previousBillingDate,
    nextBillingDate: details.nextBillingDate,
    cancelAtNextBillingDate: details.cancelAtNextBillingDate,
    metadata: details.metadata,
  });

  // The webhook handler emits an upgrade email on first activation.
  // We don't fire that here — the user already has the subscription
  // (they paid), they just need their tier applied. Re-firing on
  // every reconcile would spam.

  // 7. Read the resulting tier for the response.
  const [userRow] = await db
    .select({ tier: UserTable.tier })
    .from(UserTable)
    .where(eq(UserTable.id, ownerUserId))
    .limit(1);

  return NextResponse.json({
    success: true,
    subscriptionId: details.subscriptionId,
    status: details.status,
    tier: userRow?.tier ?? tier,
    productId: details.productId,
  });
};
