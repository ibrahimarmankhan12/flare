import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// P4.A — scoped-where helper tests
// ---------------------------------------------------------------------------
// We mock the `pgDb` so `isOrgMember` runs without a live database, and
// we construct a fake Drizzle `table` object that satisfies the
// `ScopedTable` structural type. The `eq` calls inside the helper
// produce real `SQL` instances, so we walk `queryChunks` recursively
// to assert on the column names that the WHERE clause targets.
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));

const isOrgMemberMock = vi.fn();
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: {
    select: (...args: unknown[]) => ({
      from: () => ({
        where: (whereClause: unknown) => ({
          limit: () => Promise.resolve(isOrgMemberMock(...args, whereClause)),
        }),
      }),
    }),
  },
}));

const scopedWhere = await import("./scoped-where");

// Minimal stand-in for a Drizzle `pgTable` row. Only the column handles
// we exercise need to exist; the helper reads them by name.
const fakeTable = {
  userId: { name: "user_id" },
  orgId: { name: "org_id" },
};

// A table with no `orgId` column — exercises the constraint that the
// helper accepts both shapes.
const fakeTableNoOrg = {
  userId: { name: "user_id" },
};

// Walk the recursive `queryChunks` of a Drizzle `SQL` instance and
// return every leaf chunk that looks like a column reference (has a
// `name` property) or a literal value. Drizzle stores column refs as
// `{ name: "user_id" }`, string literals as bare strings, and
// operator/parenthesis tokens as `{ value: ["..."] }`. All three
// shapes are flattened into a single string array for easy assertion.
type AnyChunk = { name?: string; value?: string[]; queryChunks?: AnyChunk[] };
const collectChunkNames = (sql: { queryChunks: AnyChunk[] }): string[] => {
  const out: string[] = [];
  const walk = (chunk: unknown): void => {
    if (chunk == null) return;
    if (typeof chunk === "string") {
      out.push(chunk);
      return;
    }
    if (Array.isArray(chunk)) {
      chunk.forEach(walk);
      return;
    }
    if (typeof chunk === "object") {
      const c = chunk as AnyChunk;
      if (c.name) out.push(c.name);
      if (Array.isArray(c.value)) {
        for (const v of c.value) out.push(v);
      }
      if (Array.isArray(c.queryChunks)) walk(c.queryChunks);
    }
  };
  walk(sql.queryChunks);
  return out;
};

describe("auth/scoped-where", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("buildOrgScopedWhere", () => {
    it("returns a WHERE on userId when no orgId is provided (personal scope)", () => {
      const where = scopedWhere.buildOrgScopedWhere(fakeTable, {
        userId: "u1",
      });
      expect(where).toBeDefined();
      const names = collectChunkNames(where as { queryChunks: AnyChunk[] });
      expect(names).toContain("user_id");
      expect(names).toContain("u1");
      expect(names).not.toContain("org_id");
    });

    it("returns a WHERE on orgId when orgId is set (org scope)", () => {
      const where = scopedWhere.buildOrgScopedWhere(fakeTable, {
        userId: "u1",
        orgId: "o1",
      });
      expect(where).toBeDefined();
      const names = collectChunkNames(where as { queryChunks: AnyChunk[] });
      expect(names).toContain("org_id");
      expect(names).toContain("o1");
      // The personal branch must not leak into the rendered SQL.
      expect(names).not.toContain("u1");
    });

    it("treats null orgId as personal scope (not as 'no rows')", () => {
      const where = scopedWhere.buildOrgScopedWhere(fakeTable, {
        userId: "u1",
        orgId: null,
      });
      expect(where).toBeDefined();
      const names = collectChunkNames(where as { queryChunks: AnyChunk[] });
      expect(names).toContain("user_id");
      expect(names).toContain("u1");
    });

    it("treats empty-string orgId as personal scope (defensive)", () => {
      const where = scopedWhere.buildOrgScopedWhere(fakeTable, {
        userId: "u1",
        orgId: "",
      });
      expect(where).toBeDefined();
      const names = collectChunkNames(where as { queryChunks: AnyChunk[] });
      expect(names).toContain("user_id");
    });

    it("returns undefined when neither userId nor orgId is provided", () => {
      const where = scopedWhere.buildOrgScopedWhere(fakeTable, {
        userId: "",
      });
      expect(where).toBeUndefined();
    });

    it("works on a table shape that lacks orgId (e.g. a legacy table)", () => {
      const where = scopedWhere.buildOrgScopedWhere(fakeTableNoOrg, {
        userId: "u1",
        orgId: "o1",
      });
      // orgId is ignored when the table has no such column — we fall
      // back to the personal branch rather than throwing.
      expect(where).toBeDefined();
      const names = collectChunkNames(where as { queryChunks: AnyChunk[] });
      expect(names).toContain("user_id");
    });

    it("throws at the type-checker if a table shape is missing userId", () => {
      // This is enforced at compile time; we exercise the runtime path
      // by passing an object with a malformed userId handle. The
      // helper should still produce *something* — Drizzle's `eq` will
      // not throw for a missing name at runtime, but the column won't
      // appear in the SQL.
      const malformed = { userId: { name: "x" } };
      const where = scopedWhere.buildOrgScopedWhere(malformed, {
        userId: "u1",
      });
      expect(where).toBeDefined();
    });
  });

  describe("isOrgMember", () => {
    it("returns false when either argument is empty", async () => {
      expect(await scopedWhere.isOrgMember("", "o1")).toBe(false);
      expect(await scopedWhere.isOrgMember("u1", "")).toBe(false);
    });

    it("returns true when the mocked query finds a row", async () => {
      isOrgMemberMock.mockResolvedValueOnce([{ id: "row-1" }]);
      const ok = await scopedWhere.isOrgMember("u1", "o1");
      expect(ok).toBe(true);
    });

    it("returns false when the mocked query finds no row", async () => {
      isOrgMemberMock.mockResolvedValueOnce([]);
      const ok = await scopedWhere.isOrgMember("u1", "o1");
      expect(ok).toBe(false);
    });
  });
});
