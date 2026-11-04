import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sessionMock = vi.fn();
const listMcpServerInstallsMock = vi.fn();

vi.mock("auth/server", () => ({
  getSession: (...args: unknown[]) => sessionMock(...args),
}));

vi.mock("lib/db/repository", () => ({
  mcpInstallRepository: {
    listMcpServerInstalls: (...args: unknown[]) =>
      listMcpServerInstallsMock(...args),
  },
}));

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: () => {
      const whereFn = vi.fn().mockResolvedValue(serverRowsFixture);
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      return { from: fromFn, _whereFn: whereFn, _fromFn: fromFn };
    },
  },
}));

vi.mock("lib/db/pg/schema.pg", () => ({
  McpServerTable: new Proxy(
    {},
    {
      get: (_target, prop) => `mcp_server.${String(prop)}`,
    },
  ),
}));

vi.mock("logger", () => ({
  default: {
    withDefaults: () => ({
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    }),
  },
}));

vi.mock("consola/utils", () => ({
  colorize: (_c: string, s: string) => s,
}));

import { GET } from "./route";

const serverRowsFixture = [
  {
    id: "srv-1",
    name: "GitHub MCP",
    description: "GitHub API access",
    category: "developer",
    installCount: 142,
    curated: true,
    homepageUrl: "https://example.com",
    visibility: "public",
  },
  {
    id: "srv-2",
    name: "Web Search MCP",
    description: "Web search via Bing",
    category: "search",
    installCount: 87,
    curated: true,
    homepageUrl: null,
    visibility: "public",
  },
];

const makeRequest = () => new Request("http://localhost/api/mcp/installed");

const baseSession = { user: { id: "user-1" } };

describe("GET /api/mcp/installed", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    listMcpServerInstallsMock.mockReset();
    // re-seed the pgDb mock
    listMcpServerInstallsMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(listMcpServerInstallsMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the session has no user id", async () => {
    sessionMock.mockResolvedValue({ user: {} });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 200 with an empty list when the user has no installs", async () => {
    sessionMock.mockResolvedValue(baseSession);
    listMcpServerInstallsMock.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ installs: [] });
    expect(listMcpServerInstallsMock).toHaveBeenCalledWith("user-1", null);
  });

  it("returns 200 with the joined server payload for each install", async () => {
    sessionMock.mockResolvedValue(baseSession);
    listMcpServerInstallsMock.mockResolvedValue([
      {
        id: "inst-1",
        userId: "user-1",
        orgId: null,
        mcpServerId: "srv-1",
        config: { token: "abc" },
        createdAt: new Date("2026-05-30T10:00:00Z"),
      },
      {
        id: "inst-2",
        userId: "user-1",
        orgId: null,
        mcpServerId: "srv-2",
        config: {},
        createdAt: new Date("2026-05-30T11:00:00Z"),
      },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.installs).toHaveLength(2);
    expect(body.installs[0]).toMatchObject({
      installId: "inst-1",
      config: { token: "abc" },
      orgId: null,
      installedAt: "2026-05-30T10:00:00.000Z",
      server: {
        id: "srv-1",
        name: "GitHub MCP",
        category: "developer",
        installCount: 142,
      },
    });
    expect(body.installs[1].server.id).toBe("srv-2");
  });

  it("forwards session.activeOrgId when present", async () => {
    sessionMock.mockResolvedValue({
      user: { id: "user-1" },
      activeOrgId: "org-7",
    });
    listMcpServerInstallsMock.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(listMcpServerInstallsMock).toHaveBeenCalledWith("user-1", "org-7");
  });

  it("skips installs whose server row is missing", async () => {
    sessionMock.mockResolvedValue(baseSession);
    listMcpServerInstallsMock.mockResolvedValue([
      {
        id: "inst-good",
        userId: "user-1",
        orgId: null,
        mcpServerId: "srv-1",
        config: {},
        createdAt: new Date("2026-05-30T10:00:00Z"),
      },
      {
        id: "inst-orphan",
        userId: "user-1",
        orgId: null,
        mcpServerId: "srv-deleted",
        config: {},
        createdAt: new Date("2026-05-30T11:00:00Z"),
      },
    ]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.installs).toHaveLength(1);
    expect(body.installs[0].installId).toBe("inst-good");
  });

  it("returns 500 when the repository throws", async () => {
    sessionMock.mockResolvedValue(baseSession);
    listMcpServerInstallsMock.mockRejectedValue(new Error("db down"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
