import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getTokenProviderToken } from "lib/connectors/credentials";

const inputSchema = z.object({
  action: z.enum(["list_nodes", "get_node", "search"]),
  nodeType: z.string().optional().describe("Drupal content type filter (e.g. article, page)"),
  nodeId: z.union([z.string(), z.number()]).optional(),
  query: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface DrupalWikiToolInput {
  action: "list_nodes" | "get_node" | "search";
  nodeType?: string;
  nodeId?: string | number;
  query?: string;
  limit?: number;
}

function getBaseUrl(): string {
  return process.env.DRUPAL_WIKI_BASE_URL?.replace(/\/+$/, "") || "";
}

async function getAuthHeader(): Promise<string | null> {
  const token = getTokenProviderToken("drupal-wiki");
  return token ? `Bearer ${token}` : null;
}

async function getIsConnected(userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "drupal-wiki"),
      ),
    )
    .limit(1);
  return rows.length > 0 && rows[0].isConnected;
}

export function createDrupalWikiToolForUser(userId: string): Tool {
  return createTool({
    description: `Drupal Wiki integration tool (server-token).

Actions:
- list_nodes: List nodes (optional: nodeType filter).
- get_node: Read a node (requires: nodeId).
- search: Search by query.`,
    inputSchema,
    execute: async (input: DrupalWikiToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const base = getBaseUrl();
        const auth = await getAuthHeader();
        if (!base || !auth) {
          return {
            error:
              "Drupal Wiki is not configured. Set DRUPAL_WIKI_BASE_URL, DRUPAL_WIKI_API_TOKEN.",
          };
        }
        if (!(await getIsConnected(userId))) {
          return { error: "Drupal Wiki is not connected. Click Connect to enable (single-tenant)." };
        }
        const headers = {
          Authorization: auth,
          Accept: "application/json",
          "Content-Type": "application/json",
        };

        if (action === "list_nodes") {
          const params = new URLSearchParams({ "page[limit]": String(limit) });
          if (input.nodeType) params.set("filter[type][value]", input.nodeType);
          const res = await fetch(
            `${base}/jsonapi/node/${input.nodeType || "article"}?${params}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "get_node") {
          if (!input.nodeId) return { error: "nodeId required" };
          const res = await fetch(
            `${base}/jsonapi/node/article/${input.nodeId}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "search") {
          if (!input.query) return { error: "query required" };
          const res = await fetch(
            `${base}/search-api?query=${encodeURIComponent(input.query)}&limit=${limit}`,
            { headers },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Drupal Wiki tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Drupal Wiki operation failed.",
        };
      }
    },
  });
}

export const drupalWikiTool = createTool({
  description: "Drupal Wiki tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Drupal Wiki tool requires user context." }),
});
