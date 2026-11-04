import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getTokenProviderToken } from "lib/connectors/credentials";

const inputSchema = z.object({
  action: z.enum(["list_spaces", "list_content", "get_content", "search"]),
  spaceId: z.union([z.string(), z.number()]).optional(),
  contentId: z.union([z.string(), z.number()]).optional(),
  query: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface AxeroToolInput {
  action: "list_spaces" | "list_content" | "get_content" | "search";
  spaceId?: string | number;
  contentId?: string | number;
  query?: string;
  limit?: number;
}

function getBaseUrl(): string {
  return process.env.AXERO_BASE_URL?.replace(/\/+$/, "") || "";
}

async function getAuthHeader(): Promise<string | null> {
  const token = getTokenProviderToken("axero");
  return token ? `Bearer ${token}` : null;
}

async function getIsConnected(userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "axero"),
      ),
    )
    .limit(1);
  return rows.length > 0 && rows[0].isConnected;
}

export function createAxeroToolForUser(userId: string): Tool {
  return createTool({
    description: `Axero integration tool (server-token).

Actions:
- list_spaces: List spaces.
- list_content: List content in a space (requires: spaceId).
- get_content: Read content (requires: contentId).
- search: Search by query.`,
    inputSchema,
    execute: async (input: AxeroToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const base = getBaseUrl();
        const auth = await getAuthHeader();
        if (!base || !auth) {
          return { error: "Axero is not configured. Set AXERO_BASE_URL, AXERO_API_TOKEN." };
        }
        if (!(await getIsConnected(userId))) {
          return { error: "Axero is not connected. Click Connect to enable (single-tenant)." };
        }
        const headers = { Authorization: auth, "Content-Type": "application/json" };

        if (action === "list_spaces") {
          const res = await fetch(`${base}/api/v3/spaces?limit=${limit}`, { headers });
          return await res.json();
        }
        if (action === "list_content") {
          if (!input.spaceId) return { error: "spaceId required" };
          const res = await fetch(
            `${base}/api/v3/spaces/${input.spaceId}/content?limit=${limit}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "get_content") {
          if (!input.contentId) return { error: "contentId required" };
          const res = await fetch(`${base}/api/v3/content/${input.contentId}`, { headers });
          return await res.json();
        }
        if (action === "search") {
          if (!input.query) return { error: "query required" };
          const res = await fetch(
            `${base}/api/v3/search?q=${encodeURIComponent(input.query)}&limit=${limit}`,
            { headers },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Axero tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Axero operation failed.",
        };
      }
    },
  });
}

export const axeroTool = createTool({
  description: "Axero tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Axero tool requires user context." }),
});
