import { describe, expect, it, vi } from "vitest";
import {
  buildForkBody,
  buildForkUrl,
  forkThread,
  type ForkThreadRequest,
} from "./fork-thread";

describe("buildForkUrl", () => {
  it("encodes the source thread id into the route", () => {
    expect(buildForkUrl("src-1")).toBe("/api/thread/src-1/fork");
  });

  it("escapes slashes / special characters in the id", () => {
    expect(buildForkUrl("a/b c")).toBe("/api/thread/a%2Fb%20c/fork");
  });
});

describe("buildForkBody", () => {
  it("serializes the minimum required body", () => {
    const json = buildForkBody({ forkFromMessageId: "m1" });
    expect(JSON.parse(json)).toEqual({ forkFromMessageId: "m1" });
  });

  it("includes branchLabel when provided", () => {
    const json = buildForkBody({
      forkFromMessageId: "m1",
      branchLabel: "v2",
    });
    expect(JSON.parse(json)).toEqual({
      forkFromMessageId: "m1",
      branchLabel: "v2",
    });
  });

  it("omits branchLabel when not provided", () => {
    const json = buildForkBody({ forkFromMessageId: "m1" });
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect("branchLabel" in parsed).toBe(false);
  });

  it("throws when forkFromMessageId is missing", () => {
    expect(() => buildForkBody({} as ForkThreadRequest)).toThrow(
      "forkFromMessageId is required",
    );
  });

  it("throws when forkFromMessageId is empty", () => {
    expect(() => buildForkBody({ forkFromMessageId: "" })).toThrow(
      "forkFromMessageId is required",
    );
  });

  it("throws when branchLabel is too long", () => {
    expect(() =>
      buildForkBody({ forkFromMessageId: "m1", branchLabel: "x".repeat(101) }),
    ).toThrow("branchLabel must be at most 100 characters");
  });
});

describe("forkThread", () => {
  it("POSTs to the fork route with the right body and returns the new thread", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "new-thread", title: "t (branch)" }),
    });
    const result = await forkThread(
      "src-1",
      { forkFromMessageId: "m1" },
      fetchMock as any,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/thread/src-1/fork",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ forkFromMessageId: "m1" }),
      }),
    );
    expect(result).toEqual({ id: "new-thread", title: "t (branch)" });
  });

  it("throws an Error with the server's message on non-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Source thread not found",
    });
    await expect(
      forkThread("src-1", { forkFromMessageId: "m1" }, fetchMock as any),
    ).rejects.toThrow("Source thread not found");
  });

  it("falls back to a status-coded message if the server body is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "",
    });
    await expect(
      forkThread("src-1", { forkFromMessageId: "m1" }, fetchMock as any),
    ).rejects.toThrow("Fork failed with status 500");
  });
});
