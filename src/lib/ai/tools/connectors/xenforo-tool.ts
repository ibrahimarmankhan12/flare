import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getTokenProviderToken } from "lib/connectors/credentials";

const inputSchema = z.object({
  action: z.enum(["list_forums", "list_threads", "get_thread", "list_posts"]),
  forumId: z.union([z.string(), z.number()]).optional(),
  threadId: z.union([z.string(), z.number()]).optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface XenforoToolInput {
  action: "list_forums" | "list_threads" | "get_thread" | "list_posts";
  forumId?: string | number;
  threadId?: string | number;
  limit?: number;
}

function getBaseUrl(): string {
  return process.env.XENFORO_BASE_URL?.replace(/\/+$/, "") || "";
}

async function getAuthHeader(): Promise<string | null> {
  const token = getTokenProviderToken("xenforo");
  return token ? `Bearer ${token}` : null;
}

async function getIsConnected(userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "xenforo"),
      ),
    )
    .limit(1);
  return rows.length > 0 && rows[0].isConnected;
}

export function createXenforoToolForUser(userId: string): Tool {
  return createTool({
    description: `XenForo integration tool (server-token).

Actions:
- list_forums: List forums.
- list_threads: List threads in a forum (requires: forumId).
- get_thread: Read a thread (requires: threadId).
- list_posts: List posts in a thread (requires: threadId).`,
    inputSchema,
    execute: async (input: XenforoToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const base = getBaseUrl();
        const auth = await getAuthHeader();
        if (!base || !auth) {
          return { error: "XenForo is not configured. Set XENFORO_BASE_URL, XENFORO_API_KEY." };
        }
        if (!(await getIsConnected(userId))) {
          return { error: "XenForo is not connected. Click Connect to enable (single-tenant)." };
        }
        const headers = { Authorization: auth, Accept: "application/json" };

        if (action === "list_forums") {
          const res = await fetch(`${base}/api/forums`, { headers });
          return await res.json();
        }
        if (action === "list_threads") {
          if (!input.forumId) return { error: "forumId required" };
          const res = await fetch(
            `${base}/api/forums/${input.forumId}/threads?page_size=${limit}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "get_thread") {
          if (!input.threadId) return { error: "threadId required" };
          const res = await fetch(`${base}/api/threads/${input.threadId}`, { headers });
          return await res.json();
        }
        if (action === "list_posts") {
          if (!input.threadId) return { error: "threadId required" };
          const res = await fetch(
            `${base}/api/threads/${input.threadId}/posts?page_size=${limit}`,
            { headers },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("XenForo tool error:", error);
        return {
          error: error instanceof Error ? error.message : "XenForo operation failed.",
        };
      }
    },
  });
}

export const xenforoTool = createTool({
  description: "XenForo tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "XenForo tool requires user context." }),
});
