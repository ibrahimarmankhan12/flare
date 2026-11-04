import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getSessionMock = vi.fn();
const getApiKeyUsageSafeFieldsMock = vi.fn();
const summarizeApiKeyUsageMock = vi.fn();

vi.mock("auth/server", () => ({
  getSession: (...args: unknown[]) => getSessionMock(...args),
}));

vi.mock("lib/db/repository", () => ({
  apiKeyRepository: {
    getApiKeyUsageSafeFields: (...args: unknown[]) =>
      getApiKeyUsageSafeFieldsMock(...args),
  },
  apiUsageRepository: {
    summarizeApiKeyUsage: (...args: unknown[]) =>
      summarizeApiKeyUsageMock(...args),
  },
}));

vi.mock("@/app/api/chat/shared.chat", () => ({
  handleError: (err: unknown) => (err instanceof Error ? err.message : "error"),
}));

const route = await import("./route");

const params = { params: Promise.resolve({ id: "key_1" }) };

const makeRequest = (query = "") =>
  new Request(`http://localhost/api/api-key/key_1/usage${query}`, {
    method: "GET",
  });

describe("GET /api/api-key/[id]/usage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: "user_1" } });
  });

  it("returns 401 when unauthenticated", async () => {
    getSessionMock.mockResolvedValue(null);
    const response = await route.GET(makeRequest(), params);
    expect(response.status).toBe(401);
    expect(getApiKeyUsageSafeFieldsMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the key is not owned", async () => {
    getApiKeyUsageSafeFieldsMock.mockResolvedValue(null);
    const response = await route.GET(makeRequest(), params);
    expect(response.status).toBe(404);
    expect(summarizeApiKeyUsageMock).not.toHaveBeenCalled();
  });

  it("returns usage summary totals for the requested window", async () => {
    getApiKeyUsageSafeFieldsMock.mockResolvedValue({
      id: "key_1",
      name: "Primary",
      prefix: "ck_live_…",
      scopes: ["threads:read"],
      lastFour: "abcd",
    });
    summarizeApiKeyUsageMock.mockResolvedValue([
      {
        day: "2026-06-01",
        route: "/api/v1/threads",
        method: "GET",
        status: 200,
        requests: 3,
        costUnits: 3,
      },
      {
        day: "2026-06-01",
        route: "/api/v1/threads",
        method: "POST",
        status: 201,
        requests: 2,
        costUnits: 4,
      },
    ]);

    const response = await route.GET(makeRequest("?days=7"), params);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      key: {
        id: "key_1",
        name: "Primary",
        prefix: "ck_live_…",
        scopes: ["threads:read"],
        lastFour: "abcd",
      },
      days: 7,
      totals: { requests: 5, costUnits: 7 },
      usage: [
        {
          day: "2026-06-01",
          route: "/api/v1/threads",
          method: "GET",
          status: 200,
          requests: 3,
          costUnits: 3,
        },
        {
          day: "2026-06-01",
          route: "/api/v1/threads",
          method: "POST",
          status: 201,
          requests: 2,
          costUnits: 4,
        },
      ],
    });
    expect(summarizeApiKeyUsageMock).toHaveBeenCalledWith("key_1", "user_1", 7);
  });

  it("rejects invalid days query", async () => {
    const response = await route.GET(makeRequest("?days=0"), params);
    expect(response.status).toBe(400);
  });
});
