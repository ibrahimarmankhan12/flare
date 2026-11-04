import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// P3.3 — /api/v1/threads route tests (#24 Public REST + API keys)
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));

const authenticateApiKeyMock = vi.fn();
const requireApiKeyScopeMock = vi.fn();
const selectThreadsByUserIdMock = vi.fn();
const insertThreadMock = vi.fn();

vi.mock("lib/auth/api-key", () => ({
  authenticateApiKey: (...args: unknown[]) => authenticateApiKeyMock(...args),
  requireApiKeyScope: (...args: unknown[]) => requireApiKeyScopeMock(...args),
  withApiKeyUsage:
    (
      options: { scope: string },
      handler: (
        request: Request,
        context: {
          apiKey: { userId: string; keyId: string; scopes: string[] };
        },
      ) => Promise<Response>,
    ) =>
    async (request: Request) => {
      const apiKey = await authenticateApiKeyMock(request);
      if (!apiKey) {
        return new Response("Unauthorized", { status: 401 });
      }
      if (!requireApiKeyScopeMock(apiKey, options.scope)) {
        return new Response(`Forbidden: missing scope \`${options.scope}\``, {
          status: 403,
        });
      }
      return handler(request, { apiKey });
    },
}));

vi.mock("lib/db/repository", () => ({
  chatRepository: {
    selectThreadsByUserId: (...args: unknown[]) =>
      selectThreadsByUserIdMock(...args),
    insertThread: (...args: unknown[]) => insertThreadMock(...args),
  },
}));

// "lib/utils"'s generateUUID pulls a UUID from crypto; stub it so the
// output is deterministic across machines. We must keep the rest of
// `lib/utils` (e.g. `Locker`) intact because MCP-related modules
// transitively pull on it.
vi.mock("lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lib/utils")>();
  return {
    ...actual,
    generateUUID: () => "00000000-0000-0000-0000-000000000001",
  };
});

const { GET, POST } = await import("./route");

const makeRequest = (
  opts: { auth?: string; body?: unknown; method?: string } = {},
) =>
  new Request("http://localhost/api/v1/threads", {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.auth ? { authorization: opts.auth } : {}),
      ...(opts.body !== undefined
        ? { "content-type": "application/json" }
        : {}),
    },
    body:
      opts.body === undefined
        ? undefined
        : typeof opts.body === "string"
          ? opts.body
          : JSON.stringify(opts.body),
  });

describe("/api/v1/threads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("GET", () => {
    it("returns 401 when no Authorization header is provided", async () => {
      authenticateApiKeyMock.mockResolvedValue(null);
      const res = await GET(makeRequest());
      expect(res.status).toBe(401);
      expect(selectThreadsByUserIdMock).not.toHaveBeenCalled();
    });

    it("returns 401 when the Bearer header is malformed", async () => {
      authenticateApiKeyMock.mockResolvedValue(null);
      const res = await GET(makeRequest({ auth: "Token foo" }));
      expect(res.status).toBe(401);
    });

    it("returns 403 when the API key lacks the `threads:read` scope", async () => {
      authenticateApiKeyMock.mockResolvedValue({
        userId: "u1",
        keyId: "k1",
        scopes: ["messages:read"],
      });
      requireApiKeyScopeMock.mockReturnValue(false);
      const res = await GET(makeRequest({ auth: "Bearer ck_live_x" }));
      expect(res.status).toBe(403);
      expect(selectThreadsByUserIdMock).not.toHaveBeenCalled();
    });

    it("returns 200 with an empty list when the user has no threads", async () => {
      authenticateApiKeyMock.mockResolvedValue({
        userId: "u1",
        keyId: "k1",
        scopes: ["threads:read"],
      });
      requireApiKeyScopeMock.mockReturnValue(true);
      selectThreadsByUserIdMock.mockResolvedValue([]);
      const res = await GET(makeRequest({ auth: "Bearer ck_live_x" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.threads).toEqual([]);
    });

    it("returns 200 with the user's threads when auth + scope are ok", async () => {
      authenticateApiKeyMock.mockResolvedValue({
        userId: "u1",
        keyId: "k1",
        scopes: ["threads:read"],
      });
      requireApiKeyScopeMock.mockReturnValue(true);
      selectThreadsByUserIdMock.mockResolvedValue([
        {
          id: "t1",
          title: "Hello",
          userId: "u1",
          createdAt: new Date(),
          lastMessageAt: 0,
        },
      ]);
      const res = await GET(makeRequest({ auth: "Bearer ck_live_x" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.threads).toHaveLength(1);
      expect(body.threads[0].id).toBe("t1");
    });
  });

  describe("POST", () => {
    it("returns 401 when no auth", async () => {
      authenticateApiKeyMock.mockResolvedValue(null);
      const res = await POST(
        makeRequest({ method: "POST", body: { title: "New chat" } }),
      );
      expect(res.status).toBe(401);
      expect(insertThreadMock).not.toHaveBeenCalled();
    });

    it("returns 403 when scope is missing", async () => {
      authenticateApiKeyMock.mockResolvedValue({
        userId: "u1",
        keyId: "k1",
        scopes: ["threads:read"],
      });
      requireApiKeyScopeMock.mockReturnValue(false);
      const res = await POST(
        makeRequest({ method: "POST", body: { title: "New chat" } }),
      );
      expect(res.status).toBe(403);
    });

    it("returns 400 when the body is invalid", async () => {
      authenticateApiKeyMock.mockResolvedValue({
        userId: "u1",
        keyId: "k1",
        scopes: ["threads:write"],
      });
      requireApiKeyScopeMock.mockReturnValue(true);
      const res = await POST(
        makeRequest({ method: "POST", body: { title: "" } }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 201 with the new thread on success", async () => {
      authenticateApiKeyMock.mockResolvedValue({
        userId: "u1",
        keyId: "k1",
        scopes: ["threads:write"],
      });
      requireApiKeyScopeMock.mockReturnValue(true);
      insertThreadMock.mockResolvedValue({
        id: "00000000-0000-0000-0000-000000000001",
        title: "New chat",
        userId: "u1",
        createdAt: new Date(),
      });
      const res = await POST(
        makeRequest({ method: "POST", body: { title: "New chat" } }),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.title).toBe("New chat");
      expect(body.userId).toBe("u1");
    });
  });
});
