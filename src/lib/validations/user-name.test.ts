import { describe, expect, it } from "vitest";
import { userNameSchema } from "./user-name";

describe("userNameSchema", () => {
  it("accepts common human names", () => {
    const result = userNameSchema.safeParse("Flare Labs O'Connor-Singh");
    expect(result.success).toBe(true);
  });

  it("trims leading/trailing spaces", () => {
    const result = userNameSchema.safeParse("  Alice Doe  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("Alice Doe");
    }
  });

  it("rejects payload-like punctuation", () => {
    const result = userNameSchema.safeParse("admin', role='admin'--");
    expect(result.success).toBe(false);
  });

  it("rejects repeated whitespace", () => {
    const result = userNameSchema.safeParse("John  Doe");
    expect(result.success).toBe(false);
  });
});
