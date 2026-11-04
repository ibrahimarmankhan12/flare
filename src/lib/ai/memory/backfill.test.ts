import { describe, expect, it, vi, beforeEach } from "vitest";
import type { UIMessage } from "ai";
import {
  pairChatMessages,
  runBackfill,
  type BackfillDeps,
  type BackfillExtractionResult,
} from "./backfill";

const buildUserMessage = (id: string, text: string): UIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});

const buildAssistantMessage = (id: string, text: string): UIMessage => ({
  id,
  role: "assistant",
  parts: [{ type: "text", text }],
});

interface HarnessOverrides {
  listUserIds?: () => Promise<string[]>;
  listThreadIdsForUser?: (userId: string) => Promise<string[]>;
  getThreadTitle?: (threadId: string) => Promise<string | null>;
  getMessagesForThread?: (threadId: string) => Promise<UIMessage[]>;
  threadHasMemories?: (threadId: string, userId: string) => Promise<boolean>;
  runExtraction?: BackfillDeps["runExtraction"];
  sleep?: (ms: number) => Promise<void>;
}

const buildHarness = (overrides: HarnessOverrides = {}) => {
  const logs: string[] = [];
  const warnings: string[] = [];
  const extractionCalls: Array<{
    userId: string;
    threadId: string;
    threadTitle: string;
    userMessageId: string;
    assistantMessageId: string;
  }> = [];
  const sleepCalls: number[] = [];

  const defaultRunExtraction: BackfillDeps["runExtraction"] = async (input) => {
    extractionCalls.push({
      userId: input.userId,
      threadId: input.threadId,
      threadTitle: input.threadTitle,
      userMessageId: input.userMessage.id ?? "",
      assistantMessageId: input.assistantMessage.id ?? "",
    });
    const r: BackfillExtractionResult = {
      ran: true,
      extracted: 1,
      embedded: 1,
      persisted: 1,
      errors: [],
    };
    return r;
  };

  const deps: BackfillDeps = {
    listUserIds: overrides.listUserIds ?? (async () => []),
    listThreadIdsForUser:
      overrides.listThreadIdsForUser ?? (async () => []),
    getThreadTitle:
      overrides.getThreadTitle ?? (async () => "Untitled thread"),
    getMessagesForThread: overrides.getMessagesForThread ?? (async () => []),
    threadHasMemories:
      overrides.threadHasMemories ?? (async () => false),
    runExtraction: overrides.runExtraction ?? defaultRunExtraction,
    sleep: overrides.sleep
      ? async (ms) => {
          sleepCalls.push(ms);
          return overrides.sleep!(ms);
        }
      : async (ms) => {
          sleepCalls.push(ms);
        },
    log: (msg) => logs.push(msg),
    warn: (msg) => warnings.push(msg),
  };

  return { deps, logs, warnings, extractionCalls, sleepCalls };
};

describe("pairChatMessages", () => {
  it("pairs a user message with the next assistant message", () => {
    const messages = [
      buildUserMessage("u1", "hi"),
      buildAssistantMessage("a1", "hello"),
    ];
    expect(pairChatMessages(messages)).toEqual([
      {
        userMessage: messages[0],
        assistantMessage: messages[1],
      },
    ]);
  });

  it("keeps the most recent user message if there are two in a row", () => {
    const messages = [
      buildUserMessage("u1", "first"),
      buildUserMessage("u2", "second"),
      buildAssistantMessage("a1", "reply"),
    ];
    const pairs = pairChatMessages(messages);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.userMessage.id).toBe("u2");
    expect(pairs[0]?.assistantMessage.id).toBe("a1");
  });

  it("skips pairs with no assistant reply", () => {
    const messages = [buildUserMessage("u1", "lonely")];
    expect(pairChatMessages(messages)).toEqual([]);
  });

  it("ignores system and tool messages between pairs", () => {
    const messages = [
      buildUserMessage("u1", "hi"),
      // simulate a tool message the chat route may have inserted
      { id: "t1", role: "system" as const, parts: [] },
      buildAssistantMessage("a1", "hello"),
    ];
    const pairs = pairChatMessages(messages);
    expect(pairs).toHaveLength(1);
  });
});

