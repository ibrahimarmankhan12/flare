import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module under test imports "server-only", which throws when
// imported from anything but a server component. Stub it out for
// the unit test runner.
vi.mock("server-only", () => ({}));

// The async config reader pulls from site_config + tools.apiKeysSecrets.
// For pure signature/mapping tests we want env-only behaviour, so
// return empty stubs.
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
import { createHmac } from "node:crypto";

const originalEnv = { ...process.env };

const signPayload = (
  secret: string,
  id: string,
  timestamp: string,
  body: string,
): string => {
  const rawKey = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  return createHmac("sha256", rawKey)
    .update(`${id}.${timestamp}.${body}`)
    .digest("hex");
};

const makeHeaders = (id: string, timestamp: string, signature: string) => {
  const headers = new Headers();
  headers.set("webhook-id", id);
  headers.set("webhook-timestamp", timestamp);
  headers.set("webhook-signature", `v1,${signature}`);
  return headers;
};

describe("Dodo Payments webhook signature verification", () => {
  beforeEach(() => {
    process.env.DODO_PAYMENTS_API_KEY = "test_key";
    process.env.DODO_WEBHOOK_SECRET = "whsec_super_secret_key";
    process.env.DODO_ENVIRONMENT = "test_mode";
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
  });

  it("verifies a correctly signed payload", async () => {
    const { parseWebhookRequest, verifyWebhookSignature } = await import(
      "./dodo"
    );
    const id = "evt_test_1";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: "subscription.active", data: {} });
    const sig = signPayload("whsec_super_secret_key", id, timestamp, body);
    const headers = makeHeaders(id, timestamp, sig);

    expect(
      await verifyWebhookSignature({
        rawBody: body,
        headers: { id, timestamp, signature: `v1,${sig}` },
      }),
    ).toBe(true);

    const event = await parseWebhookRequest(body, headers);
    expect(event.webhookId).toBe(id);
    expect(event.eventType).toBe("subscription.active");
  });

  it("rejects a tampered body", async () => {
    const { verifyWebhookSignature } = await import("./dodo");
    const id = "evt_test_2";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: "subscription.active" });
    const sig = signPayload("whsec_super_secret_key", id, timestamp, body);
    const tampered = JSON.stringify({ type: "subscription.cancelled" });
    expect(
      await verifyWebhookSignature({
        rawBody: tampered,
        headers: { id, timestamp, signature: `v1,${sig}` },
      }),
    ).toBe(false);
  });

  it("rejects a stale timestamp", async () => {
    const { verifyWebhookSignature } = await import("./dodo");
    const id = "evt_test_3";
    const timestamp = String(Math.floor(Date.now() / 1000) - 60 * 60); // 1h ago
    const body = "{}";
    const sig = signPayload("whsec_super_secret_key", id, timestamp, body);
    expect(
      await verifyWebhookSignature({
        rawBody: body,
        headers: { id, timestamp, signature: `v1,${sig}` },
      }),
    ).toBe(false);
  });

  it("accepts any signature in a multi-secret header", async () => {
    const { verifyWebhookSignature } = await import("./dodo");
    const id = "evt_test_4";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = '{"ok":true}';
    const valid = signPayload("whsec_super_secret_key", id, timestamp, body);
    const combined = `v1,deadbeef v1,${valid}`;
    expect(
      await verifyWebhookSignature({
        rawBody: body,
        headers: { id, timestamp, signature: combined },
      }),
    ).toBe(true);
  });

  it("rejects when the secret is not configured", async () => {
    delete process.env.DODO_WEBHOOK_SECRET;
    const { verifyWebhookSignature } = await import("./dodo");
    expect(
      await verifyWebhookSignature({
        rawBody: "{}",
        headers: {
          id: "x",
          timestamp: String(Math.floor(Date.now() / 1000)),
          signature: "v1,00",
        },
      }),
    ).toBe(false);
  });

  it("rejects when headers are missing", async () => {
    const { verifyWebhookSignature } = await import("./dodo");
    expect(
      await verifyWebhookSignature({
        rawBody: "{}",
        headers: { id: null, timestamp: null, signature: null },
      }),
    ).toBe(false);
  });
});

describe("Dodo Payments product/tier mapping", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns the configured product id for a paid tier", async () => {
    process.env.DODO_PRODUCT_FLARE_ENTERPRISES = "prod_abc";
    const { getDodoProductIdForTier, getTierForDodoProductId } = await import(
      "./dodo"
    );
    expect(await getDodoProductIdForTier("flare-enterprises")).toBe("prod_abc");
    expect(getTierForDodoProductId("prod_abc")).toBe("flare-enterprises");
  });

  it("returns null for the free tier and unknown products", async () => {
    const { getDodoProductIdForTier, getTierForDodoProductId } = await import(
      "./dodo"
    );
    expect(await getDodoProductIdForTier("free")).toBeNull();
    expect(getTierForDodoProductId("not_a_real_id")).toBeNull();
  });
});
