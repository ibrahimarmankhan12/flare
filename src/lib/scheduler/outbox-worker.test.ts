//@vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock server-only so the worker can be imported in test env.
vi.mock("server-only", () => ({}));

// vi.mock factories are hoisted above all `const` declarations, so
// the mock objects must be created with vi.hoisted().
const mocks = vi.hoisted(() => ({
  acquireLeaderLock: vi.fn(),
  releaseLeaderLock: vi.fn(),
  claimPendingOutboxEvents: vi.fn(),
  markOutboxEventDelivered: vi.fn(),
  markOutboxEventFailed: vi.fn(),
  listWebhookSubscriptions: vi.fn(),
  getWebhookSubscriptionSigningSecret: vi.fn(),
  createWebhookDelivery: vi.fn(),
  markWebhookDeliveryDelivered: vi.fn(),
  markWebhookDeliveryFailed: vi.fn(),
}));

// Bypass the SSRF guard's real DNS lookups — the guard has its own suite
// (lib/webhooks/url-guard.test.ts); these tests cover outbox retry logic.
vi.mock("lib/webhooks/url-guard", () => ({
  UrlBlockedError: class UrlBlockedError extends Error {},
  assertPublicWebhookUrl: vi.fn(async (raw: string) => new URL(raw)),
}));

vi.mock("lib/scheduler/leader", () => ({
  acquireLeaderLock: mocks.acquireLeaderLock,
  releaseLeaderLock: mocks.releaseLeaderLock,
}));

vi.mock("lib/db/repository", () => ({
  webhookRepository: {
    claimPendingOutboxEvents: mocks.claimPendingOutboxEvents,
    markOutboxEventDelivered: mocks.markOutboxEventDelivered,
    markOutboxEventFailed: mocks.markOutboxEventFailed,
    listWebhookSubscriptions: mocks.listWebhookSubscriptions,
    getWebhookSubscriptionSigningSecret:
      mocks.getWebhookSubscriptionSigningSecret,
    createWebhookDelivery: mocks.createWebhookDelivery,
    markWebhookDeliveryDelivered: mocks.markWebhookDeliveryDelivered,
    markWebhookDeliveryFailed: mocks.markWebhookDeliveryFailed,
  },
}));

import { runOutboxTick, runOutboxTickForRoute } from "./outbox-worker";

const webhookRepositoryMock = {
  claimPendingOutboxEvents: mocks.claimPendingOutboxEvents,
  markOutboxEventDelivered: mocks.markOutboxEventDelivered,
  markOutboxEventFailed: mocks.markOutboxEventFailed,
  listWebhookSubscriptions: mocks.listWebhookSubscriptions,
  getWebhookSubscriptionSigningSecret:
    mocks.getWebhookSubscriptionSigningSecret,
  createWebhookDelivery: mocks.createWebhookDelivery,
  markWebhookDeliveryDelivered: mocks.markWebhookDeliveryDelivered,
  markWebhookDeliveryFailed: mocks.markWebhookDeliveryFailed,
};

const leaderMock = {
  acquireLeaderLock: mocks.acquireLeaderLock,
  releaseLeaderLock: mocks.releaseLeaderLock,
};

const baseEvent = (
  overrides: Partial<{
    id: string;
    attempts: number;
    maxAttempts: number;
    nextAttemptAt: Date;
    eventType: string;
    payload: Record<string, unknown>;
    createdAt: Date;
  }> = {},
) => ({
  id: "evt_1",
  kind: "outbound" as const,
  eventType: "thread.created",
  payload: { userId: "user_1" },
  status: "pending" as const,
  attempts: 0,
  maxAttempts: 5,
  nextAttemptAt: new Date(),
  lastError: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
  ...overrides,
});

const baseSubscription = (
  overrides: Partial<{
    id: string;
    url: string;
    enabled: boolean;
    userId: string;
    eventTypes: string[];
    signingSecret: string | null;
  }> = {},
) => ({
  id: "sub_1",
  userId: "user_1",
  url: "https://subscriber.example.com/hook",
  eventTypes: ["thread.created"],
  secretHash: "deadbeef",
  signingSecret: "whsec_signing_secret",
  description: null,
  enabled: true,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  ...overrides,
});

