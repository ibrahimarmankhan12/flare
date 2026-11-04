import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const generateJsonObjectMock = vi.fn();
const getModelMock = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: any[]) => {
    throw new Error("generateText should not be called directly by insights.ts");
  },
}));

vi.mock("./generate-json", () => ({
  generateJsonObject: (...args: any[]) => generateJsonObjectMock(...args),
}));

vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    getModel: (...args: any[]) => getModelMock(...args),
  },
}));

// Import after mocks are wired.
import { generateThreadInsights } from "./insights";

const buildMessage = (id: string, role: "user" | "assistant", text: string) =>
  ({
    id,
    threadId: "thread-1",
    role,
    parts: [{ type: "text", text }],
    createdAt: new Date(),
  }) as any;

describe("generateThreadInsights", () => {
  beforeEach(() => {
    generateJsonObjectMock.mockReset();
    getModelMock.mockReset();
    getModelMock.mockReturnValue({ provider: "flare", modelId: "test-model" });
  });

  it("returns the empty sentinel without calling the LLM when there are no messages", async () => {
    const result = await generateThreadInsights({ messages: [] });
    expect(result).toEqual({ summary: "", decisions: [], actionItems: [] });
    expect(generateJsonObjectMock).not.toHaveBeenCalled();
  });

  it("uses a cheap authorized Flare model (google/gemma-3-12b-it via flare provider)", async () => {
    generateJsonObjectMock.mockResolvedValue({
      summary: "A short summary.",
      decisions: ["Use Postgres"],
      actionItems: ["File the ticket"],
    });

    await generateThreadInsights({
      messages: [buildMessage("m1", "user", "hello")],
    });

    expect(getModelMock).toHaveBeenCalledTimes(1);
    expect(getModelMock).toHaveBeenCalledWith({
      provider: "flare",
      model: "google/gemma-3-12b-it",
    });
  });

  it("returns the LLM response object directly when the call succeeds", async () => {
    const llmOutput = {
      summary: "Discussed the Q3 launch plan.",
      decisions: ["Launch on June 15", "Use Postgres"],
      actionItems: ["Send the design doc", "File the auth bug"],
    };
    generateJsonObjectMock.mockResolvedValue(llmOutput);

    const result = await generateThreadInsights({
      messages: [
        buildMessage("m1", "user", "Let's plan Q3"),
        buildMessage("m2", "assistant", "Sure — when should we launch?"),
        buildMessage("m3", "user", "June 15"),
        buildMessage("m4", "assistant", "Got it."),
      ],
    });

    expect(result).toEqual(llmOutput);
  });

  it("renders both roles and includes the thread title in the prompt", async () => {
    generateJsonObjectMock.mockResolvedValue({
      summary: "x",
      decisions: [],
      actionItems: [],
    });

    await generateThreadInsights({
      threadTitle: "Q3 launch plan",
      messages: [
        buildMessage("m1", "user", "hello"),
        buildMessage("m2", "assistant", "world"),
      ],
    });

    expect(generateJsonObjectMock).toHaveBeenCalledTimes(1);
    const call = generateJsonObjectMock.mock.calls[0]?.[3];
    expect(call).toContain("Thread title: Q3 launch plan");
    expect(call).toContain("USER: hello");
    expect(call).toContain("ASSISTANT: world");
  });

  it("returns the empty sentinel when the LLM throws", async () => {
    generateJsonObjectMock.mockRejectedValue(new Error("upstream timed out"));

    const result = await generateThreadInsights({
      messages: [buildMessage("m1", "user", "hello")],
    });

    expect(result).toEqual({ summary: "", decisions: [], actionItems: [] });
  });

  it("falls back to safe defaults when the LLM response is missing fields", async () => {
    generateJsonObjectMock.mockResolvedValue({
      summary: undefined,
      decisions: "not-an-array",
      actionItems: null,
    });

    const result = await generateThreadInsights({
      messages: [buildMessage("m1", "user", "hi")],
    });

    expect(result.summary).toBe("");
    expect(result.decisions).toEqual([]);
    expect(result.actionItems).toEqual([]);
  });

  it("includes non-text parts as type placeholders in the transcript", async () => {
    generateJsonObjectMock.mockResolvedValue({
      summary: "x",
      decisions: [],
      actionItems: [],
    });

    await generateThreadInsights({
      messages: [
        {
          id: "m1",
          threadId: "thread-1",
          role: "assistant",
          parts: [
            { type: "text", text: "Here is the result:" },
            { type: "tool-invocation", toolName: "search" },
          ],
          createdAt: new Date(),
        } as any,
      ],
    });

    const call = generateJsonObjectMock.mock.calls[0]?.[3];
    expect(call).toContain("Here is the result:");
    expect(call).toContain("[tool-invocation]");
  });
});