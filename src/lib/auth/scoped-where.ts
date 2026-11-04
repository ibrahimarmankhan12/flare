import "server-only";

// ---------------------------------------------------------------------------
// P4.A — Org-scoped WHERE-clause builder (Phase 4 / #19 Team seats)
// ---------------------------------------------------------------------------
// Every Phase 4 repository that already had a `WHERE user_id = ?` filter
// should swap to `buildOrgScopedWhere(table, { userId, orgId })` instead of
// hand-rolling a second `OR org_id = ?` branch. The intent of #19 is that
// one shared helper replaces ad-hoc per-table `eq(table.userId, userId)`
// checks — centralising the rules here means the "personal vs org" decision
// is consistent across chat_thread, chat_message, workflow, collection,
// bookmark, user_memory, mcp_server_install, agent_install, etc.
//
// Rules:
//   1. If `orgId` is set (non-null, non-empty) → scope rows to that org.
//   2. Otherwise → scope rows to the calling user (personal).
//   3. If neither is provided → return `undefined`. The caller is expected
//      to either throw a 401/403, fall back to "all rows" (admin only), or
//      apply its own policy. We don't throw here so this helper stays
//      usable in inner-join positions and from server-side batch jobs.
//
// We deliberately do NOT call `isOrgMember` from inside this helper — the
// route handler is responsible for gating access before the query. Doing
// it here would add a per-row DB call inside a SELECT and tank the
// query plan. Use `isOrgMember(userId, orgId)` in the route.
// ---------------------------------------------------------------------------

import { type SQL, and, eq } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import { TeamMemberTable } from "lib/db/pg/schema.pg";

export type Scope = "personal" | "org";

/**
 * Input to {@link buildOrgScopedWhere}. The helper itself does not care
 * about the `Scope` enum — it only reads `orgId` — but the discriminated
 * union is exported so call sites can express intent explicitly.
 */
export type ScopeInput = {
  userId: string;
  orgId?: string | null;
};

/**
 * Drizzle column handle. We use a loose structural type here rather
 * than importing `Column<...>` so the helper stays generic and
 * independent of Drizzle's internal type graph. Any object Drizzle's
 * `eq` accepts will satisfy this type.
 */
type ColumnLike = any;

/**
 * The minimum table shape the helper needs. A real Drizzle `pgTable`
 * satisfies this naturally; tests pass in a `{ userId, orgId }` stub.
 */
export type ScopedTable = {
  userId: ColumnLike;
  orgId?: ColumnLike;
};

/**
 * Build a `WHERE` fragment for a Drizzle query that scopes the rows to
 * either the calling user's personal scope or a specific org. Returns
 * `undefined` if neither `userId` nor `orgId` is provided — the caller
 * decides what to do (401, admin fallback, etc.).
 */
export const buildOrgScopedWhere = <T extends ScopedTable>(
  table: T,
  scope: ScopeInput,
): SQL | undefined => {
  const orgId = scope.orgId?.trim();
  if (orgId && table.orgId) {
    // Org scope: caller is acting on behalf of a team. The route is
    // expected to have already verified membership via `isOrgMember`.
    return eq(table.orgId, orgId);
  }
  if (!scope.userId) {
    return undefined;
  }
  return eq(table.userId, scope.userId);
};

/**
 * Membership check. Returns `true` iff the user has any row in
 * `team_member` for the given `orgId`. Used by route handlers to gate
 * access *before* a query so the downstream SELECT can be a simple
 * indexed lookup.
 */
export const isOrgMember = async (
  userId: string,
  orgId: string,
): Promise<boolean> => {
  if (!userId || !orgId) return false;
  const [row] = await db
    .select({ id: TeamMemberTable.id })
    .from(TeamMemberTable)
    .where(
      and(
        eq(TeamMemberTable.teamId, orgId),
        eq(TeamMemberTable.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
};