describe("outbox-worker", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    // Default: leader lock is held by us.
    leaderMock.acquireLeaderLock.mockResolvedValue(true);
    leaderMock.releaseLeaderLock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns skippedAsNotLeader when the lock is held by someone else", async () => {
    leaderMock.acquireLeaderLock.mockResolvedValue(false);
    const result = await runOutboxTick();
    expect(result).toEqual({
      claimed: 0,
      delivered: 0,
      failed: 0,
      retried: 0,
      skippedAsNotLeader: true,
    });
    expect(
      webhookRepositoryMock.claimPendingOutboxEvents,
    ).not.toHaveBeenCalled();
  });

  it("happy path: 1 event, 1 subscription, 200 → delivered=1", async () => {
    const event = baseEvent();
    webhookRepositoryMock.claimPendingOutboxEvents.mockResolvedValue([event]);
    webhookRepositoryMock.listWebhookSubscriptions.mockResolvedValue([
      baseSubscription(),
    ]);
    webhookRepositoryMock.getWebhookSubscriptionSigningSecret.mockResolvedValue(
      "whsec_signing_secret",
    );
    webhookRepositoryMock.createWebhookDelivery.mockResolvedValue({
      id: "del_1",
      eventId: event.id,
      subscriptionId: "sub_1",
      status: "pending",
    });
    webhookRepositoryMock.markWebhookDeliveryDelivered.mockResolvedValue(null);
    webhookRepositoryMock.markOutboxEventDelivered.mockResolvedValue(null);
    fetchSpy.mockResolvedValue(
      new Response("ok", { status: 200, statusText: "OK" }),
    );

    const result = await runOutboxTick();

    expect(result.claimed).toBe(1);
    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.retried).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(
      webhookRepositoryMock.markWebhookDeliveryDelivered,
    ).toHaveBeenCalledWith("del_1");
    expect(webhookRepositoryMock.markOutboxEventDelivered).toHaveBeenCalledWith(
      event.id,
    );
  });

  it("no matching subscriptions → event is marked delivered (0 deliveries created)", async () => {
    const event = baseEvent();
    webhookRepositoryMock.claimPendingOutboxEvents.mockResolvedValue([event]);
    webhookRepositoryMock.listWebhookSubscriptions.mockResolvedValue([]);
    webhookRepositoryMock.markOutboxEventDelivered.mockResolvedValue(null);

    const result = await runOutboxTick();

    expect(result.delivered).toBe(1);
    expect(webhookRepositoryMock.createWebhookDelivery).not.toHaveBeenCalled();
    expect(webhookRepositoryMock.markOutboxEventDelivered).toHaveBeenCalledWith(
      event.id,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("HTTP 500 → delivery marked failed and event retried (next_attempt_at in future)", async () => {
    const event = baseEvent({ attempts: 1, nextAttemptAt: new Date() });
    webhookRepositoryMock.claimPendingOutboxEvents.mockResolvedValue([event]);
    webhookRepositoryMock.listWebhookSubscriptions.mockResolvedValue([
      baseSubscription(),
    ]);
    webhookRepositoryMock.getWebhookSubscriptionSigningSecret.mockResolvedValue(
      "whsec_signing_secret",
    );
    webhookRepositoryMock.createWebhookDelivery.mockResolvedValue({
      id: "del_1",
      eventId: event.id,
      subscriptionId: "sub_1",
      status: "pending",
    });
    webhookRepositoryMock.markWebhookDeliveryFailed.mockResolvedValue(null);
    webhookRepositoryMock.markOutboxEventFailed.mockResolvedValue(null);
    fetchSpy.mockResolvedValue(
      new Response("boom", { status: 500, statusText: "Server Error" }),
    );

    const before = Date.now();
    const result = await runOutboxTick();
    const after = Date.now();

    expect(result.retried).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.delivered).toBe(0);
    expect(
      webhookRepositoryMock.markWebhookDeliveryFailed,
    ).toHaveBeenCalledWith("del_1", expect.stringContaining("500"));

    // Verify the retry was scheduled with a future nextAttemptAt.
    const callArgs = webhookRepositoryMock.markOutboxEventFailed.mock.calls[0];
    expect(callArgs?.[0]).toBe(event.id);
    const scheduledAt = callArgs?.[2] as Date;
    expect(scheduledAt.getTime()).toBeGreaterThanOrEqual(before);
    // Upper bound: at most ~1h + jitter, plus the test wall clock.
    expect(scheduledAt.getTime()).toBeLessThanOrEqual(after + 3_700_000);
  });

  it("attempts >= max_attempts → event marked failed, no retry", async () => {
    const event = baseEvent({ attempts: 5, maxAttempts: 5 });
    webhookRepositoryMock.claimPendingOutboxEvents.mockResolvedValue([event]);
    webhookRepositoryMock.listWebhookSubscriptions.mockResolvedValue([
      baseSubscription(),
    ]);
    webhookRepositoryMock.getWebhookSubscriptionSigningSecret.mockResolvedValue(
      "whsec_signing_secret",
    );
    webhookRepositoryMock.createWebhookDelivery.mockResolvedValue({
      id: "del_1",
      eventId: event.id,
      subscriptionId: "sub_1",
      status: "pending",
    });
    webhookRepositoryMock.markWebhookDeliveryFailed.mockResolvedValue(null);
    webhookRepositoryMock.markOutboxEventFailed.mockResolvedValue(null);
    fetchSpy.mockResolvedValue(
      new Response("boom", { status: 500, statusText: "Server Error" }),
    );

    const result = await runOutboxTick();

    expect(result.failed).toBe(1);
    expect(result.retried).toBe(0);
    expect(webhookRepositoryMock.markOutboxEventFailed).toHaveBeenCalledWith(
      event.id,
      expect.stringContaining("exceeded max attempts"),
      expect.any(Date),
    );
  });

  it("runOutboxTickForRoute delegates to runOutboxTick", async () => {
    leaderMock.acquireLeaderLock.mockResolvedValue(false);
    const result = await runOutboxTickForRoute();
    expect(result.skippedAsNotLeader).toBe(true);
  });
});
