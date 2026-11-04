import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// P3.3 — API key lib tests (#24 Public REST + API keys)
// ---------------------------------------------------------------------------
// These tests stub out the repository and the "server-only" shim so the
// library can run in the vitest Node environment without a live DB or
// Next.js runtime.
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));

const getApiKeyByHashMock = vi.fn();
const updateApiKeyLastUsedMock = vi.fn();
const recordApiKeyUsageMock = vi.fn();
const checkApiRateLimitMock = vi.fn();

vi.mock("lib/db/repository", () => ({
  apiKeyRepository: {
    getApiKeyByHash: (...args: unknown[]) => getApiKeyByHashMock(...args),
    updateApiKeyLastUsed: (...args: unknown[]) =>
      Promise.resolve(updateApiKeyLastUsedMock(...args)),
  },
  apiUsageRepository: {
    recordApiKeyUsage: (...args: unknown[]) => recordApiKeyUsageMock(...args),
  },
}));

vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: (...args: unknown[]) => checkApiRateLimitMock(...args),
}));

const apiKey = await import("./api-key");

const makeRequest = (authHeader?: string) =>
  new Request("http://localhost/v1/threads", {
    method: "GET",
    headers: authHeader ? { authorization: authHeader } : {},
  });

describe("auth/api-key", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("generateApiKey", () => {
    it("returns a string starting with `ck_live_` and ~50 chars total", () => {
      const { fullKey, prefix, hash } = apiKey.generateApiKey();
      expect(fullKey.startsWith("ck_live_")).toBe(true);
      // 8 (prefix) + 43 (base64url of 32 bytes) = 51
      expect(fullKey.length).toBeGreaterThanOrEqual(40);
      expect(prefix.startsWith("ck_live_")).toBe(true);
      expect(prefix.endsWith("…")).toBe(true);
      // hash is sha-256 hex — 64 chars
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("returns unique values across 1000 calls (collision-free entropy)", () => {
      const set = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        const { fullKey } = apiKey.generateApiKey();
        set.add(fullKey);
      }
      expect(set.size).toBe(1000);
    });
  });

  describe("hashApiKey", () => {
    it("is deterministic and 64 hex chars", () => {
      const h1 = apiKey.hashApiKey("ck_live_abc");
      const h2 = apiKey.hashApiKey("ck_live_abc");
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
    });

    it("changes when the input changes", () => {
      expect(apiKey.hashApiKey("ck_live_a")).not.toBe(
        apiKey.hashApiKey("ck_live_b"),
      );
    });
  });

  describe("verifyApiKeyScopes", () => {
    it("matches an exact scope", () => {
      expect(
        apiKey.verifyApiKeyScopes(["messages:read"], "messages:read"),
      ).toBe(true);
    });

    it("matches a wildcard prefix (`messages:*` covers `messages:read`)", () => {
      expect(apiKey.verifyApiKeyScopes(["messages:*"], "messages:read")).toBe(
        true,
      );
      expect(apiKey.verifyApiKeyScopes(["messages:*"], "messages:write")).toBe(
        true,
      );
    });

    it("matches the global wildcard", () => {
      expect(apiKey.verifyApiKeyScopes(["*"], "messages:read")).toBe(true);
      expect(apiKey.verifyApiKeyScopes(["*"], "anything:else:here")).toBe(true);
    });

    it("rejects an unrelated scope", () => {
      expect(apiKey.verifyApiKeyScopes(["threads:read"], "messages:read")).toBe(
        false,
      );
      expect(apiKey.verifyApiKeyScopes(["messages:*"], "threads:read")).toBe(
        false,
      );
    });

    it("returns false for an empty scope list", () => {
      expect(apiKey.verifyApiKeyScopes([], "messages:read")).toBe(false);
    });
  });

  describe("authenticateApiKey", () => {
    it("returns null when the Authorization header is missing", async () => {
      const ctx = await apiKey.authenticateApiKey(makeRequest());
      expect(ctx).toBeNull();
      expect(getApiKeyByHashMock).not.toHaveBeenCalled();
    });

    it("returns null when the header is malformed", async () => {
      const ctx = await apiKey.authenticateApiKey(makeRequest("Token foo"));
      expect(ctx).toBeNull();
    });

    it("returns null when the key prefix is unknown", async () => {
      const ctx = await apiKey.authenticateApiKey(
        makeRequest("Bearer sk_test_abcdef"),
      );
      expect(ctx).toBeNull();
    });

    it("returns null when the hash is not in the DB", async () => {
      getApiKeyByHashMock.mockResolvedValue(null);
      const ctx = await apiKey.authenticateApiKey(
        makeRequest("Bearer ck_live_abc"),
      );
      expect(ctx).toBeNull();
    });

    it("returns null when the key is revoked", async () => {
      getApiKeyByHashMock.mockResolvedValue({
        id: "k1",
        userId: "u1",
        scopes: [],
        keyHash: "h",
        prefix: "ck_live_…",
        name: "n",
        expiresAt: null,
        revokedAt: new Date(),
        createdAt: new Date(),
        lastUsedAt: null,
      });
      const ctx = await apiKey.authenticateApiKey(
        makeRequest("Bearer ck_live_abc"),
      );
      expect(ctx).toBeNull();
    });

    it("returns null when the key is past its expiresAt", async () => {
      getApiKeyByHashMock.mockResolvedValue({
        id: "k1",
        userId: "u1",
        scopes: [],
        keyHash: "h",
        prefix: "ck_live_…",
        name: "n",
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        createdAt: new Date(),
        lastUsedAt: null,
      });
      const ctx = await apiKey.authenticateApiKey(
        makeRequest("Bearer ck_live_abc"),
      );
      expect(ctx).toBeNull();
    });

    it("round-trips: create a key, then authenticate the same key", async () => {
      const { fullKey, hash } = apiKey.generateApiKey();
      getApiKeyByHashMock.mockImplementation(async (h: string) => {
        if (h !== hash) return null;
        return {
          id: "k1",
          userId: "u1",
          scopes: ["messages:read", "threads:*"],
          keyHash: hash,
          prefix: "ck_live_…",
          name: "n",
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date(),
          lastUsedAt: null,
        };
      });
      const ctx = await apiKey.authenticateApiKey(
        makeRequest(`Bearer ${fullKey}`),
      );
      expect(ctx).toEqual({
        userId: "u1",
        keyId: "k1",
        scopes: ["messages:read", "threads:*"],
      });
    });

    it("bumps last_used_at (fire-and-forget) on a successful auth", async () => {
      const { fullKey, hash } = apiKey.generateApiKey();
      getApiKeyByHashMock.mockResolvedValue({
        id: "k1",
        userId: "u1",
        scopes: [],
        keyHash: hash,
        prefix: "ck_live_…",
        name: "n",
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date(),
        lastUsedAt: null,
      });
      await apiKey.authenticateApiKey(makeRequest(`Bearer ${fullKey}`));
      expect(updateApiKeyLastUsedMock).toHaveBeenCalledWith("k1");
    });
  });

  describe("withApiKeyUsage", () => {
    const validRow = (hash: string) => ({
      id: "key_1",
      userId: "user_1",
      scopes: ["threads:read"],
      keyHash: hash,
      prefix: "ck_live_…",
      name: "Test key",
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date(),
      lastUsedAt: null,
    });

    const requestWithKey = (fullKey: string, init?: RequestInit) =>
      new Request("http://localhost/api/v1/threads", {
        method: "GET",
        ...init,
        headers: {
          authorization: `Bearer ${fullKey}`,
          "x-forwarded-for": "203.0.113.10",
          ...(init?.headers ?? {}),
        },
      });

    beforeEach(() => {
      checkApiRateLimitMock.mockResolvedValue({
        allowed: true,
        retryAfterMs: 0,
      });
      recordApiKeyUsageMock.mockResolvedValue({});
    });

    it("authenticates, enforces key/IP limits, calls handler, and records usage", async () => {
      const { fullKey, hash } = apiKey.generateApiKey();
      getApiKeyByHashMock.mockResolvedValue(validRow(hash));

      const handler = apiKey.withApiKeyUsage(
        { scope: "threads:read", route: "/api/v1/threads", costUnits: 2 },
        async (_request, { apiKey: ctx }) =>
          Response.json({ userId: ctx.userId }, { status: 201 }),
      );

      const response = await handler(requestWithKey(fullKey));
      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({ userId: "user_1" });
      expect(checkApiRateLimitMock).toHaveBeenCalledWith({
        kind: "key",
        id: "key_1",
        limit: 120,
        windowMs: 60_000,
      });
      expect(checkApiRateLimitMock).toHaveBeenCalledWith({
        kind: "ip",
        id: "203.0.113.10",
        limit: 300,
        windowMs: 60_000,
      });
      expect(recordApiKeyUsageMock).toHaveBeenCalledWith({
        apiKeyId: "key_1",
        userId: "user_1",
        route: "/api/v1/threads",
        method: "GET",
        status: 201,
        costUnits: 2,
      });
    });

    it("records forbidden scope attempts with zero cost", async () => {
      const { fullKey, hash } = apiKey.generateApiKey();
      getApiKeyByHashMock.mockResolvedValue({
        ...validRow(hash),
        scopes: ["agents:read"],
      });

      const handler = apiKey.withApiKeyUsage(
        { scope: "threads:read", route: "/api/v1/threads" },
        async () => new Response("ok"),
      );

      const response = await handler(requestWithKey(fullKey));
      expect(response.status).toBe(403);
      expect(checkApiRateLimitMock).not.toHaveBeenCalled();
      expect(recordApiKeyUsageMock).toHaveBeenCalledWith({
        apiKeyId: "key_1",
        userId: "user_1",
        route: "/api/v1/threads",
        method: "GET",
        status: 403,
        costUnits: 0,
      });
    });

    it("returns 429 and records zero-cost usage when the key limit is exceeded", async () => {
      const { fullKey, hash } = apiKey.generateApiKey();
      getApiKeyByHashMock.mockResolvedValue(validRow(hash));
      checkApiRateLimitMock.mockResolvedValueOnce({
        allowed: false,
        retryAfterMs: 2_500,
      });

      const handler = apiKey.withApiKeyUsage(
        { scope: "threads:read", route: "/api/v1/threads" },
        async () => new Response("ok"),
      );

      const response = await handler(requestWithKey(fullKey));
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("3");
      expect(recordApiKeyUsageMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 429, costUnits: 0 }),
      );
    });
  });
});
