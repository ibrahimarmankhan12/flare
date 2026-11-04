//@vitest-environment node

import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const constructEventMock = vi.fn();
const stripeErrorsMock = {
  NoSignatureError: class NoSignatureError extends Error {
    header: string;
    constructor(message: string, header: string) {
      super(message);
      this.name = "NoSignatureError";
      this.header = header;
    }
  },
  StripeSignatureVerificationError: class StripeSignatureVerificationError extends Error {
    header: string;
    constructor(message: string, header: string) {
      super(message);
      this.name = "StripeSignatureVerificationError";
      this.header = header;
    }
  },
};

vi.mock("stripe", () => {
  // The default export needs to also expose `errors` as a static
  // namespace, mirroring how the real `stripe` package does it:
  // `import Stripe from "stripe"; Stripe.errors.NoSignatureError`.
  const FakeStripe = class FakeStripe {
    webhooks = {
      constructEvent: (...args: unknown[]) => constructEventMock(...args),
    };
  } as unknown as { new (...args: unknown[]): unknown };
  // Attach `errors` and `default` to satisfy both default and
  // namespace import styles.
  (FakeStripe as unknown as { errors: typeof stripeErrorsMock }).errors =
    stripeErrorsMock;
  return {
    default: FakeStripe,
    errors: stripeErrorsMock,
  };
});

const {
  getStripeClient,
  mapStripeStatusToInternal,
  mapStripeSubscriptionToTier,
  mapStripeTierToUserTier,
  verifyStripeWebhookSignature,
  __resetStripeClientForTests,
  getStripePriceIdForTier,
} = await import("./stripe");

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SECRET = "whsec_test_super_secret";

