import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sessionMock = vi.fn();
const listWebhookSubscriptionsForUserMock = vi.fn();
const createWebhookSubscriptionMock = vi.fn();

vi.mock("auth/server", () => ({
  getSession: (...args: unknown[]) => sessionMock(...args),
}));

vi.mock("lib/db/repository", () => ({
  webhookRepository: {
    listWebhookSubscriptionsForUser: (...args: unknown[]) =>
      listWebhookSubscriptionsForUserMock(...args),
    createWebhookSubscription: (...args: unknown[]) =>
      createWebhookSubscriptionMock(...args),
  },
}));

const { GET, POST } = await import("./route");

const okSession = { user: { id: "user-1" } };

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/webhook-subscription", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const subscriptionRow = {
  id: "sub-1",
  url: "https://example.com/webhook",
  eventTypes: ["thread.created"],
  description: "prod",
  enabled: true,
  failureCount: 2,
  lastSuccessAt: null,
  lastFailureAt: new Date("2026-06-01T10:00:00Z"),
  lastFailureReason: "500",
  createdAt: new Date("2026-06-01T09:00:00Z"),
};

describe("/api/webhook-subscription", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("GET returns 401 when not signed in", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listWebhookSubscriptionsForUserMock).not.toHaveBeenCalled();
  });

  it("GET lists owner subscriptions without secrets", async () => {
    sessionMock.mockResolvedValue(okSession);
    listWebhookSubscriptionsForUserMock.mockResolvedValue([
      { ...subscriptionRow, signingSecret: "whsec_hidden", secretHash: "hash" },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(listWebhookSubscriptionsForUserMock).toHaveBeenCalledWith("user-1");
    const body = await res.json();
    expect(body.subscriptions).toHaveLength(1);
    expect(body.subscriptions[0].signingSecret).toBeUndefined();
    expect(body.subscriptions[0].secretHash).toBeUndefined();
    expect(body.subscriptions[0].failureCount).toBe(2);
  });

  it("POST returns 401 when not signed in", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await POST(
      makeRequest({
        url: "https://example.com/webhook",
        eventTypes: ["thread.created"],
      }),
    );
    expect(res.status).toBe(401);
    expect(createWebhookSubscriptionMock).not.toHaveBeenCalled();
  });

  it("POST returns 400 for invalid JSON", async () => {
    sessionMock.mockResolvedValue(okSession);
    const res = await POST(makeRequest("{nope"));
    expect(res.status).toBe(400);
  });

  it("POST returns 400 for invalid URL", async () => {
    sessionMock.mockResolvedValue(okSession);
    const res = await POST(
      makeRequest({ url: "not-a-url", eventTypes: ["thread.created"] }),
    );
    expect(res.status).toBe(400);
    expect(createWebhookSubscriptionMock).not.toHaveBeenCalled();
  });

  it("POST returns 400 for unsupported event type", async () => {
    sessionMock.mockResolvedValue(okSession);
    const res = await POST(
      makeRequest({
        url: "https://example.com/webhook",
        eventTypes: ["unknown.event"],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("POST returns 400 for duplicate event types", async () => {
    sessionMock.mockResolvedValue(okSession);
    const res = await POST(
      makeRequest({
        url: "https://example.com/webhook",
        eventTypes: ["thread.created", "thread.created"],
      }),
    );
    expect(res.status).toBe(400);
    expect(createWebhookSubscriptionMock).not.toHaveBeenCalled();
  });

  it("POST creates a subscription with a supplied signing secret", async () => {
    sessionMock.mockResolvedValue(okSession);
    createWebhookSubscriptionMock.mockResolvedValue(subscriptionRow);

    const res = await POST(
      makeRequest({
        url: "https://example.com/webhook",
        eventTypes: ["thread.created"],
        description: "prod",
        signingSecret: "whsec_custom_secret_123",
      }),
    );

    expect(res.status).toBe(201);
    expect(createWebhookSubscriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/webhook",
        eventTypes: ["thread.created"],
        description: "prod",
        signingSecret: "whsec_custom_secret_123",
        secretHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      "user-1",
    );
    const body = await res.json();
    expect(body.signingSecret).toBe("whsec_custom_secret_123");
    expect(body.subscription.signingSecret).toBeUndefined();
  });

  it("POST generates and returns a signing secret once when omitted", async () => {
    sessionMock.mockResolvedValue(okSession);
    createWebhookSubscriptionMock.mockResolvedValue(subscriptionRow);

    const res = await POST(
      makeRequest({
        url: "https://example.com/webhook",
        eventTypes: ["message.created"],
      }),
    );

    expect(res.status).toBe(201);
    const createInput = createWebhookSubscriptionMock.mock.calls[0][0];
    expect(createInput.signingSecret).toMatch(/^whsec_/);
    expect(createInput.secretHash).toMatch(/^[a-f0-9]{64}$/);
    const body = await res.json();
    expect(body.signingSecret).toBe(createInput.signingSecret);
    expect(body.subscription.signingSecret).toBeUndefined();
  });

  it("POST returns 500 when repository creation fails", async () => {
    sessionMock.mockResolvedValue(okSession);
    createWebhookSubscriptionMock.mockRejectedValue(new Error("db down"));

    const res = await POST(
      makeRequest({
        url: "https://example.com/webhook",
        eventTypes: ["thread.created"],
      }),
    );

    expect(res.status).toBe(500);
  });
});
