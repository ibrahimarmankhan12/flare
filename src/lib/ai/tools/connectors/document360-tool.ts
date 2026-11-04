import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getTokenProviderToken } from "lib/connectors/credentials";

const inputSchema = z.object({
  action: z.enum(["list_categories", "list_articles", "get_article", "search"]),
  categoryId: z.string().optional(),
  articleId: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface Document360ToolInput {
  action: "list_categories" | "list_articles" | "get_article" | "search";
  categoryId?: string;
  articleId?: string;
  query?: string;
  limit?: number;
}

function getBaseUrl(): string {
  return process.env.DOCUMENT360_BASE_URL?.replace(/\/+$/, "") || "https://api.document360.com";
}

async function getAuthHeader(): Promise<string | null> {
  const token = getTokenProviderToken("document360");
  return token ? `Bearer ${token}` : null;
}

async function getIsConnected(userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "document360"),
      ),
    )
    .limit(1);
  return rows.length > 0 && rows[0].isConnected;
}

export function createDocument360ToolForUser(userId: string): Tool {
  return createTool({
    description: `Document360 integration tool (server-token).

Actions:
- list_categories: List categories.
- list_articles: List articles in a category (requires: categoryId).
- get_article: Read an article (requires: articleId).
- search: Search articles by query.`,
    inputSchema,
    execute: async (input: Document360ToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const auth = await getAuthHeader();
        if (!auth) {
          return { error: "Document360 is not configured (DOCUMENT360_API_TOKEN)." };
        }
        if (!(await getIsConnected(userId))) {
          return { error: "Document360 is not connected. Click Connect to enable it." };
        }
        const headers = { Authorization: auth };
        if (action === "list_categories") {
          const res = await fetch(`${getBaseUrl()}/v1/categories`, { headers });
          return await res.json();
        }
        if (action === "list_articles") {
          if (!input.categoryId) return { error: "categoryId required" };
          const res = await fetch(
            `${getBaseUrl()}/v1/categories/${input.categoryId}/articles?limit=${limit}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "get_article") {
          if (!input.articleId) return { error: "articleId required" };
          const res = await fetch(`${getBaseUrl()}/v1/articles/${input.articleId}`, { headers });
          return await res.json();
        }
        if (action === "search") {
          if (!input.query) return { error: "query required" };
          const res = await fetch(
            `${getBaseUrl()}/v1/articles/search?q=${encodeURIComponent(input.query)}&limit=${limit}`,
            { headers },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Document360 tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Document360 operation failed.",
        };
      }
    },
  });
}

export const document360Tool = createTool({
  description: "Document360 tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Document360 tool requires user context." }),
});
