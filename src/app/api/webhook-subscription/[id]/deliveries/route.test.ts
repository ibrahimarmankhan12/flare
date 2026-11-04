import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sessionMock = vi.fn();
const getWebhookSubscriptionMock = vi.fn();
const listWebhookDeliveriesForSubscriptionMock = vi.fn();

vi.mock("auth/server", () => ({
  getSession: (...args: unknown[]) => sessionMock(...args),
}));

vi.mock("lib/db/repository", () => ({
  webhookRepository: {
    getWebhookSubscription: (...args: unknown[]) =>
      getWebhookSubscriptionMock(...args),
    listWebhookDeliveriesForSubscription: (...args: unknown[]) =>
      listWebhookDeliveriesForSubscriptionMock(...args),
  },
}));

const { GET } = await import("./route");

const okSession = { user: { id: "user-1" } };
const params = { params: Promise.resolve({ id: "sub-1" }) };

const request = new Request(
  "http://localhost/api/webhook-subscription/sub-1/deliveries",
);

describe("/api/webhook-subscription/[id]/deliveries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when not signed in", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await GET(request, params);
    expect(res.status).toBe(401);
    expect(listWebhookDeliveriesForSubscriptionMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the subscription is not owned", async () => {
    sessionMock.mockResolvedValue(okSession);
    getWebhookSubscriptionMock.mockResolvedValue(null);
    const res = await GET(request, params);
    expect(res.status).toBe(404);
    expect(getWebhookSubscriptionMock).toHaveBeenCalledWith("sub-1", "user-1");
    expect(listWebhookDeliveriesForSubscriptionMock).not.toHaveBeenCalled();
  });

  it("returns latest delivery attempts with event details", async () => {
    sessionMock.mockResolvedValue(okSession);
    getWebhookSubscriptionMock.mockResolvedValue({ id: "sub-1" });
    listWebhookDeliveriesForSubscriptionMock.mockResolvedValue([
      {
        delivery: {
          id: "delivery-1",
          status: "failed",
          attempts: 2,
          lastError: "timeout",
          deliveredAt: null,
          createdAt: new Date("2026-06-01T10:00:00Z"),
          updatedAt: new Date("2026-06-01T10:01:00Z"),
        },
        event: {
          id: "event-1",
          kind: "outbound",
          eventType: "message.created",
          payload: { messageId: "m1" },
          status: "pending",
          attempts: 2,
          maxAttempts: 5,
          lastError: "timeout",
          createdAt: new Date("2026-06-01T09:59:00Z"),
        },
      },
    ]);

    const res = await GET(request, params);
    expect(res.status).toBe(200);
    expect(listWebhookDeliveriesForSubscriptionMock).toHaveBeenCalledWith(
      "sub-1",
      "user-1",
    );
    const body = await res.json();
    expect(body.deliveries).toHaveLength(1);
    expect(body.deliveries[0]).toMatchObject({
      id: "delivery-1",
      status: "failed",
      lastError: "timeout",
      event: {
        id: "event-1",
        eventType: "message.created",
        payload: { messageId: "m1" },
      },
    });
  });
});
