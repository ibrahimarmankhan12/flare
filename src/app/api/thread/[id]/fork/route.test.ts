import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const sessionMock = vi.fn();
const checkAccessMock = vi.fn();
const forkThreadMock = vi.fn();

vi.mock("auth/server", () => ({
  getSession: (...args: any[]) => sessionMock(...args),
}));

vi.mock("lib/db/repository", () => ({
  chatRepository: {
    checkAccess: (...args: any[]) => checkAccessMock(...args),
    forkThread: (...args: any[]) => forkThreadMock(...args),
  },
}));

// Import after mocks.
import { POST } from "./route";

const validParams = { params: Promise.resolve({ id: "src-thread-1" }) } as any;

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/thread/src-thread-1/fork", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const okSession = { user: { id: "user-1" } };

describe("POST /api/thread/[id]/fork", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    checkAccessMock.mockReset();
    forkThreadMock.mockReset();
  });

  it("returns 401 when not signed in", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ forkFromMessageId: "m1" }), validParams);
    expect(res.status).toBe(401);
    expect(forkThreadMock).not.toHaveBeenCalled();
  });

  it("returns 401 when session has no user id", async () => {
    sessionMock.mockResolvedValue({ user: {} });
    const res = await POST(makeRequest({ forkFromMessageId: "m1" }), validParams);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    sessionMock.mockResolvedValue(okSession);
    const res = await POST(makeRequest("{not-json"), validParams);
    expect(res.status).toBe(400);
  });

  it("returns 400 when forkFromMessageId is missing", async () => {
    sessionMock.mockResolvedValue(okSession);
    const res = await POST(makeRequest({ branchLabel: "v2" }), validParams);
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("forkFromMessageId");
  });

  it("returns 400 when forkFromMessageId is empty", async () => {
    sessionMock.mockResolvedValue(okSession);
    const res = await POST(makeRequest({ forkFromMessageId: "" }), validParams);
    expect(res.status).toBe(400);
  });

  it("returns 400 when branchLabel is empty string", async () => {
    sessionMock.mockResolvedValue(okSession);
    const res = await POST(
      makeRequest({ forkFromMessageId: "m1", branchLabel: "" }),
      validParams,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when branchLabel is non-string", async () => {
    sessionMock.mockResolvedValue(okSession);
    const res = await POST(
      makeRequest({ forkFromMessageId: "m1", branchLabel: 42 }),
      validParams,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when branchLabel is over 100 characters", async () => {
    sessionMock.mockResolvedValue(okSession);
    const res = await POST(
      makeRequest({
        forkFromMessageId: "m1",
        branchLabel: "x".repeat(101),
      }),
      validParams,
    );
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("100");
  });

  it("returns 404 when the user does not own the source thread", async () => {
    sessionMock.mockResolvedValue(okSession);
    checkAccessMock.mockResolvedValue(false);
    const res = await POST(
      makeRequest({ forkFromMessageId: "m1" }),
      validParams,
    );
    expect(res.status).toBe(404);
    expect(forkThreadMock).not.toHaveBeenCalled();
  });

  it("returns 200 with the new thread on success", async () => {
    sessionMock.mockResolvedValue(okSession);
    checkAccessMock.mockResolvedValue(true);
    const newThread = {
      id: "new-thread-1",
      title: "original (branch)",
      userId: "user-1",
      parentThreadId: "src-thread-1",
      forkFromMessageId: "m1",
      createdAt: new Date(),
    };
    forkThreadMock.mockResolvedValue(newThread);

    const res = await POST(
      makeRequest({ forkFromMessageId: "m1" }),
      validParams,
    );
    expect(res.status).toBe(200);
    expect(forkThreadMock).toHaveBeenCalledWith(
      { sourceThreadId: "src-thread-1", forkFromMessageId: "m1" },
      "user-1",
    );
    const body = await res.json();
    expect(body.id).toBe("new-thread-1");
  });

  it("forwards branchLabel when provided", async () => {
    sessionMock.mockResolvedValue(okSession);
    checkAccessMock.mockResolvedValue(true);
    forkThreadMock.mockResolvedValue({
      id: "new-thread-2",
      title: "original (v2)",
      userId: "user-1",
      parentThreadId: "src-thread-1",
      forkFromMessageId: "m1",
      branchLabel: "v2",
      createdAt: new Date(),
    });

    const res = await POST(
      makeRequest({ forkFromMessageId: "m1", branchLabel: "v2" }),
      validParams,
    );
    expect(res.status).toBe(200);
    expect(forkThreadMock).toHaveBeenCalledWith(
      {
        sourceThreadId: "src-thread-1",
        forkFromMessageId: "m1",
        branchLabel: "v2",
      },
      "user-1",
    );
  });

  it("returns 404 when repository reports fork message not in thread", async () => {
    sessionMock.mockResolvedValue(okSession);
    checkAccessMock.mockResolvedValue(true);
    forkThreadMock.mockRejectedValue(
      new Error("Fork message not found in source thread"),
    );
    const res = await POST(
      makeRequest({ forkFromMessageId: "m1" }),
      validParams,
    );
    expect(res.status).toBe(404);
  });

  it("returns 500 for unexpected repository errors", async () => {
    sessionMock.mockResolvedValue(okSession);
    checkAccessMock.mockResolvedValue(true);
    forkThreadMock.mockRejectedValue(new Error("database is on fire"));
    const res = await POST(
      makeRequest({ forkFromMessageId: "m1" }),
      validParams,
    );
    expect(res.status).toBe(500);
  });
});
