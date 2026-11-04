import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_spots", "list_items", "get_item", "search"]),
  spotId: z.string().optional(),
  itemId: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface HighspotToolInput {
  action: "list_spots" | "list_items" | "get_item" | "search";
  spotId?: string;
  itemId?: string;
  query?: string;
  limit?: number;
}

const HIGHSPOT_API = "https://api.highspot.com/v1.0";

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "highspot"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("highspot", rows[0]);
}

export function createHighspotToolForUser(userId: string): Tool {
  return createTool({
    description: `Highspot integration tool.

Actions:
- list_spots: List spots.
- list_items: List items in a spot (requires: spotId).
- get_item: Read an item (requires: itemId).
- search: Search items by query.`,
    inputSchema,
    execute: async (input: HighspotToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) return { error: "Highspot is not connected." };
        const headers = { Authorization: `Bearer ${accessToken}` };

        if (action === "list_spots") {
          const res = await fetch(`${HIGHSPOT_API}/spots`, { headers });
          return await res.json();
        }
        if (action === "list_items") {
          if (!input.spotId) return { error: "spotId required" };
          const res = await fetch(
            `${HIGHSPOT_API}/spots/${input.spotId}/items?limit=${limit}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "get_item") {
          if (!input.itemId) return { error: "itemId required" };
          const res = await fetch(`${HIGHSPOT_API}/items/${input.itemId}`, { headers });
          return await res.json();
        }
        if (action === "search") {
          if (!input.query) return { error: "query required" };
          const res = await fetch(
            `${HIGHSPOT_API}/search?q=${encodeURIComponent(input.query)}&limit=${limit}`,
            { headers },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Highspot tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Highspot operation failed.",
        };
      }
    },
  });
}

export const highspotTool = createTool({
  description: "Highspot tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Highspot tool requires user context." }),
});
