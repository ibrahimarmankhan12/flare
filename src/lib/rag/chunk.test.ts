import { describe, expect, it } from "vitest";
import {
  chunkText,
  DEFAULT_CHUNK_MAX_CHARS,
  DEFAULT_CHUNK_OVERLAP,
} from "./chunk";

describe("chunkText — empty / trivial input", () => {
  it("returns an empty array for an empty string", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("returns an empty array for whitespace-only input", () => {
    expect(chunkText("   \n\n  \t  ")).toEqual([]);
  });

  it("returns the input unchanged when it fits in a single chunk", () => {
    const text = "A short paragraph that easily fits inside the chunk budget.";
    const result = chunkText(text, { maxChars: 1000, overlap: 200 });
    expect(result).toEqual([text]);
  });
});

describe("chunkText — paragraph-level splits", () => {
  it("splits on \\n\\n boundaries and keeps each paragraph in its own chunk", () => {
    const text = [
      "First paragraph that is a bit longer.",
      "Second paragraph also a bit longer.",
      "Third paragraph here as well.",
    ].join("\n\n");

    const result = chunkText(text, { maxChars: 60, overlap: 0 });
    // Each paragraph is 35-37 chars and joins into ~75 with "\n\n", so we
    // expect one chunk per paragraph (no merging because the join would
    // exceed 60).
    expect(result).toEqual([
      "First paragraph that is a bit longer.",
      "Second paragraph also a bit longer.",
      "Third paragraph here as well.",
    ]);
  });

  it("merges adjacent small paragraphs into a single chunk", () => {
    const text = "Para A.\n\nPara B.\n\nPara C.";
    // 8 + 2 + 8 + 2 + 8 = 28 chars total, fits in a single 50-char chunk.
    const result = chunkText(text, { maxChars: 50, overlap: 0 });
    expect(result).toEqual([text]);
  });
});

describe("chunkText — overlap behaviour", () => {
  it("applies the configured overlap to the second chunk onward", () => {
    // Three small paragraphs separated by double newlines. Each paragraph
    // is short enough to fit in a 25-char chunk on its own, so we get 3
    // base chunks. With overlap=10, the second chunk begins with the
    // last 10 chars of the first.
    const p1 = "AAA AAA AAA AAA."; // 16 chars
    const p2 = "BBB BBB BBB BBB."; // 16 chars
    const p3 = "CCC CCC CCC CCC."; // 16 chars
    const text = `${p1}\n\n${p2}\n\n${p3}`;

    const result = chunkText(text, { maxChars: 25, overlap: 10 });
    expect(result.length).toBe(3);
    expect(result[0]).toBe(p1);
    // The second chunk starts with the tail of the first.
    expect(result[1]?.startsWith(p1.slice(-10))).toBe(true);
    expect(result[1]?.endsWith(p2)).toBe(true);
    // The third chunk starts with the tail of the second (which itself was
    // already suffixed with part of the first, so we just check the
    // boundary alignment with the second chunk's tail).
    expect(result[2]?.endsWith(p3)).toBe(true);
  });

  it("returns a single chunk when overlap is requested but only one is produced", () => {
    const text = "Tiny paragraph.";
    const result = chunkText(text, { maxChars: 100, overlap: 30 });
    expect(result).toEqual([text]);
  });
});

describe("chunkText — edge cases", () => {
  it("hard-splits a very long string with no separators at all", () => {
    const text = "x".repeat(2500);
    const result = chunkText(text, { maxChars: 1000, overlap: 0 });
    expect(result.length).toBe(3);
    expect(result[0]?.length).toBe(1000);
    expect(result[1]?.length).toBe(1000);
    expect(result[2]?.length).toBe(500);
    // Re-joining yields the original text (no separator means lossless).
    expect(result.join("")).toBe(text);
  });

  it("falls through to a finer separator when the coarser one is absent", () => {
    // Only single-newline separators are present. The splitter should
    // fall through to "\n" and split accordingly.
    const line = "x".repeat(40);
    const text = [line, line, line].join("\n");
    const result = chunkText(text, { maxChars: 50, overlap: 0 });
    expect(result).toEqual([line, line, line]);
  });

  it("falls through all the way to character split for an unbroken string", () => {
    const text = "a".repeat(2500);
    const result = chunkText(text, { maxChars: 500, overlap: 0 });
    expect(result.length).toBe(5);
    for (const chunk of result) {
      expect(chunk.length).toBe(500);
    }
  });
});

describe("chunkText — option validation", () => {
  it("throws when maxChars is non-positive", () => {
    expect(() => chunkText("hello", { maxChars: 0 })).toThrow(/maxChars/);
    expect(() => chunkText("hello", { maxChars: -10 })).toThrow(/maxChars/);
  });

  it("throws when overlap is negative", () => {
    expect(() => chunkText("hello", { overlap: -1 })).toThrow(/overlap/);
  });

  it("throws when overlap is >= maxChars", () => {
    expect(() => chunkText("hello", { maxChars: 100, overlap: 100 })).toThrow(
      /overlap/,
    );
    expect(() => chunkText("hello", { maxChars: 100, overlap: 150 })).toThrow(
      /overlap/,
    );
  });
});

describe("chunkText — defaults", () => {
  it("exports the documented defaults", () => {
    expect(DEFAULT_CHUNK_MAX_CHARS).toBe(1000);
    expect(DEFAULT_CHUNK_OVERLAP).toBe(200);
  });

  it("uses the default chunk size when no options are provided", () => {
    // Build a string that's well past the default 1000-char budget.
    // Each paragraph is 250 chars; 5 of them joined with "\n\n" is 1258.
    const paragraphs = Array.from({ length: 5 }, (_, i) =>
      `Paragraph number ${i} `.padEnd(250, "x"),
    );
    const text = paragraphs.join("\n\n");
    const result = chunkText(text);
    expect(result.length).toBeGreaterThan(1);
  });
});
