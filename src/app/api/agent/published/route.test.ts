import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const listPublishedAgentsMock = vi.fn();

vi.mock("lib/db/repository", () => ({
  agentInstallRepository: {
    listPublishedAgents: (...args: any[]) => listPublishedAgentsMock(...args),
  },
}));

// Import after mocks.
import { GET } from "./route";

describe("GET /api/agent/published", () => {
  beforeEach(() => {
    listPublishedAgentsMock.mockReset();
  });

  it("returns the published agents list with limit 50 offset 0", async () => {
    const publishedAt = new Date("2026-05-01T12:00:00Z");
    listPublishedAgentsMock.mockResolvedValue([
      {
        id: "agent-1",
        name: "Code Reviewer",
        description: "Reviews PRs and suggests fixes.",
        icon: { type: "emoji", value: "🦊" },
        installCount: 42,
        coverImageUrl: "https://cdn.example/cover.png",
        galleryMetadata: { tags: ["dev", "code"] },
        publishedAt,
      },
      {
        id: "agent-2",
        name: "Researcher",
        description: null,
        icon: null,
        installCount: 0,
        coverImageUrl: null,
        galleryMetadata: null,
        publishedAt: null,
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(listPublishedAgentsMock).toHaveBeenCalledWith(50, 0);

    const body = await res.json();
    expect(body.agents).toHaveLength(2);
    expect(body.agents[0]).toMatchObject({
      id: "agent-1",
      name: "Code Reviewer",
      description: "Reviews PRs and suggests fixes.",
      icon: { type: "emoji", value: "🦊" },
      installCount: 42,
      coverImageUrl: "https://cdn.example/cover.png",
      galleryMetadata: { tags: ["dev", "code"] },
      publishedAt: "2026-05-01T12:00:00.000Z",
    });
    // null fields are surfaced as null (not undefined) so the
    // client can rely on a stable shape.
    expect(body.agents[1]).toMatchObject({
      id: "agent-2",
      description: null,
      icon: null,
      installCount: 0,
      coverImageUrl: null,
      galleryMetadata: null,
      publishedAt: null,
    });
  });

  it("returns an empty list when no agents are published", async () => {
    listPublishedAgentsMock.mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ agents: [] });
  });

  it("coerces string-typed Date columns to ISO 8601", async () => {
    listPublishedAgentsMock.mockResolvedValue([
      {
        id: "agent-3",
        name: "Legacy Date Agent",
        description: "old",
        icon: null,
        installCount: 1,
        coverImageUrl: null,
        galleryMetadata: null,
        publishedAt: "2026-04-15T09:30:00Z",
      },
    ]);

    const res = await GET();
    const body = await res.json();
    expect(body.agents[0].publishedAt).toBe("2026-04-15T09:30:00.000Z");
  });

  it("returns 500 when the repository throws", async () => {
    listPublishedAgentsMock.mockRejectedValue(new Error("db exploded"));

    const res = await GET();
    expect(res.status).toBe(500);
  });
});
