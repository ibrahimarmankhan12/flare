import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sessionMock = vi.fn();
const getPublishedAgentMock = vi.fn();
const installAgentMock = vi.fn();
const uninstallAgentMock = vi.fn();
const incrementInstallCountMock = vi.fn();

vi.mock("auth/server", () => ({
  getSession: (...args: any[]) => sessionMock(...args),
}));

vi.mock("lib/db/repository", () => ({
  agentInstallRepository: {
    getPublishedAgent: (...args: any[]) => getPublishedAgentMock(...args),
    installAgent: (...args: any[]) => installAgentMock(...args),
    uninstallAgent: (...args: any[]) => uninstallAgentMock(...args),
    incrementInstallCount: (...args: any[]) =>
      incrementInstallCountMock(...args),
  },
}));

// Import after mocks.
import { DELETE, POST } from "./route";

const validParams = {
  params: Promise.resolve({ id: "agent-1" }),
} as any;

const makePostRequest = () =>
  new Request("http://localhost/api/agent/agent-1/install", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });

const makeDeleteRequest = () =>
  new Request("http://localhost/api/agent/agent-1/install", {
    method: "DELETE",
  });

const okSession = { user: { id: "user-1" } };
const okSessionWithOrg = { user: { id: "user-1" }, activeOrgId: "org-9" };

const publishedRow = {
  id: "agent-1",
  name: "Code Reviewer",
  description: "Reviews PRs",
  icon: { type: "emoji", value: "🦊" },
  installCount: 5,
  coverImageUrl: "https://cdn.example/cover.png",
  galleryMetadata: { tags: ["dev"] },
  publishedAt: new Date("2026-05-01T12:00:00Z"),
};

describe("POST /api/agent/[id]/install", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    getPublishedAgentMock.mockReset();
    installAgentMock.mockReset();
    uninstallAgentMock.mockReset();
    incrementInstallCountMock.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await POST(makePostRequest(), validParams);
    expect(res.status).toBe(401);
    expect(installAgentMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the session has no user id", async () => {
    sessionMock.mockResolvedValue({ user: {} });
    const res = await POST(makePostRequest(), validParams);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the agent is missing or unpublished", async () => {
    sessionMock.mockResolvedValue(okSession);
    getPublishedAgentMock.mockResolvedValue(null);
    const res = await POST(makePostRequest(), validParams);
    expect(res.status).toBe(404);
    expect(installAgentMock).not.toHaveBeenCalled();
  });

  it("installs with no orgId when the session has no activeOrgId", async () => {
    sessionMock.mockResolvedValue(okSession);
    getPublishedAgentMock.mockResolvedValue(publishedRow);
    installAgentMock.mockResolvedValue({ id: "install-1" });
    incrementInstallCountMock.mockResolvedValue(undefined);

    const res = await POST(makePostRequest(), validParams);
    expect(res.status).toBe(201);
    expect(installAgentMock).toHaveBeenCalledWith(
      { agentId: "agent-1", config: {} },
      "user-1",
      null,
    );
    expect(incrementInstallCountMock).toHaveBeenCalledWith("agent-1");

    const body = await res.json();
    expect(body.installId).toBe("install-1");
    expect(body.agent.id).toBe("agent-1");
    expect(body.agent.publishedAt).toBe("2026-05-01T12:00:00.000Z");
  });

  it("forwards activeOrgId from the session to the install row", async () => {
    sessionMock.mockResolvedValue(okSessionWithOrg);
    getPublishedAgentMock.mockResolvedValue(publishedRow);
    installAgentMock.mockResolvedValue({ id: "install-2" });
    incrementInstallCountMock.mockResolvedValue(undefined);

    const res = await POST(makePostRequest(), validParams);
    expect(res.status).toBe(201);
    expect(installAgentMock).toHaveBeenCalledWith(
      { agentId: "agent-1", config: {} },
      "user-1",
      "org-9",
    );
  });

  it("returns 201 even if the increment cache bump fails (non-fatal)", async () => {
    sessionMock.mockResolvedValue(okSession);
    getPublishedAgentMock.mockResolvedValue(publishedRow);
    installAgentMock.mockResolvedValue({ id: "install-3" });
    incrementInstallCountMock.mockRejectedValue(new Error("boom"));

    const res = await POST(makePostRequest(), validParams);
    expect(res.status).toBe(201);
  });

  it("returns 500 when the install repository throws", async () => {
    sessionMock.mockResolvedValue(okSession);
    getPublishedAgentMock.mockResolvedValue(publishedRow);
    installAgentMock.mockRejectedValue(new Error("db on fire"));

    const res = await POST(makePostRequest(), validParams);
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/agent/[id]/install", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    uninstallAgentMock.mockReset();
  });

  it("returns 401 when not signed in", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest(), validParams);
    expect(res.status).toBe(401);
    expect(uninstallAgentMock).not.toHaveBeenCalled();
  });

  it("returns 200 when the install is removed", async () => {
    sessionMock.mockResolvedValue(okSession);
    uninstallAgentMock.mockResolvedValue(true);
    const res = await DELETE(makeDeleteRequest(), validParams);
    expect(res.status).toBe(200);
    expect(uninstallAgentMock).toHaveBeenCalledWith("user-1", "agent-1");
    const body = await res.json();
    expect(body).toEqual({ success: true });
  });

  it("returns 404 when there is no install to remove", async () => {
    sessionMock.mockResolvedValue(okSession);
    uninstallAgentMock.mockResolvedValue(false);
    const res = await DELETE(makeDeleteRequest(), validParams);
    expect(res.status).toBe(404);
  });

  it("returns 500 when the repository throws", async () => {
    sessionMock.mockResolvedValue(okSession);
    uninstallAgentMock.mockRejectedValue(new Error("db on fire"));
    const res = await DELETE(makeDeleteRequest(), validParams);
    expect(res.status).toBe(500);
  });
});
