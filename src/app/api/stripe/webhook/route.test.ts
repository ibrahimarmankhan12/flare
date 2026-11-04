//@vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Mocks — declared with vi.mock so they're hoisted before the route import.
// ---------------------------------------------------------------------------

const verifyStripeWebhookSignatureMock = vi.fn();
const getStripeClientMock = vi.fn();
const getStripeAppBaseUrlMock = vi.fn();
const mapStripeSubscriptionToTierMock = vi.fn();
const mapStripeStatusToInternalMock = vi.fn();
const mapStripeTierToUserTierMock = vi.fn();

vi.mock("lib/payments/stripe", () => ({
  verifyStripeWebhookSignature: (...args: unknown[]) =>
    verifyStripeWebhookSignatureMock(...args),
  getStripeClient: (...args: unknown[]) => getStripeClientMock(...args),
  getStripeAppBaseUrl: (...args: unknown[]) => getStripeAppBaseUrlMock(...args),
  mapStripeSubscriptionToTier: (...args: unknown[]) =>
    mapStripeSubscriptionToTierMock(...args),
  mapStripeStatusToInternal: (...args: unknown[]) =>
    mapStripeStatusToInternalMock(...args),
  mapStripeTierToUserTier: (...args: unknown[]) =>
    mapStripeTierToUserTierMock(...args),
}));

const createSubscriptionMock = vi.fn();
const updateSubscriptionMock = vi.fn();
const cancelSubscriptionMock = vi.fn();
const getUserByIdMock = vi.fn();
const updateUserDetailsMock = vi.fn();

vi.mock("lib/db/repository", () => ({
  subscriptionRepository: {
    createSubscription: (...args: unknown[]) => createSubscriptionMock(...args),
    updateSubscription: (...args: unknown[]) => updateSubscriptionMock(...args),
    cancelSubscription: (...args: unknown[]) => cancelSubscriptionMock(...args),
  },
  userRepository: {
    getUserById: (...args: unknown[]) => getUserByIdMock(...args),
    updateUserDetails: (...args: unknown[]) => updateUserDetailsMock(...args),
  },
}));

// Capture the UPDATE user.tier SQL so we can assert on it without
// needing a real Postgres connection.
const userTierUpdateMock = vi.fn();
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    update: () => ({
      set: () => ({
        where: () => userTierUpdateMock(),
      }),
    }),
  },
}));

const loggerErrorMock = vi.fn();
const loggerInfoMock = vi.fn();
const loggerWarnMock = vi.fn();
vi.mock("lib/logger", () => ({
  default: {
    error: (...args: unknown[]) => loggerErrorMock(...args),
    info: (...args: unknown[]) => loggerInfoMock(...args),
    warn: (...args: unknown[]) => loggerWarnMock(...args),
  },
}));

const { POST } = await import("./route");

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const makeRequest = (
  body: string,
  headers: Record<string, string> = {},
): Request =>
  new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers,
    body,
  });

const validSig = "t=1700000000,v1=deadbeef";

