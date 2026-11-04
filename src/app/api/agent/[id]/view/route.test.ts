import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sessionMock = vi.fn();
const recordAgentViewMock = vi.fn();

vi.mock("auth/server", () => ({
  getSession: (...args: any[]) => sessionMock(...args),
}));

vi.mock("lib/db/repository", () => ({
  agentViewRepository: {
    recordAgentView: (...args: any[]) => recordAgentViewMock(...args),
  },
}));

// Import after mocks.
import { POST } from "./route";

const validParams = { params: Promise.resolve({ id: "agent-1" }) } as any;

const makeRequest = (referrer?: string) =>
  new Request("http://localhost/api/agent/agent-1/view", {
    method: "POST",
    headers: referrer ? { referer: referrer } : {},
  });

describe("POST /api/agent/[id]/view", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    recordAgentViewMock.mockReset();
  });

  it("records an anonymous view with referrer when unauthenticated", async () => {
    sessionMock.mockResolvedValue(null);
    recordAgentViewMock.mockResolvedValue({ id: "view-1" });

    const res = await POST(
      makeRequest("https://flare-sh.tech/gallery/agents"),
      validParams,
    );
    expect(res.status).toBe(204);
    expect(recordAgentViewMock).toHaveBeenCalledWith(
      "agent-1",
      null,
      "https://flare-sh.tech/gallery/agents",
    );
  });

  it("records the signed-in user id and null referrer when no Referer header is present", async () => {
    sessionMock.mockResolvedValue({ user: { id: "user-1" } });
    recordAgentViewMock.mockResolvedValue({ id: "view-2" });

    const res = await POST(makeRequest(), validParams);
    expect(res.status).toBe(204);
    expect(recordAgentViewMock).toHaveBeenCalledWith("agent-1", "user-1", null);
  });

  it("returns 204 even when the repository throws (analytics is best-effort)", async () => {
    sessionMock.mockResolvedValue({ user: { id: "user-1" } });
    recordAgentViewMock.mockRejectedValue(new Error("write conflict"));

    const res = await POST(makeRequest(), validParams);
    expect(res.status).toBe(204);
  });

  it("returns 400 when the agent id is missing", async () => {
    const res = await POST(makeRequest(), {
      params: Promise.resolve({ id: "" }),
    } as any);
    expect(res.status).toBe(400);
    expect(recordAgentViewMock).not.toHaveBeenCalled();
  });
});
