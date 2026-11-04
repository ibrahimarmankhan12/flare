import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_topics", "list_posts", "get_post", "search"]),
  topicId: z.string().optional(),
  postId: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface SlabToolInput {
  action: "list_topics" | "list_posts" | "get_post" | "search";
  topicId?: string;
  postId?: string;
  query?: string;
  limit?: number;
}

const SLAB_API = "https://api.slab.com/v1";

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "slab"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("slab", rows[0]);
}

export function createSlabToolForUser(userId: string): Tool {
  return createTool({
    description: `Slab integration tool.

Actions:
- list_topics: List topics.
- list_posts: List posts in a topic (requires: topicId).
- get_post: Read a post (requires: postId).
- search: Search posts by query.`,
    inputSchema,
    execute: async (input: SlabToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) return { error: "Slab is not connected." };
        const headers = { Authorization: `Bearer ${accessToken}` };

        if (action === "list_topics") {
          const res = await fetch(`${SLAB_API}/topics?limit=${limit}`, { headers });
          return await res.json();
        }
        if (action === "list_posts") {
          if (!input.topicId) return { error: "topicId required" };
          const res = await fetch(
            `${SLAB_API}/topics/${input.topicId}/posts?limit=${limit}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "get_post") {
          if (!input.postId) return { error: "postId required" };
          const res = await fetch(`${SLAB_API}/posts/${input.postId}`, { headers });
          return await res.json();
        }
        if (action === "search") {
          if (!input.query) return { error: "query required" };
          const res = await fetch(
            `${SLAB_API}/search?query=${encodeURIComponent(input.query)}&limit=${limit}`,
            { headers },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Slab tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Slab operation failed.",
        };
      }
    },
  });
}

export const slabTool = createTool({
  description: "Slab tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Slab tool requires user context." }),
});
