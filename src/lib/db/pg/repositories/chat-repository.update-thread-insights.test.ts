import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// vi.mock factories are hoisted to the top of the file, so any value
// the factory references must be declared with `vi.hoisted`.
const mocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
  };
  selectChain.from.mockReturnValue(selectChain);
  selectChain.where.mockResolvedValue([]);

  const updateChain = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
  };
  updateChain.set.mockReturnValue(updateChain);
  updateChain.where.mockReturnValue(updateChain);
  updateChain.returning.mockResolvedValue([]);

  const dbProxy = {
    select: vi.fn(() => selectChain),
    update: vi.fn(() => updateChain),
    insert: vi.fn(),
    delete: vi.fn(),
  };
  return { selectChain, updateChain, dbProxy };
});

vi.mock("lib/db/pg/db.pg", () => ({ pgDb: mocks.dbProxy }));
vi.mock("../../schema.pg", () => ({
  ChatThreadTable: {
    id: { name: "id" },
    userId: { name: "user_id" },
    summary: { name: "summary" },
    decisions: { name: "decisions" },
    actionItems: { name: "action_items" },
    insightsGeneratedAt: { name: "insights_generated_at" },
  },
}));

import { pgChatRepository } from "./chat-repository.pg";

describe("pgChatRepository.updateThreadInsights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockResolvedValue([]);
    mocks.updateChain.set.mockReturnValue(mocks.updateChain);
    mocks.updateChain.where.mockReturnValue(mocks.updateChain);
    mocks.updateChain.returning.mockResolvedValue([]);
  });

  it("returns null when the thread is not owned by the user (ownership check)", async () => {
    // Simulate: select() -> []  (the thread doesn't exist OR user doesn't own it)
    mocks.selectChain.where.mockResolvedValueOnce([]);

    const result = await pgChatRepository.updateThreadInsights(
      "thread-123",
      "user-456",
      { summary: "x", decisions: ["d"], actionItems: ["a"] },
    );

    expect(result).toBeNull();
    // The update path must NOT have been reached.
    expect(mocks.dbProxy.update).not.toHaveBeenCalled();
  });

  it("persists insights with the right shape (decisions get `at`, actionItems get `done: false`, timestamp set)", async () => {
    // 1. select() returns a row — the caller owns the thread.
    mocks.selectChain.where.mockResolvedValueOnce([{ userId: "user-456" }]);
    // 2. update(...).returning() resolves to the updated row.
    const updatedRow = {
      id: "thread-123",
      userId: "user-456",
      title: "t",
      createdAt: new Date(),
      summary: "x",
    };
    mocks.updateChain.returning.mockResolvedValueOnce([updatedRow]);

    const before = Date.now();
    const result = await pgChatRepository.updateThreadInsights(
      "thread-123",
      "user-456",
      {
        summary: "Thread summary",
        decisions: ["decided A", "decided B"],
        actionItems: ["write spec", "send PR"],
      },
    );
    const after = Date.now();

    expect(result).toEqual(updatedRow);

    // The repository called update() with the schema columns it owns.
    expect(mocks.dbProxy.update).toHaveBeenCalledTimes(1);
    const setArg = mocks.updateChain.set.mock.calls[0][0] as {
      summary: string;
      decisions: Array<{ text: string; at: string }>;
      actionItems: Array<{ text: string; done: boolean }>;
      insightsGeneratedAt: Date;
    };
    expect(setArg.summary).toBe("Thread summary");
    // Each decision should have an ISO timestamp from the call window.
    expect(setArg.decisions).toHaveLength(2);
    for (const d of setArg.decisions) {
      expect(d.text).toMatch(/^decided [AB]$/);
      const ts = new Date(d.at).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    }
    // Each action item should default `done` to false.
    expect(setArg.actionItems).toEqual([
      { text: "write spec", done: false },
      { text: "send PR", done: false },
    ]);
    // insightsGeneratedAt is a Date in the same window.
    expect(setArg.insightsGeneratedAt).toBeInstanceOf(Date);
    expect(setArg.insightsGeneratedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(setArg.insightsGeneratedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("returns null when the UPDATE returns no rows (race with delete)", async () => {
    mocks.selectChain.where.mockResolvedValueOnce([{ userId: "user-456" }]);
    // update().returning() resolves to [] — the thread was deleted
    // between the ownership check and the update.
    mocks.updateChain.returning.mockResolvedValueOnce([]);

    const result = await pgChatRepository.updateThreadInsights(
      "thread-123",
      "user-456",
      { summary: "x", decisions: [], actionItems: [] },
    );
    expect(result).toBeNull();
  });
});
