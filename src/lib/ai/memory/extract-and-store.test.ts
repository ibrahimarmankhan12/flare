import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Mock the cache before importing the module under test.
const cacheStore = new Map<string, { value: unknown; expiresAt: number }>();
vi.mock("lib/cache", () => ({
  serverCache: {
    async get<T>(key: string): Promise<T | null> {
      const entry = cacheStore.get(key);
      if (!entry) return null;
      if (entry.expiresAt < Date.now()) {
        cacheStore.delete(key);
        return null;
      }
      return entry.value as T;
    },
    async set(key: string, value: unknown, ttlMs: number): Promise<void> {
      cacheStore.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    async delete(key: string): Promise<void> {
      cacheStore.delete(key);
    },
  },
}));

vi.mock("lib/db/repository", () => ({
  memoryRepository: {
    create: vi.fn(async (input: any) => ({
      id: "mem-1",
      ...input,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  },
}));

const embedMock = vi.fn();
const extractMock = vi.fn();
vi.mock("lib/ai/memory/embed", () => ({
  embedBatch: (...args: any[]) => embedMock(...args),
  embedText: (...args: any[]) => embedMock(...args),
}));
vi.mock("lib/ai/memory/extract-memories", () => ({
  extractMemoryCandidates: (...args: any[]) => extractMock(...args),
}));

// Import after mocks are wired.
import { runMemoryExtraction } from "./extract-and-store";

const buildUserMessage = (text: string) =>
  ({
    id: "user-msg-1",
    role: "user",
    parts: [{ type: "text", text }],
  }) as any;

const buildAssistantMessage = (text: string) =>
  ({
    id: "asst-msg-1",
    role: "assistant",
    parts: [{ type: "text", text }],
  }) as any;

describe("runMemoryExtraction", () => {
  beforeEach(() => {
    cacheStore.clear();
    embedMock.mockReset();
    extractMock.mockReset();
  });

  it("debounces free-tier users and skips extraction", async () => {
    extractMock.mockResolvedValue({ candidates: [] });

    // First call on free tier: counter goes 0 -> 1, runs (first message).
    const r1 = await runMemoryExtraction({
      userId: "user-1",
      userTier: "free",
      threadId: "thread-1",
      userMessage: buildUserMessage("hi"),
      assistantMessage: buildAssistantMessage("hello"),
    });
    expect(r1.ran).toBe(true);

    // Second call: counter goes 1 -> 2, NOT a multiple of 10, debounced.
    const r2 = await runMemoryExtraction({
      userId: "user-1",
      userTier: "free",
      threadId: "thread-1",
      userMessage: buildUserMessage("hi again"),
      assistantMessage: buildAssistantMessage("hello again"),
    });
    expect(r2.ran).toBe(false);
    expect(r2.reason).toBe("debounced");
  });

  it("runs on every message for paid users", async () => {
    extractMock.mockResolvedValue({ candidates: [] });

    for (let i = 0; i < 3; i++) {
      const r = await runMemoryExtraction({
        userId: "user-1",
        userTier: "flare-enterprises",
        threadId: "thread-1",
        userMessage: buildUserMessage(`msg ${i}`),
        assistantMessage: buildAssistantMessage(`reply ${i}`),
      });
      expect(r.ran).toBe(true);
    }
  });

  it("filters out low-confidence candidates before embedding", async () => {
    extractMock.mockResolvedValue({
      candidates: [
        {
          content: "User lives in Bangalore.",
          category: "identity",
          scope: "user",
          confidence: 0.95,
        },
        {
          content: "User might like coffee.",
          category: "preferences",
          scope: "user",
          confidence: 0.3, // below 0.5 threshold
        },
        {
          content: "User prefers dark mode.",
          category: "preferences",
          scope: "user",
          confidence: 0.8,
        },
      ],
    });
    embedMock.mockResolvedValue([
      { embedding: [0.1, 0.2], model: "test" },
      { embedding: [0.3, 0.4], model: "test" },
    ]);

    const r = await runMemoryExtraction({
      userId: "user-1",
      userTier: "flare-enterprises",
      threadId: "thread-1",
      userMessage: buildUserMessage("I live in Bangalore and prefer dark mode."),
      assistantMessage: buildAssistantMessage("Noted!"),
    });

    expect(r.ran).toBe(true);
    expect(r.extracted).toBe(2); // the 0.3-confidence candidate was dropped
    expect(r.embedded).toBe(2);
    expect(r.persisted).toBe(2);
  });

  it("returns no-candidates when LLM returns empty", async () => {
    extractMock.mockResolvedValue({ candidates: [] });
    const r = await runMemoryExtraction({
      userId: "user-1",
      userTier: "flare-enterprises",
      threadId: "thread-1",
      userMessage: buildUserMessage("hi"),
      assistantMessage: buildAssistantMessage("hello"),
    });
    expect(r.ran).toBe(true);
    expect(r.reason).toBe("no-candidates");
    expect(r.persisted).toBe(0);
  });

  it("uses scopeId for agent and thread scope", async () => {
    const created: any[] = [];
    const { memoryRepository } = await import("lib/db/repository");
    (memoryRepository.create as any).mockImplementation(async (input: any) => {
      created.push(input);
      return { id: `mem-${created.length}`, ...input };
    });

    extractMock.mockResolvedValue({
      candidates: [
        {
          content: "Project Phoenix deadline",
          category: "context",
          scope: "thread",
          confidence: 0.85,
        },
        {
          content: "Use TypeScript",
          category: "preferences",
          scope: "user",
          confidence: 0.9,
        },
      ],
    });
    embedMock.mockResolvedValue([
      { embedding: [0.1, 0.2], model: "test" },
      { embedding: [0.3, 0.4], model: "test" },
    ]);

    await runMemoryExtraction({
      userId: "user-1",
      userTier: "flare-enterprises",
      threadId: "thread-1",
      agentId: "agent-1",
      userMessage: buildUserMessage("Project Phoenix deadline is Friday."),
      assistantMessage: buildAssistantMessage("Noted."),
    });

    const threadScoped = created.find((c) => c.content.includes("Phoenix"));
    const userScoped = created.find((c) => c.content.includes("TypeScript"));
    expect(threadScoped?.scopeId).toBe("thread-1");
    expect(threadScoped?.scope).toBe("thread");
    expect(userScoped?.scopeId).toBeNull();
    expect(userScoped?.scope).toBe("user");
  });

  it("sets sourceMessageId from the assistant message id", async () => {
    const created: any[] = [];
    const { memoryRepository } = await import("lib/db/repository");
    (memoryRepository.create as any).mockImplementation(async (input: any) => {
      created.push(input);
      return { id: `mem-${created.length}`, ...input };
    });

    extractMock.mockResolvedValue({
      candidates: [
        {
          content: "Lives in Bangalore",
          category: "identity",
          scope: "user",
          confidence: 0.95,
        },
      ],
    });
    embedMock.mockResolvedValue([{ embedding: [0.1, 0.2], model: "test" }]);

    await runMemoryExtraction({
      userId: "user-1",
      userTier: "flare-enterprises",
      threadId: "thread-1",
      userMessage: buildUserMessage("I live in Bangalore"),
      assistantMessage: buildAssistantMessage("Noted!"),
    });

    expect(created[0]?.sourceMessageId).toBe("asst-msg-1");
  });
});
