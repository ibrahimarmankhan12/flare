import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_spaces", "list_lists", "list_tasks", "get_task", "create_task"]),
  spaceId: z.string().optional(),
  listId: z.string().optional(),
  taskId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface ClickUpToolInput {
  action: "list_spaces" | "list_lists" | "list_tasks" | "get_task" | "create_task";
  spaceId?: string;
  listId?: string;
  taskId?: string;
  name?: string;
  description?: string;
  status?: string;
  limit?: number;
}

const CLICKUP_API = "https://api.clickup.com/api/v2";

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "clickup"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("clickup", rows[0]);
}

export function createClickUpToolForUser(userId: string): Tool {
  return createTool({
    description: `ClickUp integration tool.

Actions:
- list_spaces: List accessible ClickUp spaces.
- list_lists: List lists in a space (requires: spaceId).
- list_tasks: List tasks in a list (requires: listId, optional: status).
- get_task: Read a task (requires: taskId).
- create_task: Create a task (requires: listId, name).`,
    inputSchema,
    execute: async (input: ClickUpToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) {
          return { error: "ClickUp is not connected. Please connect via the Connectors menu." };
        }
        const headers = {
          Authorization: accessToken,
          "Content-Type": "application/json",
        };
        if (action === "list_spaces") {
          // Need a team/workspace ID first; ClickUp API requires a team.
          const teamsRes = await fetch(`${CLICKUP_API}/team`, { headers });
          const teamsData = (await teamsRes.json()) as { teams?: any[] };
          const teamId = teamsData.teams?.[0]?.id;
          if (!teamId) return { spaces: [] };
          const res = await fetch(
            `${CLICKUP_API}/team/${teamId}/space?archived=false`,
            { headers },
          );
          const data = (await res.json()) as { spaces?: any[] };
          return { spaces: (data.spaces || []).slice(0, limit) };
        }
        if (action === "list_lists") {
          if (!input.spaceId) return { error: "spaceId required" };
          const res = await fetch(
            `${CLICKUP_API}/space/${input.spaceId}/list?archived=false`,
            { headers },
          );
          const data = (await res.json()) as { lists?: any[] };
          return { lists: (data.lists || []).slice(0, limit) };
        }
        if (action === "list_tasks") {
          if (!input.listId) return { error: "listId required" };
          const statusFilter = input.status
            ? `&statuses[]=${encodeURIComponent(input.status)}`
            : "";
          const res = await fetch(
            `${CLICKUP_API}/list/${input.listId}/task?archived=false${statusFilter}`,
            { headers },
          );
          const data = (await res.json()) as { tasks?: any[] };
          return { tasks: (data.tasks || []).slice(0, limit) };
        }
        if (action === "get_task") {
          if (!input.taskId) return { error: "taskId required" };
          const res = await fetch(`${CLICKUP_API}/task/${input.taskId}`, { headers });
          return await res.json();
        }
        if (action === "create_task") {
          if (!input.listId || !input.name) {
            return { error: "listId and name required" };
          }
          const res = await fetch(`${CLICKUP_API}/list/${input.listId}/task`, {
            method: "POST",
            headers,
            body: JSON.stringify({ name: input.name, description: input.description }),
          });
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("ClickUp tool error:", error);
        return {
          error: error instanceof Error ? error.message : "ClickUp operation failed.",
        };
      }
    },
  });
}

export const clickupTool = createTool({
  description: "ClickUp tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "ClickUp tool requires user context." }),
});
