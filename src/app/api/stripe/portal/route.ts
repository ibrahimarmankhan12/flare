import "server-only";

import { auth } from "auth/server";
import { eq } from "drizzle-orm";

import { pgDb } from "lib/db/pg/db.pg";
import { SubscriptionTable } from "lib/db/pg/schema.pg";
import { subscriptionRepository } from "lib/db/repository";
import logger from "lib/logger";
import { getStripeAppBaseUrl, getStripeClient } from "lib/payments/stripe";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// P4.B — Stripe billing portal
// ---------------------------------------------------------------------------
// Creates a Stripe-hosted billing portal session for the current user so
// they can manage payment methods, switch plans, or cancel without us
// having to re-implement the Stripe Customer UI. The portal is per-customer,
// not per-subscription, so we first resolve the Stripe customer ID for the
// caller. The user's Stripe customer is the one attached to their most
// recent subscription row; if they have none, we create one on the fly.
// ---------------------------------------------------------------------------

export const POST = async (_request: NextRequest): Promise<NextResponse> => {
  let session;
  try {
    session = await auth.api.getSession({ headers: _request.headers });
  } catch {
    return NextResponse.json(
      { success: false, error: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json(
      { success: false, error: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { success: false, error: "STRIPE_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  if (!getStripeAppBaseUrl()) {
    return NextResponse.json(
      {
        success: false,
        error: "BASE_URL_NOT_CONFIGURED",
        message:
          "Set FLARE_AUTH_URL to your public HTTPS app URL so Stripe can redirect users back from the portal.",
      },
      { status: 500 },
    );
  }

  try {
    const client = getStripeClient();
    const customerId = await resolveOrCreateCustomerId(
      client,
      session.user.id,
      session.user.email,
    );

    const portalSession = await client.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getStripeAppBaseUrl()}/profile?portal=returned`,
    });

    return NextResponse.json({
      success: true,
      url: portalSession.url,
    });
  } catch (error) {
    logger.error("[stripe] portal session failed", error);
    return NextResponse.json(
      {
        success: false,
        error: "PORTAL_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Failed to create Stripe billing portal session",
      },
      { status: 502 },
    );
  }
};

/**
 * Resolve the Stripe customer ID for the current user. The
 * `subscription` table stores the customer ID for any user that
 * has ever had a paid plan. If none exists (e.g. a free user
 * opening the portal for the first time), we create a Stripe
 * customer on the fly — Stripe rejects duplicate `customer.create`
 * for the same email so we look up by email first.
 */
const resolveOrCreateCustomerId = async (
  client: ReturnType<typeof getStripeClient>,
  userId: string,
  email: string,
): Promise<string> => {
  const existing = await subscriptionRepository.getSubscriptionForUser(userId);
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  // Fallback: query any subscription row for this user directly
  // (covers the case where the user previously canceled).
  const [anyRow] = await pgDb
    .select({ customerId: SubscriptionTable.stripeCustomerId })
    .from(SubscriptionTable)
    .where(eq(SubscriptionTable.userId, userId))
    .limit(1);
  if (anyRow?.customerId) return anyRow.customerId;

  // Look up an existing Stripe customer by email (rare for
  // free users, but covers the case where a customer was created
  // out-of-band and our DB doesn't know about it yet).
  const matches = await client.customers.list({ email, limit: 1 });
  if (matches.data[0]?.id) return matches.data[0].id;

  const created = await client.customers.create({
    email,
    metadata: { userId },
  });
  return created.id;
};
