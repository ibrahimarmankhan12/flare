import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getPublishedAgentMock = vi.fn();
const createEmbedSessionMock = vi.fn();
const getEmbedSessionByTokenMock = vi.fn();
const incrementDailyMessageCountMock = vi.fn();
const resetDailyCountIfNeededMock = vi.fn();
const generateUUIDMock = vi.fn();

vi.mock("lib/db/repository", () => ({
  agentInstallRepository: {
    getPublishedAgent: (...args: any[]) => getPublishedAgentMock(...args),
  },
  embedSessionRepository: {
    createEmbedSession: (...args: any[]) => createEmbedSessionMock(...args),
    getEmbedSessionByToken: (...args: any[]) =>
      getEmbedSessionByTokenMock(...args),
    incrementDailyMessageCount: (...args: any[]) =>
      incrementDailyMessageCountMock(...args),
    resetDailyCountIfNeeded: (...args: any[]) =>
      resetDailyCountIfNeededMock(...args),
  },
}));

vi.mock("lib/utils", () => ({
  generateUUID: (...args: any[]) => generateUUIDMock(...args),
}));

vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    getModelWithFailureFallback: vi.fn(() => "model"),
  },
}));

vi.mock("lib/ai/prompts", () => ({
  buildUserSystemPromptWithMemory: vi.fn(async () => "system prompt"),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    convertToModelMessages: vi.fn((messages) => messages),
    smoothStream: vi.fn(() => undefined),
    streamText: vi.fn(() => ({
      toUIMessageStreamResponse: () => new Response("stream", { status: 200 }),
    })),
  };
});

import { mintEmbedToken } from "auth/embed-jwt";
import { GET, POST } from "./route";

const publishedAgent = {
  id: "agent-1",
  name: "Support Agent",
  description: "Helpful support",
  icon: null,
  instructions: { systemPrompt: "Help visitors" },
  publishedAt: new Date("2026-05-01T12:00:00Z"),
};

const activeSession = {
  id: "session-1",
  agentId: "agent-1",
  userId: "owner-1",
  anonymousToken: "anon-token-1",
  rateLimitTier: "free",
  dailyMessageCount: 0,
  dailyResetAt: new Date("2026-06-01T12:00:00Z"),
  firstMessageCaptchaAt: null,
  expiresAt: new Date("2026-06-01T12:15:00Z"),
  revokedAt: null,
  createdAt: new Date("2026-06-01T12:00:00Z"),
  updatedAt: new Date("2026-06-01T12:00:00Z"),
};

const makeSessionRequest = (
  body: unknown,
  url = "http://localhost/api/embed/session",
) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const makeToken = (overrides: Partial<typeof activeSession> = {}) => {
  const session = { ...activeSession, ...overrides };
  return mintEmbedToken({
    agentId: session.agentId,
    sessionId: session.id,
    anonymousToken: session.anonymousToken,
    now: new Date("2026-06-01T12:00:00Z"),
  });
};

describe("POST /api/embed/session", () => {
  beforeEach(() => {
    vi.useRealTimers();
    process.env.EMBED_JWT_SECRET = "test-secret";
    getPublishedAgentMock.mockReset();
    createEmbedSessionMock.mockReset();
    getEmbedSessionByTokenMock.mockReset();
    incrementDailyMessageCountMock.mockReset();
    resetDailyCountIfNeededMock.mockReset();
    generateUUIDMock.mockReset();
    generateUUIDMock.mockReturnValue("anon-token-1");
  });

  it("creates an anonymous embed session for a published agent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
    getPublishedAgentMock.mockResolvedValue(publishedAgent);
    createEmbedSessionMock.mockResolvedValue({
      id: "session-1",
      agentId: "agent-1",
      anonymousToken: "anon-token-1",
      expiresAt: new Date("2026-06-01T12:15:00Z"),
    });

    const res = await POST(makeSessionRequest({ agentId: "agent-1" }));

    expect(res.status).toBe(200);
    expect(getPublishedAgentMock).toHaveBeenCalledWith("agent-1");
    expect(createEmbedSessionMock).toHaveBeenCalledWith({
      agentId: "agent-1",
      anonymousToken: "anon-token-1",
      expiresAt: new Date("2026-06-01T12:15:00Z"),
      rateLimitTier: "free",
    });
    const body = await res.json();
    expect(body.expiresAt).toBe("2026-06-01T12:15:00.000Z");
    expect(body.iframeUrl).toContain("/embed/agent-1?token=");
    expect(body.token).toEqual(expect.any(String));
  });

  it("returns 400 when agentId is missing", async () => {
    const res = await POST(makeSessionRequest({}));

    expect(res.status).toBe(400);
    expect(getPublishedAgentMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/embed/session", {
        method: "POST",
        body: "{bad",
      }),
    );

    expect(res.status).toBe(400);
  });

  it("returns 404 when the agent is missing or unpublished", async () => {
    getPublishedAgentMock.mockResolvedValue(null);

    const res = await POST(makeSessionRequest({ agentId: "agent-1" }));

    expect(res.status).toBe(404);
    expect(createEmbedSessionMock).not.toHaveBeenCalled();
  });

  it("returns 500 when session creation fails", async () => {
    getPublishedAgentMock.mockResolvedValue(publishedAgent);
    createEmbedSessionMock.mockRejectedValue(new Error("db down"));

    const res = await POST(makeSessionRequest({ agentId: "agent-1" }));

    expect(res.status).toBe(500);
  });

  it("uses forwarded host headers for iframeUrl", async () => {
    getPublishedAgentMock.mockResolvedValue(publishedAgent);
    createEmbedSessionMock.mockResolvedValue({
      id: "session-1",
      agentId: "agent-1",
      anonymousToken: "anon-token-1",
      expiresAt: new Date("2026-06-01T12:15:00Z"),
    });

    const res = await POST(
      new Request("http://internal/api/embed/session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-proto": "https",
          "x-forwarded-host": "chat.example.com",
        },
        body: JSON.stringify({ agentId: "agent-1" }),
      }),
    );

    const body = await res.json();
    expect(body.iframeUrl).toMatch(
      /^https:\/\/chat\.example\.com\/embed\/agent-1/,
    );
  });
});

