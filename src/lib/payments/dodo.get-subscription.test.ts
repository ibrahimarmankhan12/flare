import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("lib/db/repository", () => ({
  siteConfigRepository: {
    getConfig: vi.fn(async () => null),
  },
}));

vi.mock("lib/security/encryption", () => ({
  decrypt: vi.fn(() => {
    throw new Error("decrypt not configured for tests");
  }),
}));

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

describe("Dodo getDodoSubscription", () => {
  beforeEach(() => {
    process.env.DODO_PAYMENTS_API_KEY = "test_api_key";
    process.env.DODO_WEBHOOK_SECRET = "whsec_test";
    process.env.DODO_ENVIRONMENT = "test_mode";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("returns parsed subscription fields on a 200 response", async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          subscription_id: "sub_abc123",
          product_id: "prod_xyz",
          customer_id: "cus_456",
          status: "active",
          current_period_start: "2026-06-01T00:00:00Z",
          current_period_end: "2026-07-01T00:00:00Z",
          cancel_at_period_end: false,
          metadata: { flareUserId: "user_1", tier: "flare-pro" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { getDodoSubscription } = await import("./dodo");
    const result = await getDodoSubscription("sub_abc123");
    expect(result.subscriptionId).toBe("sub_abc123");
    expect(result.productId).toBe("prod_xyz");
    expect(result.customerId).toBe("cus_456");
    expect(result.status).toBe("active");
    expect(result.nextBillingDate?.toISOString()).toBe(
      "2026-07-01T00:00:00.000Z",
    );
    expect(result.cancelAtNextBillingDate).toBe(false);
    expect(result.metadata.flareUserId).toBe("user_1");
    expect(result.metadata.tier).toBe("flare-pro");

    // Verify auth + URL
    const call = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toContain("/subscriptions/sub_abc123");
    expect(call[1].headers).toMatchObject({
      Authorization: "Bearer test_api_key",
      Accept: "application/json",
    });
  });

  it("accepts a wrapped { data: ... } response", async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: {
            id: "sub_xyz",
            product_id: "prod_a",
            status: "trialing",
            metadata: { flareUserId: "user_2" },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    const { getDodoSubscription } = await import("./dodo");
    const result = await getDodoSubscription("sub_xyz");
    expect(result.subscriptionId).toBe("sub_xyz");
    expect(result.status).toBe("trialing");
    expect(result.productId).toBe("prod_a");
  });

  it("throws DodoPaymentsError on a 404 response (subscription not found)", async () => {
    const mockFetch = vi.fn(async () => {
      return new Response("not found", { status: 404 });
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    const { getDodoSubscription, DodoPaymentsError } = await import("./dodo");
    await expect(getDodoSubscription("sub_missing")).rejects.toBeInstanceOf(
      DodoPaymentsError,
    );
    try {
      await getDodoSubscription("sub_missing");
    } catch (e) {
      expect((e as InstanceType<typeof DodoPaymentsError>).status).toBe(404);
    }
  });

  it("throws DodoPaymentsError when the API key is not configured", async () => {
    delete process.env.DODO_PAYMENTS_API_KEY;
    const { getDodoSubscription, DodoPaymentsError } = await import("./dodo");
    await expect(getDodoSubscription("sub_abc")).rejects.toBeInstanceOf(
      DodoPaymentsError,
    );
    try {
      await getDodoSubscription("sub_abc");
    } catch (e) {
      expect((e as InstanceType<typeof DodoPaymentsError>).status).toBe(503);
    }
  });

  it("handles missing fields gracefully (no product_id, no metadata)", async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(JSON.stringify({ status: "active" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    const { getDodoSubscription } = await import("./dodo");
    const result = await getDodoSubscription("sub_partial");
    // Falls back to the id we asked for
    expect(result.subscriptionId).toBe("sub_partial");
    expect(result.productId).toBe("");
    expect(result.customerId).toBeNull();
    expect(result.status).toBe("active");
    expect(result.metadata).toEqual({});
  });

  it("parses the real Dodo response shape (nested customer, next_billing_date, cancel_at_next_billing_date)", async () => {
    // This payload matches the actual Dodo API per the docs at
    // https://docs.dodopayments.com/api-reference/subscriptions/get-subscriptions.md
    const mockFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          subscription_id: "sub_real_123",
          product_id: "prod_real",
          status: "active",
          previous_billing_date: "2026-05-01T00:00:00Z",
          next_billing_date: "2026-06-01T00:00:00Z",
          cancel_at_next_billing_date: true,
          customer: {
            customer_id: "cus_nested_abc",
            name: "Real User",
            email: "real@example.com",
          },
          metadata: { flareUserId: "user_real", tier: "flare-pro" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    const { getDodoSubscription } = await import("./dodo");
    const result = await getDodoSubscription("sub_real_123");

    // `customer_id` is nested under `customer`, not top-level.
    expect(result.customerId).toBe("cus_nested_abc");
    // Real Dodo field names, not the older `current_period_*` aliases.
    expect(result.previousBillingDate?.toISOString()).toBe(
      "2026-05-01T00:00:00.000Z",
    );
    expect(result.nextBillingDate?.toISOString()).toBe(
      "2026-06-01T00:00:00.000Z",
    );
    expect(result.cancelAtNextBillingDate).toBe(true);
    expect(result.productId).toBe("prod_real");
    expect(result.metadata.flareUserId).toBe("user_real");
  });

  it("falls back to the older `current_period_*` aliases when present", async () => {
    // Defensive: in case Dodo ever serves a payload with the older
    // field names (or a custom env / staging variant), we should
    // still extract the values rather than silently dropping them.
    const mockFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          subscription_id: "sub_legacy_456",
          product_id: "prod_legacy",
          status: "active",
          current_period_start: "2026-04-01T00:00:00Z",
          current_period_end: "2026-05-01T00:00:00Z",
          cancel_at_period_end: false,
          customer_id: "cus_legacy_top",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    const { getDodoSubscription } = await import("./dodo");
    const result = await getDodoSubscription("sub_legacy_456");
    expect(result.previousBillingDate?.toISOString()).toBe(
      "2026-04-01T00:00:00.000Z",
    );
    expect(result.nextBillingDate?.toISOString()).toBe(
      "2026-05-01T00:00:00.000Z",
    );
    expect(result.cancelAtNextBillingDate).toBe(false);
    expect(result.customerId).toBe("cus_legacy_top");
  });
});