const baseSubscription = {
  id: "sub_123",
  customer: "cus_123",
  status: "active",
  current_period_start: 1700000000,
  current_period_end: 1731536000,
  cancel_at_period_end: false,
  items: {
    data: [
      {
        price: { id: "price_pro_123" },
        plan: { id: "plan_pro_legacy" },
      },
    ],
  },
  metadata: { userId: "user_1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.STRIPE_SECRET_KEY = "sk_test";
  getStripeAppBaseUrlMock.mockReturnValue("https://app.test");
  mapStripeSubscriptionToTierMock.mockReturnValue("pro");
  mapStripeStatusToInternalMock.mockReturnValue("active");
  mapStripeTierToUserTierMock.mockReturnValue("flare-pro");
  getUserByIdMock.mockResolvedValue({ id: "user_1", tier: "free" });
  userTierUpdateMock.mockResolvedValue(undefined);
  createSubscriptionMock.mockResolvedValue({});
  updateSubscriptionMock.mockResolvedValue({});
  cancelSubscriptionMock.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 503 when not configured
// ---------------------------------------------------------------------------

describe("/api/stripe/webhook", () => {
  it("returns 503 when STRIPE_WEBHOOK_SECRET is not set", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(makeRequest("{}", { "stripe-signature": validSig }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("STRIPE_NOT_CONFIGURED");
  });

  it("returns 400 when the body is empty", async () => {
    const res = await POST(makeRequest("", { "stripe-signature": validSig }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on a bad signature", async () => {
    verifyStripeWebhookSignatureMock.mockImplementation(() => {
      throw new Error("Invalid signature");
    });
    const res = await POST(
      makeRequest('{"id":"evt_bad"}', { "stripe-signature": "bad" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_SIGNATURE");
  });

  it("returns 200 with {received: true, ignored: true} for an unhandled event type", async () => {
    verifyStripeWebhookSignatureMock.mockReturnValue({
      id: "evt_random",
      type: "some.unknown.event",
      data: { object: {} },
    });

    const res = await POST(
      makeRequest('{"id":"evt_random"}', { "stripe-signature": validSig }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true });
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.stringContaining("unhandled event type"),
    );
    // No repository writes on an unknown event.
    expect(createSubscriptionMock).not.toHaveBeenCalled();
    expect(updateSubscriptionMock).not.toHaveBeenCalled();
    expect(cancelSubscriptionMock).not.toHaveBeenCalled();
  });

  it("creates a subscription + writes user.tier on customer.subscription.created", async () => {
    verifyStripeWebhookSignatureMock.mockReturnValue({
      id: "evt_created",
      type: "customer.subscription.created",
      data: { object: baseSubscription },
    });

    const res = await POST(
      makeRequest('{"id":"evt_created"}', { "stripe-signature": validSig }),
    );
    expect(res.status).toBe(200);

    expect(createSubscriptionMock).toHaveBeenCalledTimes(1);
    const input = createSubscriptionMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(input).toMatchObject({
      userId: "user_1",
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_123",
      stripePriceId: "price_pro_123",
      status: "active",
      tier: "pro",
    });
    // user.tier denormalization: 4-tier "pro" -> Flare "flare-pro".
    expect(userTierUpdateMock).toHaveBeenCalled();
    expect(mapStripeTierToUserTierMock).toHaveBeenCalledWith("pro");
  });

  it("updates the subscription + writes user.tier on customer.subscription.updated", async () => {
    verifyStripeWebhookSignatureMock.mockReturnValue({
      id: "evt_updated",
      type: "customer.subscription.updated",
      data: { object: baseSubscription },
    });
    mapStripeStatusToInternalMock.mockReturnValue("past_due");
    mapStripeSubscriptionToTierMock.mockReturnValue("team");
    mapStripeTierToUserTierMock.mockReturnValue("flare-enterprises");

    const res = await POST(
      makeRequest('{"id":"evt_updated"}', { "stripe-signature": validSig }),
    );
    expect(res.status).toBe(200);

    expect(updateSubscriptionMock).toHaveBeenCalledTimes(1);
    const patch = updateSubscriptionMock.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(patch).toMatchObject({
      status: "past_due",
      tier: "team",
      stripePriceId: "price_pro_123",
    });
    expect(userTierUpdateMock).toHaveBeenCalled();
    // past_due is still a paid tier, so we still write the new tier
    // (not "free").
    expect(mapStripeTierToUserTierMock).toHaveBeenCalledWith("team");
  });

  it("demotes user.tier to free on customer.subscription.deleted", async () => {
    verifyStripeWebhookSignatureMock.mockReturnValue({
      id: "evt_deleted",
      type: "customer.subscription.deleted",
      data: { object: baseSubscription },
    });

    const res = await POST(
      makeRequest('{"id":"evt_deleted"}', { "stripe-signature": validSig }),
    );
    expect(res.status).toBe(200);

    expect(cancelSubscriptionMock).toHaveBeenCalledWith("sub_123");
    // demote user.tier to "free" -> Flare "free"
    expect(userTierUpdateMock).toHaveBeenCalled();
    expect(mapStripeTierToUserTierMock).toHaveBeenCalledWith("free");
  });

  it("marks past_due on invoice.payment_failed", async () => {
    verifyStripeWebhookSignatureMock.mockReturnValue({
      id: "evt_invoice_failed",
      type: "invoice.payment_failed",
      data: { object: { subscription: "sub_123" } },
    });

    const res = await POST(
      makeRequest('{"id":"evt_invoice_failed"}', {
        "stripe-signature": validSig,
      }),
    );
    expect(res.status).toBe(200);

    expect(updateSubscriptionMock).toHaveBeenCalledWith("sub_123", {
      status: "past_due",
    });
  });

  it("creates a subscription on checkout.session.completed", async () => {
    verifyStripeWebhookSignatureMock.mockReturnValue({
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_1",
          subscription: "sub_new",
          client_reference_id: "user_42",
          customer: "cus_new",
          metadata: {
            userId: "user_42",
            priceId: "price_pro_123",
          },
        },
      },
    });

    const res = await POST(
      makeRequest('{"id":"evt_checkout"}', { "stripe-signature": validSig }),
    );
    expect(res.status).toBe(200);

    expect(createSubscriptionMock).toHaveBeenCalledTimes(1);
    const input = createSubscriptionMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(input).toMatchObject({
      userId: "user_42",
      stripeSubscriptionId: "sub_new",
      stripeCustomerId: "cus_new",
      status: "active",
    });
  });

  it("returns 500 when the dispatch throws (Stripe retries)", async () => {
    verifyStripeWebhookSignatureMock.mockReturnValue({
      id: "evt_broken",
      type: "customer.subscription.updated",
      data: { object: baseSubscription },
    });
    updateSubscriptionMock.mockRejectedValue(new Error("DB down"));

    const res = await POST(
      makeRequest('{"id":"evt_broken"}', { "stripe-signature": validSig }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("PROCESSING_FAILED");
  });

  it("skips a subscription event whose userId cannot be resolved (no retry storm)", async () => {
    verifyStripeWebhookSignatureMock.mockReturnValue({
      id: "evt_no_user",
      type: "customer.subscription.created",
      data: {
        object: {
          ...baseSubscription,
          metadata: {}, // no userId
        },
      },
    });

    const res = await POST(
      makeRequest('{"id":"evt_no_user"}', { "stripe-signature": validSig }),
    );
    expect(res.status).toBe(200);
    expect(createSubscriptionMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalled();
  });
});
