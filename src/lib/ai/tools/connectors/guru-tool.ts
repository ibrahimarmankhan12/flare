import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_collections", "get_card", "search"]),
  collectionId: z.string().optional(),
  cardId: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface GuruToolInput {
  action: "list_collections" | "get_card" | "search";
  collectionId?: string;
  cardId?: string;
  query?: string;
  limit?: number;
}

const GURU_API = "https://api.getguru.com/api/v1";

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "guru"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("guru", rows[0]);
}

export function createGuruToolForUser(userId: string): Tool {
  return createTool({
    description: `Guru integration tool.

Actions:
- list_collections: List collections.
- get_card: Read a card (requires: cardId).
- search: Search cards by query.`,
    inputSchema,
    execute: async (input: GuruToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) return { error: "Guru is not connected." };
        const headers = { Authorization: `Bearer ${accessToken}` };

        if (action === "list_collections") {
          const res = await fetch(`${GURU_API}/collections`, { headers });
          const data = (await res.json()) as any[];
          return { collections: (data || []).slice(0, limit) };
        }
        if (action === "get_card") {
          if (!input.cardId) return { error: "cardId required" };
          const res = await fetch(`${GURU_API}/cards/${input.cardId}`, { headers });
          return await res.json();
        }
        if (action === "search") {
          if (!input.query) return { error: "query required" };
          const res = await fetch(
            `${GURU_API}/search?query=${encodeURIComponent(input.query)}&maxResults=${limit}`,
            { headers },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Guru tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Guru operation failed.",
        };
      }
    },
  });
}

export const guruTool = createTool({
  description: "Guru tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Guru tool requires user context." }),
});
