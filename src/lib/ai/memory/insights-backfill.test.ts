import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  let rows: Array<{ id: string; userId: string }> = [];

  // The terminal await on a drizzle chain resolves to the rows the
  // test queued via `setRows`. The chain is also chainable:
  // .where(...).orderBy(...).limit(N) each return the same
  // "awaitable" object.
  const terminalChain = {
    orderBy() {
      return terminalChain;
    },
    limit() {
      return terminalChain;
    },
    then<T, R>(
      onFulfilled?: (v: typeof rows) => T | PromiseLike<T>,
      onRejected?: (e: unknown) => R | PromiseLike<R>,
    ): Promise<T | R> {
      return Promise.resolve(rows).then(onFulfilled, onRejected);
    },
  };

  const fromChain = {
    where: vi.fn(() => terminalChain),
  };
  const selectChain = {
    from: vi.fn(() => fromChain),
  };
  const dbProxy = {
    select: vi.fn(() => selectChain),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  };

  return {
    setRows: (r: typeof rows) => {
      rows = r;
    },
    fromChain,
    selectChain,
    dbProxy,
  };
});

vi.mock("lib/db/pg/db.pg", () => ({ pgDb: mocks.dbProxy }));
vi.mock("lib/db/pg/schema.pg", () => ({
  ChatThreadTable: {
    id: { name: "id" },
    userId: { name: "user_id" },
    createdAt: { name: "created_at" },
    insightsGeneratedAt: { name: "insights_generated_at" },
  },
}));
vi.mock("lib/db/repository", () => ({
  chatRepository: {
    selectMessagesByThreadId: vi.fn(),
    updateThreadInsights: vi.fn(),
  },
}));
vi.mock("./insights", () => ({
  generateThreadInsights: vi.fn(),
}));
vi.mock("logger", () => ({
  default: {
    withDefaults: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    }),
  },
}));

import { chatRepository } from "lib/db/repository";
import { generateThreadInsights } from "./insights";
import { backfillThreadInsights } from "./insights-backfill";

describe("backfillThreadInsights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setRows([]);
    mocks.selectChain.from.mockReturnValue(mocks.fromChain);
  });

  it("returns all-zero tally when no candidate threads exist", async () => {
    mocks.setRows([]);
    const result = await backfillThreadInsights();
    expect(result).toEqual({
      considered: 0,
      generated: 0,
      failed: 0,
      skippedFewMessages: 0,
    });
    expect(chatRepository.selectMessagesByThreadId).not.toHaveBeenCalled();
  });

  it("generates insights for a candidate thread and persists via the repository", async () => {
    mocks.setRows([{ id: "t1", userId: "u1" }]);
    vi.mocked(chatRepository.selectMessagesByThreadId).mockResolvedValueOnce([
      { id: "m1", role: "user", parts: [] },
      { id: "m2", role: "assistant", parts: [] },
      { id: "m3", role: "user", parts: [] },
    ] as never);
    vi.mocked(generateThreadInsights).mockResolvedValueOnce({
      summary: "sum",
      decisions: ["d1"],
      actionItems: ["a1"],
    });
    vi.mocked(chatRepository.updateThreadInsights).mockResolvedValueOnce({
      id: "t1",
      userId: "u1",
      title: "t",
      createdAt: new Date(),
    } as never);

    const result = await backfillThreadInsights();

    expect(result).toEqual({
      considered: 1,
      generated: 1,
      failed: 0,
      skippedFewMessages: 0,
    });
    expect(chatRepository.selectMessagesByThreadId).toHaveBeenCalledWith("t1");
    expect(generateThreadInsights).toHaveBeenCalledTimes(1);
    expect(chatRepository.updateThreadInsights).toHaveBeenCalledWith(
      "t1",
      "u1",
      { summary: "sum", decisions: ["d1"], actionItems: ["a1"] },
    );
  });

  it("skips threads with fewer than minMessages user/assistant messages", async () => {
    mocks.setRows([
      { id: "t1", userId: "u1" },
      { id: "t2", userId: "u2" },
    ]);
    vi.mocked(chatRepository.selectMessagesByThreadId)
      .mockResolvedValueOnce([
        { id: "m1", role: "user", parts: [] },
        // Only 1 user message — below the default minMessages=3.
      ] as never)
      .mockResolvedValueOnce([
        { id: "m1", role: "user", parts: [] },
        { id: "m2", role: "assistant", parts: [] },
        { id: "m3", role: "user", parts: [] },
      ] as never);
    vi.mocked(generateThreadInsights).mockResolvedValueOnce({
      summary: "s",
      decisions: [],
      actionItems: [],
    });
    vi.mocked(chatRepository.updateThreadInsights).mockResolvedValueOnce(
      {} as never,
    );

    const result = await backfillThreadInsights();

    expect(result).toEqual({
      considered: 2,
      generated: 1,
      failed: 0,
      skippedFewMessages: 1,
    });
    expect(generateThreadInsights).toHaveBeenCalledTimes(1);
  });

  it("counts a generation error as a failure and continues the batch", async () => {
    mocks.setRows([
      { id: "t1", userId: "u1" },
      { id: "t2", userId: "u2" },
    ]);
    vi.mocked(chatRepository.selectMessagesByThreadId)
      .mockResolvedValueOnce([
        { id: "m1", role: "user", parts: [] },
        { id: "m2", role: "assistant", parts: [] },
        { id: "m3", role: "user", parts: [] },
      ] as never)
      .mockResolvedValueOnce([
        { id: "m1", role: "user", parts: [] },
        { id: "m2", role: "assistant", parts: [] },
        { id: "m3", role: "user", parts: [] },
      ] as never);
    vi.mocked(generateThreadInsights)
      .mockRejectedValueOnce(new Error("LLM down"))
      .mockResolvedValueOnce({
        summary: "s",
        decisions: [],
        actionItems: [],
      });
    vi.mocked(chatRepository.updateThreadInsights).mockResolvedValueOnce(
      {} as never,
    );

    const result = await backfillThreadInsights();

    expect(result).toEqual({
      considered: 2,
      generated: 1,
      failed: 1,
      skippedFewMessages: 0,
    });
  });

  it("rejects invalid option values", async () => {
    await expect(
      backfillThreadInsights({ olderThanMinutes: -1 }),
    ).rejects.toThrow(/olderThanMinutes/);
    await expect(
      backfillThreadInsights({ minMessages: 0 }),
    ).rejects.toThrow(/minMessages/);
    await expect(
      backfillThreadInsights({ maxThreads: 0 }),
    ).rejects.toThrow(/maxThreads/);
  });
});
