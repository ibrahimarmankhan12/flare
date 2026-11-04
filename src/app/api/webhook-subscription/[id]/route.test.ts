import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sessionMock = vi.fn();
const getWebhookSubscriptionMock = vi.fn();
const updateWebhookSubscriptionMock = vi.fn();
const deleteWebhookSubscriptionMock = vi.fn();

vi.mock("auth/server", () => ({
  getSession: (...args: unknown[]) => sessionMock(...args),
}));

vi.mock("lib/db/repository", () => ({
  webhookRepository: {
    getWebhookSubscription: (...args: unknown[]) =>
      getWebhookSubscriptionMock(...args),
    updateWebhookSubscription: (...args: unknown[]) =>
      updateWebhookSubscriptionMock(...args),
    deleteWebhookSubscription: (...args: unknown[]) =>
      deleteWebhookSubscriptionMock(...args),
  },
}));

const { GET, PATCH, DELETE } = await import("./route");

const okSession = { user: { id: "user-1" } };
const params = { params: Promise.resolve({ id: "sub-1" }) };

const row = {
  id: "sub-1",
  url: "https://example.com/webhook",
  eventTypes: ["thread.created"],
  description: "prod",
  enabled: true,
  failureCount: 0,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastFailureReason: null,
  createdAt: new Date("2026-06-01T09:00:00Z"),
};

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/webhook-subscription/sub-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("/api/webhook-subscription/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("GET returns 401 when not signed in", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), params);
    expect(res.status).toBe(401);
  });

  it("GET returns 404 when subscription is not owned", async () => {
    sessionMock.mockResolvedValue(okSession);
    getWebhookSubscriptionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), params);
    expect(res.status).toBe(404);
    expect(getWebhookSubscriptionMock).toHaveBeenCalledWith("sub-1", "user-1");
  });

  it("GET returns subscription metadata without secrets", async () => {
    sessionMock.mockResolvedValue(okSession);
    getWebhookSubscriptionMock.mockResolvedValue({
      ...row,
      signingSecret: "whsec_hidden",
      secretHash: "hash",
    });
    const res = await GET(new Request("http://localhost"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscription.id).toBe("sub-1");
    expect(body.subscription.signingSecret).toBeUndefined();
    expect(body.subscription.secretHash).toBeUndefined();
  });

  it("PATCH returns 400 for an empty patch", async () => {
    sessionMock.mockResolvedValue(okSession);
    const res = await PATCH(makeRequest({}), params);
    expect(res.status).toBe(400);
    expect(updateWebhookSubscriptionMock).not.toHaveBeenCalled();
  });

  it("PATCH returns 400 for unsupported event type", async () => {
    sessionMock.mockResolvedValue(okSession);
    const res = await PATCH(makeRequest({ eventTypes: ["bad.event"] }), params);
    expect(res.status).toBe(400);
  });

  it("PATCH returns 400 for duplicate event types", async () => {
    sessionMock.mockResolvedValue(okSession);
    const res = await PATCH(
      makeRequest({ eventTypes: ["message.created", "message.created"] }),
      params,
    );
    expect(res.status).toBe(400);
    expect(updateWebhookSubscriptionMock).not.toHaveBeenCalled();
  });

  it("PATCH returns 401 when not signed in", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest({ url: "https://example.com/new" }),
      params,
    );
    expect(res.status).toBe(401);
    expect(updateWebhookSubscriptionMock).not.toHaveBeenCalled();
  });

  it("PATCH updates URL and event types", async () => {
    sessionMock.mockResolvedValue(okSession);
    updateWebhookSubscriptionMock.mockResolvedValue({
      ...row,
      url: "https://example.com/new",
      eventTypes: ["message.created"],
    });
    const res = await PATCH(
      makeRequest({
        url: "https://example.com/new",
        eventTypes: ["message.created"],
      }),
      params,
    );
    expect(res.status).toBe(200);
    expect(updateWebhookSubscriptionMock).toHaveBeenCalledWith(
      "sub-1",
      "user-1",
      expect.objectContaining({
        url: "https://example.com/new",
        eventTypes: ["message.created"],
      }),
    );
  });

  it("PATCH updates enabled state without returning secrets", async () => {
    sessionMock.mockResolvedValue(okSession);
    updateWebhookSubscriptionMock.mockResolvedValue({ ...row, enabled: false });

    const res = await PATCH(makeRequest({ enabled: false }), params);

    expect(res.status).toBe(200);
    expect(updateWebhookSubscriptionMock).toHaveBeenCalledWith(
      "sub-1",
      "user-1",
      expect.objectContaining({ enabled: false }),
    );
    const body = await res.json();
    expect(body.subscription.enabled).toBe(false);
    expect(body.subscription.signingSecret).toBeUndefined();
    expect(body.subscription.secretHash).toBeUndefined();
  });

  it("PATCH rotates signing secret without returning it", async () => {
    sessionMock.mockResolvedValue(okSession);
    updateWebhookSubscriptionMock.mockResolvedValue(row);
    const res = await PATCH(
      makeRequest({ signingSecret: "whsec_rotated_secret_123" }),
      params,
    );
    expect(res.status).toBe(200);
    expect(updateWebhookSubscriptionMock).toHaveBeenCalledWith(
      "sub-1",
      "user-1",
      expect.objectContaining({
        signingSecret: "whsec_rotated_secret_123",
        secretHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    const body = await res.json();
    expect(body.signingSecret).toBeUndefined();
    expect(body.subscription.signingSecret).toBeUndefined();
  });

  it("PATCH returns 404 when the subscription is not owned", async () => {
    sessionMock.mockResolvedValue(okSession);
    updateWebhookSubscriptionMock.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest({ url: "https://example.com/new" }),
      params,
    );
    expect(res.status).toBe(404);
    expect(updateWebhookSubscriptionMock).toHaveBeenCalledWith(
      "sub-1",
      "user-1",
      expect.objectContaining({ url: "https://example.com/new" }),
    );
  });

  it("DELETE returns 401 when not signed in", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await DELETE(new Request("http://localhost"), params);
    expect(res.status).toBe(401);
    expect(deleteWebhookSubscriptionMock).not.toHaveBeenCalled();
  });

  it("DELETE returns 204 on successful delete", async () => {
    sessionMock.mockResolvedValue(okSession);
    deleteWebhookSubscriptionMock.mockResolvedValue(true);
    const res = await DELETE(new Request("http://localhost"), params);
    expect(res.status).toBe(204);
    expect(deleteWebhookSubscriptionMock).toHaveBeenCalledWith(
      "sub-1",
      "user-1",
    );
  });

  it("DELETE returns 404 when the subscription is not owned", async () => {
    sessionMock.mockResolvedValue(okSession);
    deleteWebhookSubscriptionMock.mockResolvedValue(false);
    const res = await DELETE(new Request("http://localhost"), params);
    expect(res.status).toBe(404);
    expect(deleteWebhookSubscriptionMock).toHaveBeenCalledWith(
      "sub-1",
      "user-1",
    );
  });
});