describe("runBackfill", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("iterates through all threads across all users", async () => {
    const { deps, extractionCalls } = buildHarness({
      listUserIds: async () => ["user-1", "user-2"],
      listThreadIdsForUser: async (userId) =>
        userId === "user-1" ? ["t1", "t2"] : ["t3"],
      getMessagesForThread: async (threadId) => {
        // each thread has exactly one (user, assistant) pair
        return [
          buildUserMessage(`${threadId}-u`, "hello"),
          buildAssistantMessage(`${threadId}-a`, "world"),
        ];
      },
    });

    const progress = await runBackfill({}, deps);

    expect(progress.totalUsers).toBe(2);
    expect(progress.processedUsers).toBe(2);
    expect(progress.seenThreads).toBe(3);
    expect(progress.processedThreads).toBe(3);
    expect(progress.skippedThreads).toBe(0);
    expect(progress.errorThreads).toBe(0);
    expect(progress.totalPairs).toBe(3);
    expect(progress.totalPersisted).toBe(3);
    expect(progress.stoppedEarly).toBe(false);
    expect(progress.finishedAt).toBeDefined();
    expect(progress.durationMs).toBeGreaterThanOrEqual(0);

    expect(extractionCalls).toHaveLength(3);
    expect(extractionCalls.map((c) => c.threadId).sort()).toEqual([
      "t1",
      "t2",
      "t3",
    ]);
    expect(extractionCalls[0]?.userId).toBe("user-1");
    expect(extractionCalls[2]?.userId).toBe("user-2");
  });

  it("stops at maxThreads", async () => {
    const { deps, extractionCalls } = buildHarness({
      listUserIds: async () => ["user-1"],
      listThreadIdsForUser: async () => ["t1", "t2", "t3", "t4", "t5"],
      getMessagesForThread: async (threadId) => [
        buildUserMessage(`${threadId}-u`, "hi"),
        buildAssistantMessage(`${threadId}-a`, "hello"),
      ],
    });

    const progress = await runBackfill({ maxThreads: 2 }, deps);

    expect(progress.seenThreads).toBe(2);
    expect(progress.processedThreads).toBe(2);
    expect(progress.totalPairs).toBe(2);
    expect(progress.stoppedEarly).toBe(true);
    expect(extractionCalls).toHaveLength(2);
  });

  it("stops at maxThreads across multiple users", async () => {
    const { deps, extractionCalls } = buildHarness({
      listUserIds: async () => ["u1", "u2", "u3"],
      listThreadIdsForUser: async (userId) => [`${userId}-t1`, `${userId}-t2`],
      getMessagesForThread: async (threadId) => [
        buildUserMessage(`${threadId}-u`, "hi"),
        buildAssistantMessage(`${threadId}-a`, "hello"),
      ],
    });

    const progress = await runBackfill({ maxThreads: 3 }, deps);

    // u1: 2 threads, u2: 1 thread (cap hit), u3: 0.
    expect(progress.processedUsers).toBe(2);
    expect(progress.seenThreads).toBe(3);
    expect(progress.processedThreads).toBe(3);
    expect(progress.stoppedEarly).toBe(true);
    expect(extractionCalls).toHaveLength(3);
  });

  it("respects maxThreadsPerUser", async () => {
    const { deps, extractionCalls } = buildHarness({
      listUserIds: async () => ["u1"],
      listThreadIdsForUser: async () => ["t1", "t2", "t3"],
      getMessagesForThread: async (threadId) => [
        buildUserMessage(`${threadId}-u`, "hi"),
        buildAssistantMessage(`${threadId}-a`, "hello"),
      ],
    });

    const progress = await runBackfill({ maxThreadsPerUser: 2 }, deps);

    expect(progress.seenThreads).toBe(2);
    expect(progress.processedThreads).toBe(2);
    expect(extractionCalls).toHaveLength(2);
    expect(progress.stoppedEarly).toBe(false);
  });

  it("skips threads that already have memories (idempotent)", async () => {
    const alreadyForThread = new Set(["t2"]);
    const { deps, extractionCalls } = buildHarness({
      listUserIds: async () => ["u1"],
      listThreadIdsForUser: async () => ["t1", "t2", "t3"],
      threadHasMemories: async (threadId) => alreadyForThread.has(threadId),
      getMessagesForThread: async (threadId) => [
        buildUserMessage(`${threadId}-u`, "hi"),
        buildAssistantMessage(`${threadId}-a`, "hello"),
      ],
    });

    const progress = await runBackfill({}, deps);

    expect(progress.seenThreads).toBe(3);
    expect(progress.skippedThreads).toBe(1);
    expect(progress.processedThreads).toBe(2);
    expect(progress.totalPairs).toBe(2);
    expect(extractionCalls.map((c) => c.threadId).sort()).toEqual([
      "t1",
      "t3",
    ]);
  });

  it("increments the progress counter correctly across multiple turns", async () => {
    const { deps, extractionCalls } = buildHarness({
      listUserIds: async () => ["u1"],
      listThreadIdsForUser: async () => ["t1"],
      getMessagesForThread: async () => [
        buildUserMessage("u1", "hi"),
        buildAssistantMessage("a1", "hello"),
        buildUserMessage("u2", "next question"),
        buildAssistantMessage("a2", "next answer"),
        buildUserMessage("u3", "third"),
        // note: u3 has no assistant reply, should not produce a pair
      ],
    });

    const progress = await runBackfill({}, deps);

    expect(progress.totalPairs).toBe(2);
    expect(progress.totalPersisted).toBe(2);
    expect(progress.processedThreads).toBe(1);
    expect(extractionCalls).toHaveLength(2);
    expect(extractionCalls[0]?.userMessageId).toBe("u1");
    expect(extractionCalls[0]?.assistantMessageId).toBe("a1");
    expect(extractionCalls[1]?.userMessageId).toBe("u2");
    expect(extractionCalls[1]?.assistantMessageId).toBe("a2");
  });

  it("skips threads that have no (user, assistant) pairs", async () => {
    const { deps, extractionCalls, logs } = buildHarness({
      listUserIds: async () => ["u1"],
      listThreadIdsForUser: async () => ["t1", "t2"],
      getMessagesForThread: async (threadId) =>
        threadId === "t1"
          ? [buildUserMessage("u1", "no reply yet")]
          : [
              buildUserMessage("u1", "hi"),
              buildAssistantMessage("a1", "hello"),
            ],
    });

    const progress = await runBackfill({}, deps);

    expect(progress.seenThreads).toBe(2);
    expect(progress.processedThreads).toBe(1);
    expect(progress.totalPairs).toBe(1);
    expect(extractionCalls).toHaveLength(1);
    expect(logs.some((l) => l.includes("no (user, assistant) pairs"))).toBe(
      true,
    );
  });

  it("does not crash the loop when extraction throws on one pair", async () => {
    const threadMessages: Record<string, UIMessage[]> = {
      t1: [
        buildUserMessage("u1", "hi"),
        buildAssistantMessage("a1", "hello"),
        buildUserMessage("u2", "next"),
        buildAssistantMessage("a2", "reply"),
      ],
      t2: [
        buildUserMessage("u1", "ok"),
        buildAssistantMessage("a1", "done"),
      ],
    };
    const { deps, extractionCalls, warnings } = buildHarness({
      listUserIds: async () => ["u1"],
      listThreadIdsForUser: async () => ["t1", "t2"],
      getMessagesForThread: async (threadId) => threadMessages[threadId]!,
      runExtraction: (async (input) => {
        if (input.threadId === "t1" && input.assistantMessage.id === "a2") {
          throw new Error("LLM unavailable");
        }
        return {
          ran: true,
          extracted: 1,
          embedded: 1,
          persisted: 1,
          errors: [],
        };
      }) as BackfillDeps["runExtraction"],
    });

    const progress = await runBackfill({}, deps);

    // t1 still counts as processed (one pair succeeded, one errored);
    // t2 ran cleanly.
    expect(progress.errorThreads).toBe(0);
    expect(progress.processedThreads).toBe(2);
    // 2 successful pairs (t1/a1 and t2/a1).
    expect(progress.totalPersisted).toBe(2);
    expect(extractionCalls).toHaveLength(0); // we replaced runExtraction
    expect(
      warnings.some((w) => w.includes("pair 1 failed") && w.includes("t1")),
    ).toBe(true);
  });

  it("counts the thread as errored when runExtraction throws on every pair", async () => {
    const { deps, warnings } = buildHarness({
      listUserIds: async () => ["u1"],
      listThreadIdsForUser: async () => ["t1"],
      getMessagesForThread: async () => [
        buildUserMessage("u1", "hi"),
        buildAssistantMessage("a1", "hello"),
      ],
      runExtraction: (async () => {
        throw new Error("LLM down");
      }) as BackfillDeps["runExtraction"],
    });

    const progress = await runBackfill({}, deps);

    // runExtraction is per-pair, so the thread is still "processed"
    // (the loop survived the throw), but the pair errors are recorded.
    expect(progress.errorThreads).toBe(0);
    expect(progress.processedThreads).toBe(1);
    expect(progress.totalPersisted).toBe(0);
    expect(
      warnings.some((w) => w.includes("pair 0 failed") && w.includes("t1")),
    ).toBe(true);
  });

  it("does not crash the loop when getMessagesForThread rejects", async () => {
    const { deps, extractionCalls, warnings } = buildHarness({
      listUserIds: async () => ["u1"],
      listThreadIdsForUser: async () => ["t1", "t2"],
      getMessagesForThread: async (threadId) => {
        if (threadId === "t1") {
          throw new Error("DB blip");
        }
        return [
          buildUserMessage("u1", "hi"),
          buildAssistantMessage("a1", "hello"),
        ];
      },
    });

    const progress = await runBackfill({}, deps);

    expect(progress.seenThreads).toBe(2);
    expect(progress.errorThreads).toBe(1);
    expect(progress.processedThreads).toBe(1);
    expect(extractionCalls).toHaveLength(1);
    expect(
      warnings.some((w) => w.includes("t1") && w.includes("failed")),
    ).toBe(true);
  });

  it("calls sleep between pairs but not after the last pair", async () => {
    const { deps, sleepCalls } = buildHarness({
      listUserIds: async () => ["u1"],
      listThreadIdsForUser: async () => ["t1"],
      getMessagesForThread: async () => [
        buildUserMessage("u1", "hi"),
        buildAssistantMessage("a1", "hello"),
        buildUserMessage("u2", "second"),
        buildAssistantMessage("a2", "reply"),
        buildUserMessage("u3", "third"),
        buildAssistantMessage("a3", "third reply"),
      ],
    });

    await runBackfill({ delayMs: 123 }, deps);

    // 3 pairs -> 2 sleeps (between, not after the last).
    expect(sleepCalls).toEqual([123, 123]);
  });

  it("passes thread title and id through to the extraction call", async () => {
    const { deps, extractionCalls } = buildHarness({
      listUserIds: async () => ["u1"],
      listThreadIdsForUser: async () => ["t1"],
      getThreadTitle: async () => "Hello world",
      getMessagesForThread: async () => [
        buildUserMessage("u1", "hi"),
        buildAssistantMessage("a1", "hello"),
      ],
    });

    await runBackfill({}, deps);

    expect(extractionCalls).toHaveLength(1);
    expect(extractionCalls[0]).toMatchObject({
      userId: "u1",
      threadId: "t1",
      threadTitle: "Hello world",
    });
  });

  it("threads the per-extraction errors into the thread result", async () => {
    const { deps } = buildHarness({
      listUserIds: async () => ["u1"],
      listThreadIdsForUser: async () => ["t1"],
      getMessagesForThread: async () => [
        buildUserMessage("u1", "hi"),
        buildAssistantMessage("a1", "hello"),
      ],
      runExtraction: (async () => ({
        ran: true,
        extracted: 1,
        embedded: 1,
        persisted: 0,
        errors: ["persist: db oops"],
      })) as BackfillDeps["runExtraction"],
    });

    const progress = await runBackfill({}, deps);

    // The totals: extracted=1, persisted=0, errors recorded.
    expect(progress.totalPairs).toBe(1);
    expect(progress.totalPersisted).toBe(0);
  });

  it("handles an empty user list gracefully", async () => {
    const { deps, extractionCalls } = buildHarness({
      listUserIds: async () => [],
    });
    const progress = await runBackfill({}, deps);
    expect(progress.totalUsers).toBe(0);
    expect(progress.processedUsers).toBe(0);
    expect(progress.seenThreads).toBe(0);
    expect(extractionCalls).toHaveLength(0);
  });

  it("emits a final summary log line with the progress fields", async () => {
    const { deps, logs } = buildHarness({
      listUserIds: async () => ["u1"],
      listThreadIdsForUser: async () => ["t1"],
      getMessagesForThread: async () => [
        buildUserMessage("u1", "hi"),
        buildAssistantMessage("a1", "hello"),
      ],
    });
    await runBackfill({}, deps);
    const summary = logs.find((l) => l.startsWith("Backfill done"));
    expect(summary).toBeDefined();
    expect(summary).toContain("pairs=1");
    expect(summary).toContain("persisted=1");
    expect(summary).toContain("stoppedEarly=false");
  });
});
