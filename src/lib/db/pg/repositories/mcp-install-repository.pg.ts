import "server-only";

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  McpServerEntity,
  McpServerInstall,
  McpServerInstallTable,
  McpServerTable,
  NewMcpServerInstall,
} from "../schema.pg";

// ---------------------------------------------------------------------------
// P4.0 schema foundation — MCP install repository
// ---------------------------------------------------------------------------
// CRUD stubs for the `mcp_server_install` table plus the read-side helpers
// the marketplace page needs:
//   * installMcpServer / uninstallMcpServer — write path. Always user-scoped
//     (a team install is just a personal install with `orgId` set).
//   * listMcpServerInstalls / getMcpServerInstall — read path; both accept
//     an optional `orgId` so the team dashboard can list team-wide installs
//     without leaking rows from other teams.
//   * incrementInstallCount — denormalized-cache bump; the marketplace UI
//     optimistically increments and the worker reconciles the source of
//     truth (`mcp_server_install` row count).
//   * listCuratedMcpServers / searchMcpServers / getMarketplaceMcpServer —
//     public read paths used by the marketplace page (no userId scope;
//     the marketplace is public).
// ---------------------------------------------------------------------------

export interface CreateMcpServerInstallInput {
  mcpServerId: string;
  config?: Record<string, unknown>;
}

export const mcpInstallRepository = {
  /**
   * Install a marketplace MCP server for a user (optionally a team).
   * UNIQUE (user_id, mcp_server_id) — re-installing upserts the config
   * rather than creating a duplicate row. Bumps the denormalized
   * `mcp_server.install_count` for the marketplace sort.
   */
  async installMcpServer(
    input: CreateMcpServerInstallInput,
    userId: string,
    orgId?: string | null,
  ): Promise<McpServerInstall> {
    const [row] = await db
      .insert(McpServerInstallTable)
      .values({
        userId,
        orgId: orgId ?? null,
        mcpServerId: input.mcpServerId,
        config: input.config ?? {},
      } satisfies NewMcpServerInstall)
      .onConflictDoUpdate({
        target: [
          McpServerInstallTable.userId,
          McpServerInstallTable.mcpServerId,
        ],
        set: {
          config: input.config ?? {},
          orgId: orgId ?? null,
        },
      })
      .returning();
    return row as McpServerInstall;
  },

  /**
   * Uninstall. Owner-scoped — a user can only uninstall their own row,
   * not a row that belongs to a different user / team.
   */
  async uninstallMcpServer(
    userId: string,
    mcpServerId: string,
  ): Promise<boolean> {
    const result = await db
      .delete(McpServerInstallTable)
      .where(
        and(
          eq(McpServerInstallTable.userId, userId),
          eq(McpServerInstallTable.mcpServerId, mcpServerId),
        ),
      )
      .returning({ id: McpServerInstallTable.id });
    return result.length > 0;
  },

  /**
   * List a user's installs. If `orgId` is provided, restrict to rows
   * tagged with that team — the team dashboard uses this. If `orgId`
   * is undefined, returns BOTH personal and team installs owned by
   * the user (the personal dashboard's "all my installs" view).
   */
  async listMcpServerInstalls(
    userId: string,
    orgId?: string | null,
  ): Promise<McpServerInstall[]> {
    const where = orgId
      ? and(
          eq(McpServerInstallTable.userId, userId),
          eq(McpServerInstallTable.orgId, orgId),
        )
      : eq(McpServerInstallTable.userId, userId);
    return (await db
      .select()
      .from(McpServerInstallTable)
      .where(where)
      .orderBy(desc(McpServerInstallTable.createdAt))) as McpServerInstall[];
  },

  async getMcpServerInstall(
    userId: string,
    mcpServerId: string,
  ): Promise<McpServerInstall | null> {
    const [row] = await db
      .select()
      .from(McpServerInstallTable)
      .where(
        and(
          eq(McpServerInstallTable.userId, userId),
          eq(McpServerInstallTable.mcpServerId, mcpServerId),
        ),
      );
    return (row as McpServerInstall | undefined) ?? null;
  },

  /**
   * Best-effort denormalized-cache bump. Called from the marketplace
   * page on a successful install so the listing order is fresh. Uses
   * `install_count + 1` (not a fixed value) so concurrent installs
   * are correctly accumulated. NOT idempotent — a re-install will
   * double-count; the UI only calls this once per fresh install.
   */
  async incrementInstallCount(mcpServerId: string): Promise<void> {
    await db
      .update(McpServerTable)
      .set({
        installCount: sql`${McpServerTable.installCount} + 1`,
      })
      .where(eq(McpServerTable.id, mcpServerId));
  },

  /**
   * Marketplace landing page: editor's picks, sorted by popularity.
   * Public — no userId scope. Uses the
   * `mcp_server_curated_idx` (curated, install_count DESC) compound
   * index defined in 0025.
   */
  async listCuratedMcpServers(
    limit = 50,
    offset = 0,
  ): Promise<McpServerEntity[]> {
    return (await db
      .select()
      .from(McpServerTable)
      .where(eq(McpServerTable.curated, true))
      .orderBy(desc(McpServerTable.installCount))
      .limit(limit)
      .offset(offset)) as McpServerEntity[];
  },

  /**
   * Marketplace search. Case-insensitive substring match across
   * `name` and `description`. Public — no userId scope.
   */
  async searchMcpServers(
    query: string,
    limit = 30,
  ): Promise<McpServerEntity[]> {
    const q = `%${query}%`;
    return (await db
      .select()
      .from(McpServerTable)
      .where(
        or(ilike(McpServerTable.name, q), ilike(McpServerTable.description, q)),
      )
      .orderBy(desc(McpServerTable.installCount))
      .limit(limit)) as McpServerEntity[];
  },

  /**
   * Marketplace detail page. Accepts either a server id (uuid) or a
   * slug-shaped name match; for the MVP we just match on id or exact
   * name. Returns null if no match.
   */
  async getMarketplaceMcpServer(
    slugOrId: string,
  ): Promise<McpServerEntity | null> {
    const [row] = await db
      .select()
      .from(McpServerTable)
      .where(
        or(eq(McpServerTable.id, slugOrId), eq(McpServerTable.name, slugOrId)),
      );
    return (row as McpServerEntity | undefined) ?? null;
  },
};
