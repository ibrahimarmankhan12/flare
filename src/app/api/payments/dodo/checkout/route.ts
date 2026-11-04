import "server-only";
import { randomBytes } from "node:crypto";
import { auth } from "auth/server";
import { serverCache } from "lib/cache";
import { getBaseUrl } from "lib/const";
import logger from "lib/logger";
import { createCheckoutSession, getDodoProductIdForTier, isDodoPaymentsEnabled } from "lib/payments/dodo";
import { createUpgradeToken } from "lib/payments/upgrade-token";
import { getUser } from "lib/user/server";
import { CreateDodoCheckoutSchema } from "lib/validations/payment";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Per-user rate limit on checkout creation. A free user could
// otherwise spam this endpoint to flood the Dodo dashboard with
// pending sessions. 10/hour is plenty for any legitimate user
// (they can pay, cancel, retry, change tier).
const CHECKOUT_RATE_WINDOW_MS = 60 * 60 * 1000;
const CHECKOUT_RATE_MAX = 10;

const RETURN_PATH = "/profile?upgrade=success";
const CANCEL_PATH = "/profile?upgrade=cancelled";

const checkoutRateKey = (userId: string) =>
  `payments:dodo:checkout-rate:${userId}`;

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

  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json(
      { success: false, error: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  // Per-user rate limit. Counts every checkout attempt (success or
  // failure) so a misconfigured client retrying in a loop also gets
  // throttled.
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
        headers: {
          "Retry-After": String(Math.ceil(rate.resetMs / 1000)),
        },
      },
    );
  }

  if (!(await isDodoPaymentsEnabled())) {
    return NextResponse.json(
      { success: false, error: "DODO_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  let payload: z.infer<typeof CreateDodoCheckoutSchema>;
  try {
    const body = await request.json();
    payload = CreateDodoCheckoutSchema.parse(body);
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

  const productId = await getDodoProductIdForTier(payload.tier);
  if (!productId) {
    return NextResponse.json(
      {
        success: false,
        error: "TIER_NOT_CONFIGURED",
        message: `Dodo product for tier "${payload.tier}" is not configured.`,
      },
      { status: 400 },
    );
  }

  const user = await getUser(session.user.id);
  if (!user) {
    return NextResponse.json(
      { success: false, error: "USER_NOT_FOUND" },
      { status: 404 },
    );
  }

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return NextResponse.json(
      {
        success: false,
        error: "BASE_URL_NOT_CONFIGURED",
        message:
          "Set FLARE_AUTH_URL to your public HTTPS app URL so Dodo can redirect users back after payment.",
      },
      { status: 500 },
    );
  }

  // The success URL is the URL Dodo redirects the user back to
  // after a successful payment. It needs a signed token so the
  // profile page can reject hand-typed URLs like
  // `/profile?upgrade=success` that bypass the payment.
  //
  // The token is bound to a random nonce (so each checkout gets a
  // fresh, non-guessable URL) plus the userId and an expiry, and is
  // HMAC-signed with BETTER_AUTH_SECRET. The page-side check
  // verifies the signature and userId match; the *actual* claim of
  // success also requires an active subscription row in the DB for
  // this user, so a leaked/stolen token alone is not enough.
  const checkoutNonce = randomBytes(16).toString("base64url");
  const token = createUpgradeToken({
    userId: user.id,
    nonce: checkoutNonce,
  });
  const successUrl = token
    ? `${baseUrl}${RETURN_PATH}&token=${encodeURIComponent(token)}&session=${encodeURIComponent(checkoutNonce)}`
    : `${baseUrl}${RETURN_PATH}`;
  const cancelUrl = `${baseUrl}${CANCEL_PATH}`;

  let sessionResult;
  try {
    sessionResult = await createCheckoutSession({
      productId,
      customer: {
        email: user.email,
        name: user.name,
        userId: user.id,
      },
      successUrl,
      cancelUrl,
      tier: payload.tier,
    });
  } catch (error) {
    logger.error("[dodo] checkout creation failed", error);
    return NextResponse.json(
      {
        success: false,
        error: "CHECKOUT_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Failed to create Dodo checkout session",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    checkoutUrl: sessionResult.checkoutUrl,
    sessionId: sessionResult.sessionId,
  });
};
