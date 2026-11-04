import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only modules
vi.mock("server-only", () => ({}));

const generateTextMock = vi.fn(async (_args?: any) => ({
  text: "translated text",
  usage: { totalTokens: 42 },
}));
const generateObjectMock = vi.fn(async (_args?: any) => ({
  object: { translated: "translated text" },
  usage: { totalTokens: 99 },
}));

vi.mock("ai", () => ({
  generateText: (args: any) => generateTextMock(args),
  generateObject: (args: any) => generateObjectMock(args),
  convertToModelMessages: (m: any) => m,
  UIMessage: class {},
}));

vi.mock("lib/ai/models", () => ({
  customModelProvider: {
    getModelWithFailureFallback: () => ({ modelId: "mock-model" }),
  },
}));

vi.mock("lib/ai/tools/web/web-search", () => ({
  exaSearchToolForWorkflow: {},
  exaContentsToolForWorkflow: {},
}));
vi.mock("lib/ai/tools/web/youtube-search", () => ({
  youtubeSearchToolForWorkflow: {},
}));
vi.mock("lib/ai/tools/web/youtube-transcript", () => ({
  youtubeTranscriptToolForWorkflow: {},
}));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: {
    toolCall: vi.fn(),
    tools: vi.fn().mockReturnValue({}),
  },
}));

const jsonSchemaToZodMock = vi.fn();
vi.mock("lib/json-schema-to-zod", () => ({
  jsonSchemaToZod: (s: any) => jsonSchemaToZodMock(s),
}));

import { llmNodeExecutor } from "./node-executor";
import { NodeKind, type LLMNodeData } from "../workflow.interface";
import type { JSONSchema7 } from "json-schema";

const baseNode = (outputSchema: any): LLMNodeData => ({
  id: "n1",
  kind: NodeKind.LLM,
  name: "TRANSLATOR",
  description: "",
  model: { provider: "openai", name: "gpt-4o-mini", id: "gpt-4o-mini" } as any,
  messages: [],
  outputSchema: outputSchema as LLMNodeData["outputSchema"],
});

const baseState = () => ({
  getOutput: vi.fn(),
  setInput: vi.fn(),
  getInput: vi.fn(),
});

describe("llmNodeExecutor — outputSchema robustness", () => {
  beforeEach(() => {
    generateTextMock.mockClear();
    generateObjectMock.mockClear();
  });

  it("uses text mode when answer type is string", async () => {
    const result = await llmNodeExecutor({
      node: baseNode({
        type: "object",
        properties: { answer: { type: "string" } },
      }),
      state: baseState() as any,
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateObjectMock).not.toHaveBeenCalled();
    expect(result.output.answer).toBe("translated text");
    expect(result.output.totalTokens).toBe(42);
  });

  it("falls back to text mode when answer schema is missing (regression: 'Cannot read properties of undefined')", async () => {
    const result = await llmNodeExecutor({
      node: baseNode({ type: "object", properties: {} }),
      state: baseState() as any,
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateObjectMock).not.toHaveBeenCalled();
    expect(result.output.answer).toBe("translated text");
  });

  it("falls back to text mode when outputSchema itself is undefined", async () => {
    const result = await llmNodeExecutor({
      node: baseNode(undefined as any),
      state: baseState() as any,
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateObjectMock).not.toHaveBeenCalled();
    expect(result.output.answer).toBe("translated text");
  });

  it("falls back to text mode when answer.type is missing (e.g. user deleted all fields)", async () => {
    const result = await llmNodeExecutor({
      node: baseNode({
        type: "object",
        properties: { answer: {} as JSONSchema7 },
      }),
      state: baseState() as any,
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateObjectMock).not.toHaveBeenCalled();
    expect(result.output.answer).toBe("translated text");
  });

  it("falls back to text mode when jsonSchemaToZod throws on a malformed object schema", async () => {
    // Force jsonSchemaToZod to throw — simulates a corrupted/legacy schema
    // that the converter can't process. The executor should not crash the
    // whole workflow run.
    jsonSchemaToZodMock.mockImplementationOnce(() => {
      throw new TypeError(
        "Cannot read properties of undefined (reading 'enum')",
      );
    });

    const result = await llmNodeExecutor({
      node: baseNode({
        type: "object",
        properties: {
          answer: {
            type: "object",
            properties: { result: { type: "string" } },
            required: ["result"],
          },
        },
      }),
      state: baseState() as any,
    });

    expect(generateObjectMock).not.toHaveBeenCalled();
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(result.output.answer).toBe("translated text");
  });

  it("uses object mode for a valid object schema and returns response.object", async () => {
    const result = await llmNodeExecutor({
      node: baseNode({
        type: "object",
        properties: {
          answer: {
            type: "object",
            properties: { translated: { type: "string" } },
            required: ["translated"],
          },
        },
      }),
      state: baseState() as any,
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(result.output.answer).toEqual({ translated: "translated text" });
  });
});
