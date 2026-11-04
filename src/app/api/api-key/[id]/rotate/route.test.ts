import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getSessionMock = vi.fn();
const getApiKeyMock = vi.fn();
const rotateApiKeyMock = vi.fn();

vi.mock("auth/server", () => ({
  getSession: (...args: unknown[]) => getSessionMock(...args),
}));

vi.mock("lib/db/repository", () => ({
  apiKeyRepository: {
    getApiKey: (...args: unknown[]) => getApiKeyMock(...args),
    rotateApiKey: (...args: unknown[]) => rotateApiKeyMock(...args),
  },
}));

vi.mock("@/app/api/chat/shared.chat", () => ({
  handleError: (err: unknown) => (err instanceof Error ? err.message : "error"),
}));

const route = await import("./route");

const params = { params: Promise.resolve({ id: "key_1" }) };

const makeRequest = (body?: unknown) =>
  new Request("http://localhost/api/api-key/key_1/rotate", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
  });

describe("POST /api/api-key/[id]/rotate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    vi.resetAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: "user_1" } });
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const response = await route.POST(makeRequest(), params);
    expect(response.status).toBe(401);
    expect(getApiKeyMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the key is not owned or already revoked", async () => {
    getApiKeyMock.mockResolvedValue(null);
    const response = await route.POST(makeRequest(), params);
    expect(response.status).toBe(404);
    expect(rotateApiKeyMock).not.toHaveBeenCalled();
  });

  it("rotates a key, preserves metadata, and returns the new plaintext once", async () => {
    getApiKeyMock.mockResolvedValue({
      id: "key_1",
      userId: "user_1",
      name: "Primary",
      scopes: ["threads:read"],
      expiresAt: new Date("2026-07-01T00:00:00.000Z"),
      revokedAt: null,
    });
    rotateApiKeyMock.mockImplementation(
      async (_id, _userId, input, graceEndsAt) => ({
        id: "key_2",
        prefix: input.prefix,
        scopes: input.scopes,
        expiresAt: input.expiresAt,
        rotatedFromKeyId: "key_1",
        rotationGraceEndsAt: graceEndsAt,
        createdAt: new Date("2026-06-01T12:00:01.000Z"),
      }),
    );

    const response = await route.POST(makeRequest({ graceHours: 2 }), params);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBe("key_2");
    expect(body.fullKey).toMatch(/^ck_live_/);
    expect(body.rotatedFromKeyId).toBe("key_1");
    expect(new Date(body.rotationGraceEndsAt).toISOString()).toBe(
      "2026-06-01T14:00:00.000Z",
    );
    expect(rotateApiKeyMock).toHaveBeenCalledWith(
      "key_1",
      "user_1",
      expect.objectContaining({
        name: "Primary",
        scopes: ["threads:read"],
        expiresAt: new Date("2026-07-01T00:00:00.000Z"),
        lastFour: expect.any(String),
      }),
      new Date("2026-06-01T14:00:00.000Z"),
    );
  });

  it("rejects invalid JSON", async () => {
    const response = await route.POST(
      new Request("http://localhost/api/api-key/key_1/rotate", {
        method: "POST",
        body: "{",
      }),
      params,
    );
    expect(response.status).toBe(400);
  });
});
