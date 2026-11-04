import "server-only";

import { auth } from "auth/server";
import { serverCache } from "lib/cache";
import logger from "lib/logger";
import {
  getStripeAppBaseUrl,
  getStripeClient,
  mapStripeSubscriptionToTier,
} from "lib/payments/stripe";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CheckoutBodySchema = z.object({
  priceId: z.string().trim().min(1, "priceId is required"),
  orgId: z.string().trim().min(1).optional(),
});

const CHECKOUT_RATE_WINDOW_MS = 60 * 60 * 1000;
const CHECKOUT_RATE_MAX = 10;

const checkoutRateKey = (userId: string) => `stripe:checkout-rate:${userId}`;

const checkCheckoutRate = async (
  userId: string,
): Promise<{ allowed: boolean; remaining: number; resetMs: number }> => {
  const key = checkoutRateKey(userId);
  const current = (await serverCache.get<number>(key)) ?? 0;
  if (current >= CHECKOUT_RATE_MAX) {
    return {
      allowed: false,
      remaining: 0,
      resetMs: CHECKOUT_RATE_WINDOW_MS,
    };
  }
  await serverCache.set(key, current + 1, CHECKOUT_RATE_WINDOW_MS + 5_000);
  return {
    allowed: true,
    remaining: Math.max(0, CHECKOUT_RATE_MAX - (current + 1)),
    resetMs: CHECKOUT_RATE_WINDOW_MS,
  };
};

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  let session;
  try {
    session = await auth.api.getSession({ headers: request.headers });
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

  const rate = await checkCheckoutRate(session.user.id);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: "RATE_LIMITED",
        message:
          "Too many checkout attempts. Please wait a few minutes before trying again.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rate.resetMs / 1000)) },
      },
    );
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { success: false, error: "STRIPE_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  let payload: z.infer<typeof CheckoutBodySchema>;
  try {
    const body = await request.json();
    payload = CheckoutBodySchema.parse(body);
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

  // Validate the price ID maps to a known tier. Throws on
  // unknown price so a misconfigured client gets a clear 400
  // rather than a silent free checkout.
  let tierLabel: string;
  try {
    tierLabel = mapStripeSubscriptionToTier(payload.priceId);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "UNKNOWN_PRICE",
        message:
          error instanceof Error ? error.message : "Unknown Stripe price ID",
      },
      { status: 400 },
    );
  }

  const baseUrl = getStripeAppBaseUrl();
  if (!baseUrl) {
    return NextResponse.json(
      {
        success: false,
        error: "BASE_URL_NOT_CONFIGURED",
        message:
          "Set FLARE_AUTH_URL to your public HTTPS app URL so Stripe can redirect users back after payment.",
      },
      { status: 500 },
    );
  }

  const successUrl = `${baseUrl}/profile?upgrade=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/profile?upgrade=cancelled`;

  try {
    const client = getStripeClient();
    const checkoutSession = await client.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: payload.priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: session.user.id,
      customer_email: session.user.email,
      metadata: {
        userId: session.user.id,
        ...(payload.orgId ? { orgId: payload.orgId } : {}),
        priceId: payload.priceId,
        tier: tierLabel,
      },
      subscription_data: {
        metadata: {
          userId: session.user.id,
          ...(payload.orgId ? { orgId: payload.orgId } : {}),
        },
      },
      allow_promotion_codes: true,
    });

    if (!checkoutSession.url) {
      return NextResponse.json(
        {
          success: false,
          error: "CHECKOUT_FAILED",
          message: "Stripe did not return a checkout URL",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      url: checkoutSession.url,
      sessionId: checkoutSession.id,
    });
  } catch (error) {
    logger.error("[stripe] checkout session failed", error);
    return NextResponse.json(
      {
        success: false,
        error: "CHECKOUT_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Failed to create Stripe checkout session",
      },
      { status: 502 },
    );
  }
};
