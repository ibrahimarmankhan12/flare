import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sessionMock = vi.fn();
const listAgentInstallsMock = vi.fn();

const agentRowsFixture = [
  {
    id: "agent-1",
    name: "Code Reviewer",
    description: "Reviews PRs",
    icon: { type: "emoji", value: "code" },
    publishedAt: new Date("2026-05-01T00:00:00Z"),
    installCount: 42,
    coverImageUrl: "https://cdn.example.com/a.png",
    galleryMetadata: { tags: ["dev", "review"] },
    visibility: "public",
  },
  {
    id: "agent-2",
    name: "Research Assistant",
    description: "Researches topics",
    icon: null,
    publishedAt: new Date("2026-05-10T00:00:00Z"),
    installCount: 17,
    coverImageUrl: null,
    galleryMetadata: null,
    visibility: "public",
  },
];

vi.mock("auth/server", () => ({
  getSession: (...args: unknown[]) => sessionMock(...args),
}));

vi.mock("lib/db/repository", () => ({
  agentInstallRepository: {
    listAgentInstalls: (...args: unknown[]) => listAgentInstallsMock(...args),
  },
}));

vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(agentRowsFixture),
      }),
    }),
  },
}));

vi.mock("lib/db/pg/schema.pg", () => ({
  AgentTable: new Proxy(
    {},
    {
      get: (_target, prop) => `agent.${String(prop)}`,
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

const makeRequest = () => new Request("http://localhost/api/agent/installed");

const baseSession = { user: { id: "user-1" } };

describe("GET /api/agent/installed", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    listAgentInstallsMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(listAgentInstallsMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the session has no user id", async () => {
    sessionMock.mockResolvedValue({ user: {} });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 200 with an empty list when the user has no installs", async () => {
    sessionMock.mockResolvedValue(baseSession);
    listAgentInstallsMock.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ agents: [] });
    expect(listAgentInstallsMock).toHaveBeenCalledWith("user-1", null);
  });

  it("returns 200 with the joined agent payload for each install", async () => {
    sessionMock.mockResolvedValue(baseSession);
    listAgentInstallsMock.mockResolvedValue([
      {
        id: "inst-a",
        userId: "user-1",
        orgId: null,
        agentId: "agent-1",
        config: { foo: "bar" },
        createdAt: new Date("2026-05-30T10:00:00Z"),
      },
      {
        id: "inst-b",
        userId: "user-1",
        orgId: null,
        agentId: "agent-2",
        config: {},
        createdAt: new Date("2026-05-30T11:00:00Z"),
      },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agents).toHaveLength(2);
    expect(body.agents[0]).toMatchObject({
      installId: "inst-a",
      config: { foo: "bar" },
      orgId: null,
      installedAt: "2026-05-30T10:00:00.000Z",
      agent: {
        id: "agent-1",
        name: "Code Reviewer",
        installCount: 42,
        publishedAt: "2026-05-01T00:00:00.000Z",
        coverImageUrl: "https://cdn.example.com/a.png",
      },
    });
    expect(body.agents[1].agent.id).toBe("agent-2");
  });

  it("forwards session.activeOrgId when present", async () => {
    sessionMock.mockResolvedValue({
      user: { id: "user-1" },
      activeOrgId: "org-9",
    });
    listAgentInstallsMock.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(listAgentInstallsMock).toHaveBeenCalledWith("user-1", "org-9");
  });

  it("skips installs whose agent row is missing", async () => {
    sessionMock.mockResolvedValue(baseSession);
    listAgentInstallsMock.mockResolvedValue([
      {
        id: "inst-good",
        userId: "user-1",
        orgId: null,
        agentId: "agent-1",
        config: {},
        createdAt: new Date("2026-05-30T10:00:00Z"),
      },
      {
        id: "inst-orphan",
        userId: "user-1",
        orgId: null,
        agentId: "agent-deleted",
        config: {},
        createdAt: new Date("2026-05-30T11:00:00Z"),
      },
    ]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agents).toHaveLength(1);
    expect(body.agents[0].installId).toBe("inst-good");
  });

  it("returns 500 when the repository throws", async () => {
    sessionMock.mockResolvedValue(baseSession);
    listAgentInstallsMock.mockRejectedValue(new Error("db down"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
