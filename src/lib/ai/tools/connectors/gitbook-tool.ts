import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getTokenProviderToken } from "lib/connectors/credentials";

const inputSchema = z.object({
  action: z.enum(["list_spaces", "list_pages", "get_page"]),
  spaceId: z.string().optional(),
  pageId: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface GitbookToolInput {
  action: "list_spaces" | "list_pages" | "get_page";
  spaceId?: string;
  pageId?: string;
  limit?: number;
}

const GITBOOK_API = "https://api.gitbook.com/v1";

async function getAuthHeader(): Promise<string | null> {
  const token = getTokenProviderToken("gitbook");
  return token ? `Bearer ${token}` : null;
}

async function getIsConnected(userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "gitbook"),
      ),
    )
    .limit(1);
  return rows.length > 0 && rows[0].isConnected;
}

export function createGitbookToolForUser(userId: string): Tool {
  return createTool({
    description: `GitBook integration tool (server-token).

Actions:
- list_spaces: List spaces.
- list_pages: List pages in a space (requires: spaceId).
- get_page: Read a page (requires: pageId).

Configured via GITBOOK_API_TOKEN env var.`,
    inputSchema,
    execute: async (input: GitbookToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const auth = await getAuthHeader();
        if (!auth) return { error: "GitBook is not configured (GITBOOK_API_TOKEN)." };
        if (!(await getIsConnected(userId))) {
          return { error: "GitBook is not connected. Click Connect to enable (single-tenant)." };
        }
        const headers = { Authorization: auth };

        if (action === "list_spaces") {
          const res = await fetch(`${GITBOOK_API}/spaces?limit=${limit}`, { headers });
          return await res.json();
        }
        if (action === "list_pages") {
          if (!input.spaceId) return { error: "spaceId required" };
          const res = await fetch(
            `${GITBOOK_API}/spaces/${input.spaceId}/pages?limit=${limit}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "get_page") {
          if (!input.pageId) return { error: "pageId required" };
          const res = await fetch(`${GITBOOK_API}/pages/${input.pageId}`, { headers });
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("GitBook tool error:", error);
        return {
          error: error instanceof Error ? error.message : "GitBook operation failed.",
        };
      }
    },
  });
}

export const gitbookTool = createTool({
  description: "GitBook tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "GitBook tool requires user context." }),
});
