import { describe, expect, it } from "vitest";

import {
  buildRetrievedContextPromptSection,
  formatRetrievedContext,
  FORMAT_DEFAULT_MAX_CHARS_PER_CHUNK,
  FORMAT_DEFAULT_MAX_CHUNKS,
  type RetrievedChunk,
} from "./format";

const baseChunk: RetrievedChunk = {
  id: "11111111-1111-1111-1111-111111111111",
  content: "RAG stands for Retrieval-Augmented Generation.",
  position: 0,
  documentId: "22222222-2222-2222-2222-222222222222",
  collectionItemId: "33333333-3333-3333-3333-333333333333",
  filename: "intro.pdf",
  sourceUrl: "https://example.com/intro.pdf",
  score: 0.91,
};

describe("buildRetrievedContextPromptSection", () => {
  it("returns empty string for empty chunks", () => {
    expect(buildRetrievedContextPromptSection([])).toBe("");
  });

  it("wraps the chunks in a <retrieved_context> section", () => {
    const section = buildRetrievedContextPromptSection([baseChunk]);
    expect(section).toContain("<retrieved_context>");
    expect(section).toContain("</retrieved_context>");
  });

  it("includes the source filename and chunk position in the label", () => {
    const section = buildRetrievedContextPromptSection([baseChunk]);
    expect(section).toContain("[1] intro.pdf");
    expect(section).toContain("chunk 0");
    expect(section).toContain("score 0.910");
  });

  it("includes the chunk content in the body", () => {
    const section = buildRetrievedContextPromptSection([baseChunk]);
    expect(section).toContain("RAG stands for Retrieval-Augmented Generation.");
  });

  it("numbers chunks sequentially starting at 1", () => {
    const chunks: RetrievedChunk[] = [
      baseChunk,
      { ...baseChunk, id: "a", position: 1, filename: "b.pdf", score: 0.8 },
      { ...baseChunk, id: "b", position: 2, filename: "c.pdf", score: 0.7 },
    ];
    const section = buildRetrievedContextPromptSection(chunks);
    expect(section).toContain("[1] intro.pdf");
    expect(section).toContain("[2] b.pdf");
    expect(section).toContain("[3] c.pdf");
  });

  it("caps the number of chunks at maxChunks", () => {
    const chunks: RetrievedChunk[] = Array.from({ length: 10 }, (_, i) => ({
      ...baseChunk,
      id: `id-${i}`,
      position: i,
      filename: `f${i}.pdf`,
    }));
    const section = buildRetrievedContextPromptSection(chunks, {
      maxChunks: 3,
    });
    expect(section).toContain("[1] f0.pdf");
    expect(section).toContain("[2] f1.pdf");
    expect(section).toContain("[3] f2.pdf");
    expect(section).not.toContain("f3.pdf");
    expect(section).not.toContain("f9.pdf");
  });

  it("truncates very long chunk content with an ellipsis", () => {
    const longContent = "x".repeat(5000);
    const section = buildRetrievedContextPromptSection(
      [{ ...baseChunk, content: longContent }],
      { maxChunkChars: 100 },
    );
    expect(section).toContain("…");
    // the truncated body should be at most ~100 chars (the label is
    // separate, so we just check the chunk body is bounded).
    const lines = section.split("\n");
    const bodyLine = lines.find((line) => line.startsWith("x"));
    expect(bodyLine).toBeDefined();
    expect(bodyLine!.length).toBeLessThanOrEqual(101);
  });

  it("falls back to sourceUrl when filename is missing", () => {
    const chunk: RetrievedChunk = {
      ...baseChunk,
      filename: null,
      sourceUrl: "https://docs.example.com/article",
    };
    const section = buildRetrievedContextPromptSection([chunk]);
    expect(section).toContain("docs.example.com");
    expect(section).toContain("[1]");
  });

  it("falls back to a stable id-based label when both filename and sourceUrl are missing", () => {
    const chunk: RetrievedChunk = {
      ...baseChunk,
      filename: null,
      sourceUrl: null,
    };
    const section = buildRetrievedContextPromptSection([chunk]);
    // The implementation falls back to a prefix of collectionItemId
    // when neither filename nor sourceUrl is available. The chunk id
    // is a UUID, so the test asserts on a stable prefix of the
    // collectionItemId ("33333333"), not the chunk id.
    expect(section).toContain("33333333");
    expect(section).toContain("[1]");
  });

  it("handles a non-array input by returning empty string", () => {
    // Defensive: a buggy upstream could pass null/undefined. The
    // builder must not throw — the chat route depends on this.
    // @ts-expect-error — intentionally passing wrong type
    expect(buildRetrievedContextPromptSection(null)).toBe("");
    // @ts-expect-error — intentionally passing wrong type
    expect(buildRetrievedContextPromptSection(undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// P2.2 — formatRetrievedContext (thin citation-only formatter)
// ---------------------------------------------------------------------------

const simpleChunk = (
  overrides: Partial<RetrievedChunk> = {},
): RetrievedChunk => ({
  ...baseChunk,
  ...overrides,
});

describe("formatRetrievedContext — empty / single chunk", () => {
  it("returns an empty string for an empty array", () => {
    expect(formatRetrievedContext([])).toBe("");
  });

  it("returns a single citation line for one chunk", () => {
    const result = formatRetrievedContext([
      simpleChunk({ content: "Hello world", id: "a" }),
    ]);
    expect(result).toBe("[1] Hello world");
  });

  it("returns an empty string for null / undefined input", () => {
    // @ts-expect-error — runtime guard, not a type contract
    expect(formatRetrievedContext(null)).toBe("");
    // @ts-expect-error — runtime guard, not a type contract
    expect(formatRetrievedContext(undefined)).toBe("");
  });
});

describe("formatRetrievedContext — multiple chunks", () => {
  it("numbers citations from 1 and joins chunks with a blank line", () => {
    const result = formatRetrievedContext([
      simpleChunk({ id: "a", content: "First body" }),
      simpleChunk({ id: "b", content: "Second body" }),
      simpleChunk({ id: "c", content: "Third body" }),
    ]);
    expect(result).toBe("[1] First body\n\n[2] Second body\n\n[3] Third body");
  });

  it("respects the custom maxChunks cap", () => {
    const result = formatRetrievedContext(
      [
        simpleChunk({ id: "a", content: "First" }),
        simpleChunk({ id: "b", content: "Second" }),
        simpleChunk({ id: "c", content: "Third" }),
      ],
      { maxChunks: 2 },
    );
    expect(result).toBe("[1] First\n\n[2] Second");
  });
});

describe("formatRetrievedContext — truncation", () => {
  it("truncates chunks longer than maxCharsPerChunk and appends an ellipsis", () => {
    const longContent = "x".repeat(2000);
    const result = formatRetrievedContext(
      [simpleChunk({ content: longContent })],
      { maxCharsPerChunk: 100 },
    );
    // Body is everything after the "[1] " prefix.
    const body = result.replace(/^\[\d+\]\s+/, "");
    expect(body.length).toBeLessThanOrEqual(100);
    expect(body.endsWith("…")).toBe(true);
  });

  it("does not truncate chunks shorter than the cap", () => {
    const result = formatRetrievedContext(
      [simpleChunk({ content: "short body" })],
      { maxCharsPerChunk: 100 },
    );
    expect(result).toBe("[1] short body");
  });

  it("uses the documented defaults when no options are provided", () => {
    expect(FORMAT_DEFAULT_MAX_CHUNKS).toBe(5);
    expect(FORMAT_DEFAULT_MAX_CHARS_PER_CHUNK).toBe(800);

    const longContent = "a".repeat(FORMAT_DEFAULT_MAX_CHARS_PER_CHUNK + 100);
    const result = formatRetrievedContext([
      simpleChunk({ content: longContent }),
    ]);
    const body = result.replace(/^\[\d+\]\s+/, "");
    expect(body.length).toBe(FORMAT_DEFAULT_MAX_CHARS_PER_CHUNK);
    expect(body.endsWith("…")).toBe(true);
  });
});
