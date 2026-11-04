import "server-only";

import { and, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  AgentEntity,
  AgentInstall,
  AgentInstallTable,
  AgentTable,
  NewAgentInstall,
} from "../schema.pg";

// ---------------------------------------------------------------------------
// P4.0 schema foundation — Agent install repository
// ---------------------------------------------------------------------------
// CRUD stubs for the `agent_install` table plus the read-side helpers the
// public gallery page needs. Mirrors the shape of the MCP install
// repository (installMcpServer / uninstallMcpServer / listMcpServerInstalls
// / etc.) so the marketplace code in P4.C and the gallery code in P4.D
// can call the same patterns.
// ---------------------------------------------------------------------------

export interface CreateAgentInstallInput {
  agentId: string;
  config?: Record<string, unknown>;
}

export const agentInstallRepository = {
  /**
   * Install a gallery agent for a user (optionally a team). UNIQUE
   * (user_id, agent_id) — re-installing upserts the config rather
   * than creating a duplicate row.
   */
  async installAgent(
    input: CreateAgentInstallInput,
    userId: string,
    orgId?: string | null,
  ): Promise<AgentInstall> {
    const [row] = await db
      .insert(AgentInstallTable)
      .values({
        userId,
        orgId: orgId ?? null,
        agentId: input.agentId,
        config: input.config ?? {},
      } satisfies NewAgentInstall)
      .onConflictDoUpdate({
        target: [AgentInstallTable.userId, AgentInstallTable.agentId],
        set: {
          config: input.config ?? {},
          orgId: orgId ?? null,
        },
      })
      .returning();
    return row as AgentInstall;
  },

  /**
   * Uninstall. Owner-scoped — a user can only uninstall their own row.
   */
  async uninstallAgent(userId: string, agentId: string): Promise<boolean> {
    const result = await db
      .delete(AgentInstallTable)
      .where(
        and(
          eq(AgentInstallTable.userId, userId),
          eq(AgentInstallTable.agentId, agentId),
        ),
      )
      .returning({ id: AgentInstallTable.id });
    return result.length > 0;
  },

  /**
   * List a user's installs. If `orgId` is provided, restrict to rows
   * tagged with that team.
   */
  async listAgentInstalls(
    userId: string,
    orgId?: string | null,
  ): Promise<AgentInstall[]> {
    const where = orgId
      ? and(
          eq(AgentInstallTable.userId, userId),
          eq(AgentInstallTable.orgId, orgId),
        )
      : eq(AgentInstallTable.userId, userId);
    return (await db
      .select()
      .from(AgentInstallTable)
      .where(where)
      .orderBy(desc(AgentInstallTable.createdAt))) as AgentInstall[];
  },

  async getAgentInstall(
    userId: string,
    agentId: string,
  ): Promise<AgentInstall | null> {
    const [row] = await db
      .select()
      .from(AgentInstallTable)
      .where(
        and(
          eq(AgentInstallTable.userId, userId),
          eq(AgentInstallTable.agentId, agentId),
        ),
      );
    return (row as AgentInstall | undefined) ?? null;
  },

  /**
   * Best-effort denormalized-cache bump. Same caveat as
   * `mcpInstallRepository.incrementInstallCount`: NOT idempotent.
   */
  async incrementInstallCount(agentId: string): Promise<void> {
    await db
      .update(AgentTable)
      .set({
        installCount: sql`${AgentTable.installCount} + 1`,
      })
      .where(eq(AgentTable.id, agentId));
  },

  /**
   * Gallery landing page: most-recently published, published-only.
   * Public — no userId scope. Uses the
   * `agent_published_idx` (published_at DESC WHERE published_at IS
   * NOT NULL) partial index defined in 0025.
   */
  async listPublishedAgents(limit = 50, offset = 0): Promise<AgentEntity[]> {
    return (await db
      .select()
      .from(AgentTable)
      .where(isNotNull(AgentTable.publishedAt))
      .orderBy(desc(AgentTable.publishedAt))
      .limit(limit)
      .offset(offset)) as AgentEntity[];
  },

  /**
   * Gallery detail page. Returns the agent only if it has been
   * published (`publishedAt IS NOT NULL`). Public — no userId
   * scope. Returns null for missing OR not-yet-published agents so
   * the install route can map both to a single 404.
   */
  async getPublishedAgent(id: string): Promise<AgentEntity | null> {
    const [row] = await db
      .select()
      .from(AgentTable)
      .where(and(eq(AgentTable.id, id), isNotNull(AgentTable.publishedAt)));
    return (row as AgentEntity | undefined) ?? null;
  },

  /**
   * Gallery search. Case-insensitive substring match across `name`
   * and `description`, restricted to published agents. Public — no
   * userId scope.
   */
  async searchPublishedAgents(
    query: string,
    limit = 30,
  ): Promise<AgentEntity[]> {
    const q = `%${query}%`;
    return (await db
      .select()
      .from(AgentTable)
      .where(
        and(
          isNotNull(AgentTable.publishedAt),
          or(ilike(AgentTable.name, q), ilike(AgentTable.description, q)),
        ),
      )
      .orderBy(desc(AgentTable.publishedAt))
      .limit(limit)) as AgentEntity[];
  },
};
