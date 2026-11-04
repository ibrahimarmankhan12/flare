import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getAllMock = vi.fn();
const getTopKMock = vi.fn();
vi.mock("lib/db/repository", () => ({
  memoryRepository: {
    getAll: (...args: any[]) => getAllMock(...args),
    getTopKForPrompt: (...args: any[]) => getTopKMock(...args),
  },
}));

// Import after mocks.
import { buildUserSystemPromptWithMemory } from "./prompts";

const fakeUser = {
  id: "user-1",
  name: "Test User",
  email: "test@example.com",
} as any;

describe("buildUserSystemPromptWithMemory", () => {
  beforeEach(() => {
    getAllMock.mockReset();
    getTopKMock.mockReset();
  });

  it("uses getTopKForPrompt when lastUserMessageEmbedding is provided", async () => {
    const embedding = new Array(1536).fill(0.1);
    getTopKMock.mockResolvedValue([
      {
        id: "m1",
        userId: "user-1",
        content: "User prefers dark mode.",
        category: "preferences",
        createdAt: new Date(),
        updatedAt: new Date(),
        score: 0.92,
      },
    ]);

    const prompt = await buildUserSystemPromptWithMemory(
      fakeUser,
      undefined,
      undefined,
      undefined,
      {
        lastUserMessageEmbedding: embedding,
        agentId: "agent-1",
        threadId: "thread-1",
      },
    );

    expect(getTopKMock).toHaveBeenCalledWith(
      "user-1",
      embedding,
      20,
      expect.objectContaining({ agentId: "agent-1", threadId: "thread-1" }),
    );
    expect(getAllMock).not.toHaveBeenCalled();
    expect(prompt).toContain("User prefers dark mode");
    expect(prompt).toContain("<user_memories>");
  });

  it("falls back to getAll when lastUserMessageEmbedding is missing", async () => {
    getAllMock.mockResolvedValue([
      {
        id: "m1",
        userId: "user-1",
        content: "Lives in Bangalore.",
        category: "identity",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const prompt = await buildUserSystemPromptWithMemory(
      fakeUser,
      undefined,
      undefined,
      undefined,
    );

    expect(getAllMock).toHaveBeenCalledWith("user-1");
    expect(getTopKMock).not.toHaveBeenCalled();
    expect(prompt).toContain("Lives in Bangalore");
  });

  it("returns base prompt when getTopKForPrompt throws", async () => {
    getTopKMock.mockRejectedValue(new Error("DB down"));

    const prompt = await buildUserSystemPromptWithMemory(
      fakeUser,
      undefined,
      undefined,
      undefined,
      {
        lastUserMessageEmbedding: new Array(1536).fill(0.1),
      },
    );

    // Should not throw; should not contain memory section.
    expect(prompt).not.toContain("<user_memories>");
    expect(prompt).toContain("Test User");
  });

  it("returns base prompt without <user_memories> when no memories found", async () => {
    getTopKMock.mockResolvedValue([]);

    const prompt = await buildUserSystemPromptWithMemory(
      fakeUser,
      undefined,
      undefined,
      undefined,
      {
        lastUserMessageEmbedding: new Array(1536).fill(0.1),
      },
    );

    expect(prompt).not.toContain("<user_memories>");
  });

  it("returns base prompt immediately when user is missing", async () => {
    const prompt = await buildUserSystemPromptWithMemory(
      undefined,
      undefined,
      undefined,
      undefined,
      { lastUserMessageEmbedding: new Array(1536).fill(0.1) },
    );
    expect(getAllMock).not.toHaveBeenCalled();
    expect(getTopKMock).not.toHaveBeenCalled();
    expect(prompt).not.toContain("<user_memories>");
  });

  // -------------------------------------------------------------------
  // P2.3 — retrieved-chunks injection
  // -------------------------------------------------------------------

  it("injects <retrieved_context> when retrievedChunks is provided", async () => {
    getAllMock.mockResolvedValue([]);
    const chunks = [
      {
        id: "c1",
        content: "RAG stands for Retrieval-Augmented Generation.",
        position: 0,
        documentId: "d1",
        collectionItemId: "ci1",
        filename: "intro.pdf",
        sourceUrl: "https://example.com/intro.pdf",
        score: 0.91,
      },
    ];

    const prompt = await buildUserSystemPromptWithMemory(
      fakeUser,
      undefined,
      undefined,
      undefined,
      { retrievedChunks: chunks },
    );

    expect(prompt).toContain("<retrieved_context>");
    expect(prompt).toContain("RAG stands for Retrieval-Augmented Generation");
    expect(prompt).toContain("intro.pdf");
    expect(prompt).not.toContain("<user_memories>");
  });

  it("appends both <user_memories> and <retrieved_context> when both are populated", async () => {
    getTopKMock.mockResolvedValue([
      {
        id: "m1",
        userId: "user-1",
        content: "Lives in Bangalore.",
        category: "identity",
        createdAt: new Date(),
        updatedAt: new Date(),
        score: 0.9,
      },
    ]);
    const chunks = [
      {
        id: "c1",
        content: "RAG stands for Retrieval-Augmented Generation.",
        position: 0,
        documentId: "d1",
        collectionItemId: "ci1",
        filename: "intro.pdf",
        sourceUrl: "https://example.com/intro.pdf",
        score: 0.91,
      },
    ];

    const prompt = await buildUserSystemPromptWithMemory(
      fakeUser,
      undefined,
      undefined,
      undefined,
      {
        lastUserMessageEmbedding: new Array(1536).fill(0.1),
        retrievedChunks: chunks,
      },
    );

    const memoryIdx = prompt.indexOf("<user_memories>");
    const retrievedIdx = prompt.indexOf("<retrieved_context>");
    expect(memoryIdx).toBeGreaterThan(-1);
    expect(retrievedIdx).toBeGreaterThan(-1);
    // Retrieved context comes AFTER memory in the assembled prompt.
    expect(retrievedIdx).toBeGreaterThan(memoryIdx);
  });

  it("still injects retrieved chunks when the memory fetch throws", async () => {
    getTopKMock.mockRejectedValue(new Error("DB down"));
    const chunks = [
      {
        id: "c1",
        content: "Survives memory failure.",
        position: 0,
        documentId: "d1",
        collectionItemId: "ci1",
        filename: "doc.pdf",
        sourceUrl: null,
        score: 0.7,
      },
    ];

    const prompt = await buildUserSystemPromptWithMemory(
      fakeUser,
      undefined,
      undefined,
      undefined,
      {
        lastUserMessageEmbedding: new Array(1536).fill(0.1),
        retrievedChunks: chunks,
      },
    );

    expect(prompt).toContain("<retrieved_context>");
    expect(prompt).toContain("Survives memory failure");
    expect(prompt).not.toContain("<user_memories>");
  });

  it("omits the <retrieved_context> section when retrievedChunks is empty", async () => {
    getTopKMock.mockResolvedValue([]);

    const prompt = await buildUserSystemPromptWithMemory(
      fakeUser,
      undefined,
      undefined,
      undefined,
      {
        lastUserMessageEmbedding: new Array(1536).fill(0.1),
        retrievedChunks: [],
      },
    );

    expect(prompt).not.toContain("<retrieved_context>");
    expect(prompt).not.toContain("<user_memories>");
  });
});
