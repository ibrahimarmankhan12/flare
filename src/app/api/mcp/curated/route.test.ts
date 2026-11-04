import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// P4.C — GET /api/mcp/curated route tests
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));

const listCuratedMcpServersMock = vi.fn();

vi.mock("lib/db/repository", () => ({
  mcpInstallRepository: {
    listCuratedMcpServers: (...args: unknown[]) =>
      listCuratedMcpServersMock(...args),
  },
}));

const { GET } = await import("./route");

describe("GET /api/mcp/curated", () => {
  beforeEach(() => {
    listCuratedMcpServersMock.mockReset();
  });

  it("returns 200 with an empty list when the marketplace is empty", async () => {
    listCuratedMcpServersMock.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ servers: [] });
    expect(listCuratedMcpServersMock).toHaveBeenCalledWith(50, 0);
  });

  it("returns 200 with the projected server shape (no config/userId leak)", async () => {
    listCuratedMcpServersMock.mockResolvedValue([
      {
        id: "s1",
        name: "GitHub",
        // Sensitive fields the public endpoint must NOT forward.
        config: { url: "https://example.com", token: "SECRET" },
        userId: "owner-id-1",
        visibility: "public",
        enabled: true,
        curated: true,
        category: "developer",
        installCount: 12,
        description: "GitHub MCP server",
        homepageUrl: "https://github.com/example",
        createdAt: new Date("2026-01-15T00:00:00.000Z"),
        updatedAt: new Date("2026-01-15T00:00:00.000Z"),
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.servers).toHaveLength(1);
    const server = body.servers[0];
    // Whitelisted fields are present.
    expect(server.id).toBe("s1");
    expect(server.name).toBe("GitHub");
    expect(server.description).toBe("GitHub MCP server");
    expect(server.category).toBe("developer");
    expect(server.installCount).toBe(12);
    expect(server.homepageUrl).toBe("https://github.com/example");
    expect(server.createdAt).toBe("2026-01-15T00:00:00.000Z");
    // Blacklisted fields are absent.
    expect(server).not.toHaveProperty("config");
    expect(server).not.toHaveProperty("userId");
    expect(server).not.toHaveProperty("token");
  });

  it("returns 200 with a list of multiple servers sorted by the repository", async () => {
    listCuratedMcpServersMock.mockResolvedValue([
      {
        id: "a",
        name: "Alpha",
        config: {},
        userId: "u",
        visibility: "public",
        enabled: true,
        curated: true,
        category: "search",
        installCount: 100,
        description: null,
        homepageUrl: null,
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
        updatedAt: new Date("2026-02-01T00:00:00.000Z"),
      },
      {
        id: "b",
        name: "Beta",
        config: {},
        userId: "u",
        visibility: "public",
        enabled: true,
        curated: true,
        category: null,
        installCount: 5,
        description: "Beta description",
        homepageUrl: "https://example.com/beta",
        createdAt: new Date("2026-02-02T00:00:00.000Z"),
        updatedAt: new Date("2026-02-02T00:00:00.000Z"),
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.servers).toHaveLength(2);
    expect(body.servers.map((s: { id: string }) => s.id)).toEqual(["a", "b"]);
    // The null description and null homepageUrl survive the projection.
    expect(body.servers[0].description).toBeNull();
    expect(body.servers[0].homepageUrl).toBeNull();
    expect(body.servers[0].category).toBe("search");
    expect(body.servers[1].category).toBeNull();
  });

  it("returns 500 when the repository throws", async () => {
    listCuratedMcpServersMock.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.message).toBe("db down");
  });
});