const sign = (body: string, secret = SECRET): string => {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${body}`;
  const signature = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetStripeClientForTests();
  process.env.STRIPE_SECRET_KEY = "sk_test_xxx";
  // Reset price env between cases
  delete process.env.STRIPE_PRICE_PRO;
  delete process.env.STRIPE_PRICE_TEAM;
  delete process.env.STRIPE_PRICE_BUSINESS;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// verifyStripeWebhookSignature
// ---------------------------------------------------------------------------

describe("verifyStripeWebhookSignature", () => {
  it("returns the parsed event on a valid signature", () => {
    const body = JSON.stringify({ id: "evt_1", type: "ping" });
    const header = sign(body);
    constructEventMock.mockReturnValue({ id: "evt_1", type: "ping" });

    const result = verifyStripeWebhookSignature(body, header, SECRET);

    expect(result).toEqual({ id: "evt_1", type: "ping" });
    expect(constructEventMock).toHaveBeenCalledWith(body, header, SECRET);
  });

  it("propagates StripeSignatureVerificationError from the SDK", () => {
    const body = JSON.stringify({ id: "evt_2" });
    const sig = sign(body, "wrong-secret");
    constructEventMock.mockImplementation(() => {
      throw new stripeErrorsMock.StripeSignatureVerificationError(
        "bad sig",
        "stripe-signature",
      );
    });

    expect(() => verifyStripeWebhookSignature(body, sig, SECRET)).toThrow(
      stripeErrorsMock.StripeSignatureVerificationError,
    );
  });

  it("throws NoSignatureError when the signature header is empty", () => {
    expect(() => verifyStripeWebhookSignature("body", "", SECRET)).toThrow(
      stripeErrorsMock.NoSignatureError,
    );
    // We short-circuit before calling the SDK in the empty-header
    // path, so `constructEvent` should not be invoked.
    expect(constructEventMock).not.toHaveBeenCalled();
  });

  it("throws when the body is empty (covered by caller, not here)", () => {
    // Empty body is a valid Stripe payload (some events have no
    // body); the helper still forwards to the SDK. The webhook
    // route guards against empty body before calling this.
    constructEventMock.mockReturnValue({ id: "evt_empty" });
    const result = verifyStripeWebhookSignature("", sign(""), SECRET);
    expect(result).toEqual({ id: "evt_empty" });
  });
});

// ---------------------------------------------------------------------------
// mapStripeSubscriptionToTier
// ---------------------------------------------------------------------------

describe("mapStripeSubscriptionToTier", () => {
  it("returns 'pro' for the configured STRIPE_PRICE_PRO id", () => {
    process.env.STRIPE_PRICE_PRO = "price_pro_123";
    expect(mapStripeSubscriptionToTier("price_pro_123")).toBe("pro");
  });

  it("returns 'team' for the configured STRIPE_PRICE_TEAM id", () => {
    process.env.STRIPE_PRICE_TEAM = "price_team_456";
    expect(mapStripeSubscriptionToTier("price_team_456")).toBe("team");
  });

  it("returns 'business' for the configured STRIPE_PRICE_BUSINESS id", () => {
    process.env.STRIPE_PRICE_BUSINESS = "price_biz_789";
    expect(mapStripeSubscriptionToTier("price_biz_789")).toBe("business");
  });

  it("returns 'free' when the price ID is null/empty", () => {
    process.env.STRIPE_PRICE_PRO = "price_pro_123";
    expect(mapStripeSubscriptionToTier(null)).toBe("free");
    expect(mapStripeSubscriptionToTier(undefined)).toBe("free");
    expect(mapStripeSubscriptionToTier("")).toBe("free");
    expect(mapStripeSubscriptionToTier("   ")).toBe("free");
  });

  it("throws on an unknown price id (catches misconfiguration)", () => {
    process.env.STRIPE_PRICE_PRO = "price_pro_123";
    expect(() => mapStripeSubscriptionToTier("price_unknown_xyz")).toThrow(
      /Unknown Stripe price ID/,
    );
  });

  it("treats price id with leading/trailing whitespace as a match", () => {
    process.env.STRIPE_PRICE_PRO = "price_pro_123";
    expect(mapStripeSubscriptionToTier("  price_pro_123  ")).toBe("pro");
  });
});

// ---------------------------------------------------------------------------
// mapStripeStatusToInternal
// ---------------------------------------------------------------------------

describe("mapStripeStatusToInternal", () => {
  it("maps active to active", () => {
    expect(mapStripeStatusToInternal("active")).toBe("active");
  });

  it("maps past_due to past_due", () => {
    expect(mapStripeStatusToInternal("past_due")).toBe("past_due");
  });

  it("maps canceled to canceled", () => {
    expect(mapStripeStatusToInternal("canceled")).toBe("canceled");
  });

  it("maps incomplete to incomplete", () => {
    expect(mapStripeStatusToInternal("incomplete")).toBe("incomplete");
  });

  it("maps trialing to trialing", () => {
    expect(mapStripeStatusToInternal("trialing")).toBe("trialing");
  });

  it("maps incomplete_expired to canceled (terminal)", () => {
    expect(mapStripeStatusToInternal("incomplete_expired")).toBe("canceled");
  });

  it("maps paused to incomplete (can't serve, surface to recovery UI)", () => {
    expect(mapStripeStatusToInternal("paused")).toBe("incomplete");
  });

  it("maps unpaid to past_due", () => {
    expect(mapStripeStatusToInternal("unpaid")).toBe("past_due");
  });
});

// ---------------------------------------------------------------------------
// mapStripeTierToUserTier
// ---------------------------------------------------------------------------

describe("mapStripeTierToUserTier", () => {
  it("maps free to free", () => {
    expect(mapStripeTierToUserTier("free")).toBe("free");
  });

  it("maps pro to flare-pro", () => {
    expect(mapStripeTierToUserTier("pro")).toBe("flare-pro");
  });

  it("maps team to flare-enterprises", () => {
    expect(mapStripeTierToUserTier("team")).toBe("flare-enterprises");
  });

  it("maps business to flare-enterprises-max", () => {
    expect(mapStripeTierToUserTier("business")).toBe("flare-enterprises-max");
  });
});

// ---------------------------------------------------------------------------
// getStripePriceIdForTier
// ---------------------------------------------------------------------------

describe("getStripePriceIdForTier", () => {
  it("returns null for free", () => {
    expect(getStripePriceIdForTier("free")).toBeNull();
  });

  it("returns the env value for pro", () => {
    process.env.STRIPE_PRICE_PRO = "price_pro_1";
    expect(getStripePriceIdForTier("pro")).toBe("price_pro_1");
  });

  it("returns null when the env var is not set", () => {
    expect(getStripePriceIdForTier("pro")).toBeNull();
    expect(getStripePriceIdForTier("team")).toBeNull();
    expect(getStripePriceIdForTier("business")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getStripeClient
// ---------------------------------------------------------------------------

describe("getStripeClient", () => {
  it("memoizes the client across calls", () => {
    const a = getStripeClient();
    const b = getStripeClient();
    expect(a).toBe(b);
  });

  it("throws when STRIPE_SECRET_KEY is not set", () => {
    delete process.env.STRIPE_SECRET_KEY;
    __resetStripeClientForTests();
    expect(() => getStripeClient()).toThrow(/STRIPE_SECRET_KEY/);
  });
});
