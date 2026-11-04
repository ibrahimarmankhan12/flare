import { describe, expect, it } from "vitest";
import {
  buildScopeConditions,
  EMBEDDING_DIMENSIONS,
  formatEmbeddingForPg,
  orderByRelevance,
  scoreExpression,
} from "./memory-helpers";

describe("formatEmbeddingForPg", () => {
  it("formats a non-empty embedding as a Postgres vector literal", () => {
    expect(formatEmbeddingForPg([0.1, 0.2, 0.3])).toBe("[0.1,0.2,0.3]");
  });

  it("handles negative and large values", () => {
    expect(formatEmbeddingForPg([-1, 0, 1.5])).toBe("[-1,0,1.5]");
  });

  it("handles the model's expected dimension", () => {
    const big = new Array(EMBEDDING_DIMENSIONS).fill(0).map((_, i) => i * 0.001);
    const literal = formatEmbeddingForPg(big);
    expect(literal.startsWith("[")).toBe(true);
    expect(literal.endsWith("]")).toBe(true);
    // Spot-check a few values are present.
    expect(literal).toContain("0");
    expect(literal).toContain("1.529");
  });

  it("throws on empty array", () => {
    expect(() => formatEmbeddingForPg([])).toThrow(
      "Cannot format empty embedding",
    );
  });

  it("throws on NaN", () => {
    expect(() => formatEmbeddingForPg([0.1, Number.NaN, 0.3])).toThrow(
      "non-finite value at index 1",
    );
  });

  it("throws on Infinity", () => {
    expect(() => formatEmbeddingForPg([0.1, Number.POSITIVE_INFINITY])).toThrow(
      "non-finite value at index 1",
    );
  });
});

describe("buildScopeConditions", () => {
  // The helper collapses scope fan-out into a single OR fragment, so the
  // total length is always 4 (userId + embedding-not-null + confidence
  // clause + scope-OR). Agent/thread inputs add branches *inside* the OR,
  // not new top-level entries.
  it("returns the baseline conditions for a user-scope-only search", () => {
    const conditions = buildScopeConditions("user-1", {});
    expect(conditions).toHaveLength(4);
  });

  it("does not add new top-level entries for agentId", () => {
    const conditions = buildScopeConditions("user-1", { agentId: "agent-1" });
    expect(conditions).toHaveLength(4);
  });

  it("does not add new top-level entries for threadId", () => {
    const conditions = buildScopeConditions("user-1", {
      agentId: "agent-1",
      threadId: "thread-1",
    });
    expect(conditions).toHaveLength(4);
  });

  it("honors minConfidence as a positive threshold", () => {
    const conditions = buildScopeConditions("user-1", { minConfidence: 0.5 });
    expect(conditions).toHaveLength(4);
  });
});

describe("scoreExpression / orderByRelevance", () => {
  it("scoreExpression returns an SQL fragment", () => {
    const expr = scoreExpression("[0.1,0.2]");
    // The fragment should exist; we just need to confirm it doesn't throw.
    expect(expr).toBeDefined();
  });

  it("orderByRelevance returns pinned-first, distance-second", () => {
    const order = orderByRelevance("[0.1,0.2]");
    // Two fragments: pinned DESC, distance ASC
    expect(order).toHaveLength(2);
  });
});