describe("embed session token verification endpoints", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
    process.env.EMBED_JWT_SECRET = "test-secret";
    getPublishedAgentMock.mockReset();
    getEmbedSessionByTokenMock.mockReset();
    incrementDailyMessageCountMock.mockReset();
    resetDailyCountIfNeededMock.mockReset();
  });

  it("returns session metadata for a valid token", async () => {
    const token = makeToken();
    getEmbedSessionByTokenMock.mockResolvedValue(activeSession);
    getPublishedAgentMock.mockResolvedValue(publishedAgent);

    const res = await GET(
      new Request("http://localhost/api/embed/session", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agent).toMatchObject({ id: "agent-1", name: "Support Agent" });
  });

  it("rejects missing authorization on metadata", async () => {
    const res = await GET(new Request("http://localhost/api/embed/session"));

    expect(res.status).toBe(401);
  });

  it("rejects expired tokens", async () => {
    const token = mintEmbedToken({
      agentId: "agent-1",
      sessionId: "session-1",
      anonymousToken: "anon-token-1",
      ttlSeconds: 1,
      now: new Date("2026-06-01T11:59:58Z"),
    });

    const res = await GET(
      new Request("http://localhost/api/embed/session", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(res.status).toBe(401);
    expect(getEmbedSessionByTokenMock).not.toHaveBeenCalled();
  });

  it("rejects tokens with invalid signatures", async () => {
    const token = makeToken();
    const tampered = token.replace(/.$/, token.endsWith("a") ? "b" : "a");

    const res = await GET(
      new Request("http://localhost/api/embed/session", {
        headers: { authorization: `Bearer ${tampered}` },
      }),
    );

    expect(res.status).toBe(400);
    expect(getEmbedSessionByTokenMock).not.toHaveBeenCalled();
  });

  it("rejects revoked sessions", async () => {
    const token = makeToken();
    getEmbedSessionByTokenMock.mockResolvedValue({
      ...activeSession,
      revokedAt: new Date("2026-06-01T12:01:00Z"),
    });

    const res = await GET(
      new Request("http://localhost/api/embed/session", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(res.status).toBe(401);
  });

  it("rejects sessions whose stored agent does not match the token", async () => {
    const token = makeToken();
    getEmbedSessionByTokenMock.mockResolvedValue({
      ...activeSession,
      agentId: "agent-2",
    });

    const res = await GET(
      new Request("http://localhost/api/embed/session", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(res.status).toBe(401);
    expect(getPublishedAgentMock).not.toHaveBeenCalled();
  });

  it("rejects metadata when the agent has been unpublished", async () => {
    const token = makeToken();
    getEmbedSessionByTokenMock.mockResolvedValue(activeSession);
    getPublishedAgentMock.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/embed/session", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(res.status).toBe(404);
  });

  it("streams embed chat through quota enforcement", async () => {
    const token = makeToken();
    getEmbedSessionByTokenMock.mockResolvedValue(activeSession);
    getPublishedAgentMock.mockResolvedValue(publishedAgent);
    incrementDailyMessageCountMock.mockResolvedValue({
      ...activeSession,
      dailyMessageCount: 1,
    });

    const res = await POST(
      new Request("http://localhost/api/embed/session", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { id: "m1", role: "user", parts: [{ type: "text", text: "Hi" }] },
          ],
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(incrementDailyMessageCountMock).toHaveBeenCalledWith("session-1");
  });

  it("rejects embed chat when the quota is exhausted", async () => {
    const token = makeToken();
    getEmbedSessionByTokenMock.mockResolvedValue({
      ...activeSession,
      dailyMessageCount: 20,
    });
    getPublishedAgentMock.mockResolvedValue(publishedAgent);

    const res = await POST(
      new Request("http://localhost/api/embed/session", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { id: "m1", role: "user", parts: [{ type: "text", text: "Hi" }] },
          ],
        }),
      }),
    );

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("embed-quota-exceeded");
  });
});
