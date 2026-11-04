import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getTokenProviderToken } from "lib/connectors/credentials";

const inputSchema = z.object({
  action: z.enum(["list_answer_entries", "get_entry", "search"]),
  entryId: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface LoopioToolInput {
  action: "list_answer_entries" | "get_entry" | "search";
  entryId?: string;
  query?: string;
  limit?: number;
}

const LOOPIO_API = "https://api.loopio.com/v1";

async function getAuthHeader(): Promise<string | null> {
  const token = getTokenProviderToken("loopio");
  return token ? `Bearer ${token}` : null;
}

async function getIsConnected(userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "loopio"),
      ),
    )
    .limit(1);
  return rows.length > 0 && rows[0].isConnected;
}

export function createLoopioToolForUser(userId: string): Tool {
  return createTool({
    description: `Loopio integration tool (server-token).

Actions:
- list_answer_entries: List answer entries.
- get_entry: Read an answer entry (requires: entryId).
- search: Search answer entries by query.`,
    inputSchema,
    execute: async (input: LoopioToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const auth = await getAuthHeader();
        if (!auth) return { error: "Loopio is not configured (LOOPIO_API_TOKEN)." };
        if (!(await getIsConnected(userId))) {
          return { error: "Loopio is not connected. Click Connect to enable (single-tenant)." };
        }
        const headers = { Authorization: auth, "Content-Type": "application/json" };

        if (action === "list_answer_entries") {
          const res = await fetch(
            `${LOOPIO_API}/answer-entries?pageSize=${limit}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "get_entry") {
          if (!input.entryId) return { error: "entryId required" };
          const res = await fetch(`${LOOPIO_API}/answer-entries/${input.entryId}`, { headers });
          return await res.json();
        }
        if (action === "search") {
          if (!input.query) return { error: "query required" };
          const res = await fetch(`${LOOPIO_API}/answer-entries/search`, {
            method: "POST",
            headers,
            body: JSON.stringify({ query: input.query, pageSize: limit }),
          });
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Loopio tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Loopio operation failed.",
        };
      }
    },
  });
}

export const loopioTool = createTool({
  description: "Loopio tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Loopio tool requires user context." }),
});
