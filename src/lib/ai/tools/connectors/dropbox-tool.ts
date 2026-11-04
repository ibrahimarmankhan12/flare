import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_folder", "get_file", "search"]),
  path: z.string().default("").describe("Dropbox path (empty = root)"),
  fileId: z.string().optional().describe("File ID (for get_file)"),
  query: z.string().optional().describe("Search query (for search)"),
  recursive: z.boolean().optional().default(false),
  limit: z.number().min(1).max(100).optional(),
});

interface DropboxToolInput {
  action: "list_folder" | "get_file" | "search";
  path?: string;
  fileId?: string;
  query?: string;
  recursive?: boolean;
  limit?: number;
}

const DROPBOX_API = "https://api.dropboxapi.com/2";

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "dropbox"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("dropbox", rows[0]);
}

export function createDropboxToolForUser(userId: string): Tool {
  return createTool({
    description: `Dropbox integration tool.

Actions:
- list_folder: List files in a folder (optional: path, recursive).
- get_file: Read a file (requires: fileId, or path).
- search: Search files by query.`,
    inputSchema,
    execute: async (input: DropboxToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) return { error: "Dropbox is not connected." };
        const headers = {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        };
        if (action === "list_folder") {
          const res = await fetch(`${DROPBOX_API}/files/list_folder`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              path: input.path || "",
              recursive: input.recursive ?? false,
              limit,
            }),
          });
          return await res.json();
        }
        if (action === "get_file") {
          if (!input.path) return { error: "path required" };
          const res = await fetch(`${DROPBOX_API}/files/get_metadata`, {
            method: "POST",
            headers,
            body: JSON.stringify({ path: input.path }),
          });
          return await res.json();
        }
        if (action === "search") {
          if (!input.query) return { error: "query required" };
          const res = await fetch(`${DROPBOX_API}/files/search_v2`, {
            method: "POST",
            headers,
            body: JSON.stringify({ query: input.query, options: { max_results: limit } }),
          });
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Dropbox tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Dropbox operation failed.",
        };
      }
    },
  });
}

export const dropboxTool = createTool({
  description: "Dropbox tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Dropbox tool requires user context." }),
});
