import { describe, expect, it } from "vitest";
import {
  buildSourceLink,
  getCategoryColor,
  getCategoryLabel,
  getScopeColor,
  getScopeLabel,
  MEMORY_CATEGORY_OPTIONS,
  truncateForPreview,
} from "./memory-ui-helpers";

describe("getCategoryColor", () => {
  it("returns a color class for a known category", () => {
    expect(getCategoryColor("preferences")).toMatch(/^bg-/);
    expect(getCategoryColor("identity")).toMatch(/^bg-/);
    expect(getCategoryColor("context")).toMatch(/^bg-/);
  });

  it("is case-insensitive", () => {
    const lower = getCategoryColor("preferences");
    const upper = getCategoryColor("PREFERENCES");
    expect(lower).toBe(upper);
  });

  it("falls back to neutral when category is null or empty", () => {
    const nullColor = getCategoryColor(null);
    const undefColor = getCategoryColor(undefined);
    const emptyColor = getCategoryColor("");
    expect(nullColor).toBe(getCategoryColor("general"));
    expect(undefColor).toBe(nullColor);
    expect(emptyColor).toBe(nullColor);
  });

  it("falls back to neutral for an unknown category", () => {
    expect(getCategoryColor("not-a-real-category")).toBe(
      getCategoryColor("general"),
    );
  });

  it("maps alias keys (preference, project) to the canonical color", () => {
    // Aliases exist so imported memories (e.g. "preference" singular) still
    // pick up a color instead of falling through to neutral.
    expect(getCategoryColor("preference")).toBe(
      getCategoryColor("preferences"),
    );
    expect(getCategoryColor("project")).toBe(getCategoryColor("projects"));
    expect(getCategoryColor("instruction")).toBe(
      getCategoryColor("instructions"),
    );
  });
});

describe("getCategoryLabel", () => {
  it("returns the category string when set", () => {
    expect(getCategoryLabel("preferences")).toBe("preferences");
    expect(getCategoryLabel("Identity")).toBe("Identity");
  });

  it("returns 'general' for null/empty/whitespace", () => {
    expect(getCategoryLabel(null)).toBe("general");
    expect(getCategoryLabel(undefined)).toBe("general");
    expect(getCategoryLabel("")).toBe("general");
    expect(getCategoryLabel("   ")).toBe("general");
  });
});

describe("getScopeLabel", () => {
  it("returns the scope string for known values", () => {
    expect(getScopeLabel("user")).toBe("user");
    expect(getScopeLabel("agent")).toBe("agent");
    expect(getScopeLabel("thread")).toBe("thread");
  });

  it("defaults to 'user' for null/empty", () => {
    expect(getScopeLabel(null)).toBe("user");
    expect(getScopeLabel(undefined)).toBe("user");
    expect(getScopeLabel("")).toBe("user");
  });

  it("passes through unknown scope strings", () => {
    // Forward-compat: if a future migration adds a new scope, the UI
    // should still render it instead of silently downgrading to "user".
    expect(getScopeLabel("workspace")).toBe("workspace");
  });
});

describe("getScopeColor", () => {
  it("returns different colors for the three scopes", () => {
    const user = getScopeColor("user");
    const agent = getScopeColor("agent");
    const thread = getScopeColor("thread");
    expect(user).not.toBe(agent);
    expect(agent).not.toBe(thread);
    expect(user).not.toBe(thread);
  });

  it("falls back to user color for null/unknown", () => {
    expect(getScopeColor(null)).toBe(getScopeColor("user"));
    expect(getScopeColor("unknown-scope")).toBe(getScopeColor("user"));
  });
});

describe("truncateForPreview", () => {
  it("returns the input unchanged when shorter than max", () => {
    expect(truncateForPreview("hello", 10)).toBe("hello");
  });

  it("returns the input unchanged when equal to max", () => {
    expect(truncateForPreview("1234567890", 10)).toBe("1234567890");
  });

  it("truncates and adds an ellipsis when longer than max", () => {
    const out = truncateForPreview("a".repeat(100), 10);
    expect(out.length).toBeLessThanOrEqual(11); // 10 chars + ellipsis
    expect(out.endsWith("…")).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(truncateForPreview("  hello  ", 50)).toBe("hello");
  });

  it("returns empty string for empty input", () => {
    expect(truncateForPreview("", 10)).toBe("");
  });
});

describe("buildSourceLink", () => {
  it("returns null when either id is missing", () => {
    expect(
      buildSourceLink({ threadId: null, sourceMessageId: "msg-1" }),
    ).toBeNull();
    expect(
      buildSourceLink({ threadId: "thread-1", sourceMessageId: null }),
    ).toBeNull();
    expect(
      buildSourceLink({ threadId: undefined, sourceMessageId: undefined }),
    ).toBeNull();
  });

  it("returns the chat URL with the message query param when both are set", () => {
    expect(
      buildSourceLink({
        threadId: "thread-abc",
        sourceMessageId: "msg-xyz",
      }),
    ).toBe("/chat/thread-abc?message=msg-xyz");
  });

  it("URL-encodes the message id when it contains special characters", () => {
    const link = buildSourceLink({
      threadId: "thread-abc",
      sourceMessageId: "msg/with spaces&symbols",
    });
    expect(link).not.toBeNull();
    expect(link).toContain("thread-abc");
    // The raw value should not be present unencoded
    expect(link).not.toContain("msg/with spaces&symbols");
  });
});

describe("MEMORY_CATEGORY_OPTIONS", () => {
  it("includes the canonical categories and 'general' as a default", () => {
    expect(MEMORY_CATEGORY_OPTIONS).toContain("general");
    expect(MEMORY_CATEGORY_OPTIONS).toContain("preferences");
    expect(MEMORY_CATEGORY_OPTIONS).toContain("identity");
    expect(MEMORY_CATEGORY_OPTIONS).toContain("career");
    expect(MEMORY_CATEGORY_OPTIONS).toContain("projects");
    expect(MEMORY_CATEGORY_OPTIONS).toContain("instructions");
    expect(MEMORY_CATEGORY_OPTIONS).toContain("context");
    expect(MEMORY_CATEGORY_OPTIONS).toContain("technical");
  });

  it("has no duplicates", () => {
    expect(new Set(MEMORY_CATEGORY_OPTIONS).size).toBe(
      MEMORY_CATEGORY_OPTIONS.length,
    );
  });
});
