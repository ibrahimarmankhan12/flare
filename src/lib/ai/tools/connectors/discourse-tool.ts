import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getTokenProviderToken } from "lib/connectors/credentials";

const inputSchema = z.object({
  action: z.enum(["list_categories", "list_topics", "get_topic", "list_posts", "search"]),
  categoryId: z.union([z.string(), z.number()]).optional(),
  topicId: z.union([z.string(), z.number()]).optional(),
  query: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface DiscourseToolInput {
  action: "list_categories" | "list_topics" | "get_topic" | "list_posts" | "search";
  categoryId?: string | number;
  topicId?: string | number;
  query?: string;
  limit?: number;
}

function getBaseUrl(): string {
  return process.env.DISCOURSE_BASE_URL?.replace(/\/+$/, "") || "";
}

async function getAuthHeader(): Promise<string | null> {
  const token = getTokenProviderToken("discourse");
  const user = process.env.DISCOURSE_API_USER?.trim();
  if (!token || !user) return null;
  return `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`;
}

async function getIsConnected(userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "discourse"),
      ),
    )
    .limit(1);
  return rows.length > 0 && rows[0].isConnected;
}

export function createDiscourseToolForUser(userId: string): Tool {
  return createTool({
    description: `Discourse integration tool (server-token).

Actions:
- list_categories: List categories.
- list_topics: List topics (optional: categoryId).
- get_topic: Read a topic (requires: topicId).
- list_posts: List posts in a topic (requires: topicId).
- search: Search by query.`,
    inputSchema,
    execute: async (input: DiscourseToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const base = getBaseUrl();
        const auth = await getAuthHeader();
        if (!base || !auth) {
          return {
            error:
              "Discourse is not configured. Set DISCOURSE_BASE_URL, DISCOURSE_API_TOKEN, DISCOURSE_API_USER.",
          };
        }
        if (!(await getIsConnected(userId))) {
          return { error: "Discourse is not connected. Click Connect to enable (single-tenant)." };
        }
        const headers = {
          Authorization: auth,
          "Content-Type": "application/json",
          Accept: "application/json",
        };

        if (action === "list_categories") {
          const res = await fetch(`${base}/categories.json`, { headers });
          return await res.json();
        }
        if (action === "list_topics") {
          const path = input.categoryId
            ? `/c/${input.categoryId}.json`
            : `/latest.json?limit=${limit}`;
          const res = await fetch(`${base}${path}`, { headers });
          return await res.json();
        }
        if (action === "get_topic") {
          if (!input.topicId) return { error: "topicId required" };
          const res = await fetch(`${base}/t/${input.topicId}.json`, { headers });
          return await res.json();
        }
        if (action === "list_posts") {
          if (!input.topicId) return { error: "topicId required" };
          const res = await fetch(
            `${base}/t/${input.topicId}/posts.json?limit=${limit}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "search") {
          if (!input.query) return { error: "query required" };
          const res = await fetch(
            `${base}/search.json?q=${encodeURIComponent(input.query)}&limit=${limit}`,
            { headers },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Discourse tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Discourse operation failed.",
        };
      }
    },
  });
}

export const discourseTool = createTool({
  description: "Discourse tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Discourse tool requires user context." }),
});
