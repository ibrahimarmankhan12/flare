import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import { AgentView, AgentViewTable, NewAgentView } from "../schema.pg";

// ---------------------------------------------------------------------------
// P4.0 schema foundation — Agent view repository
// ---------------------------------------------------------------------------
// Append-only analytics for the agent gallery (#15). `recordAgentView` is
// designed to be fire-and-forget — the gallery page does not await it, so
// a slow insert does not block the render. `countAgentViews` and
// `countAgentViewsByDay` are aggregate read paths for the agent's owner
// dashboard (a future P4.D follow-up).
// ---------------------------------------------------------------------------

export const agentViewRepository = {
  /**
   * Record one page view. Anonymous views are allowed (userId is
   * nullable). `referrer` is the upstream URL the user came from so
   * the agent owner can see "where did my audience find me".
   */
  async recordAgentView(
    agentId: string,
    userId?: string | null,
    referrer?: string | null,
  ): Promise<AgentView> {
    const [row] = await db
      .insert(AgentViewTable)
      .values({
        agentId,
        userId: userId ?? null,
        referrer: referrer ?? null,
      } satisfies NewAgentView)
      .returning();
    return row as AgentView;
  },

  /**
   * Lifetime view count for an agent. Cheap aggregate scan on the
   * (agent_id, viewed_at) index.
   */
  async countAgentViews(agentId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(AgentViewTable)
      .where(eq(AgentViewTable.agentId, agentId));
    return row?.count ?? 0;
  },

  /**
   * View count per day for the last `days` days, suitable for a
   * sparkline. Returns an array of `{ day, count }` sorted
   * chronologically. Days with zero views are filled in so the
   * sparkline doesn't have gaps.
   */
  async countAgentViewsByDay(
    agentId: string,
    days = 14,
  ): Promise<Array<{ day: string; count: number }>> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${AgentViewTable.viewedAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(AgentViewTable)
      .where(
        and(
          eq(AgentViewTable.agentId, agentId),
          sql`${AgentViewTable.viewedAt} >= ${since}`,
        ),
      )
      .groupBy(sql`date_trunc('day', ${AgentViewTable.viewedAt})`)
      .orderBy(sql`date_trunc('day', ${AgentViewTable.viewedAt})`);

    // Backfill missing days with count 0 so the UI can render a
    // contiguous sparkline.
    const byDay = new Map(rows.map((r) => [r.day, r.count]));
    const out: Array<{ day: string; count: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      out.push({ day: key, count: byDay.get(key) ?? 0 });
    }
    return out;
  },
};
