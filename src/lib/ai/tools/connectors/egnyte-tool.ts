import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_folder", "get_file", "search"]),
  path: z.string().default("/").describe("Folder path (default root)"),
  fileId: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface EgnyteToolInput {
  action: "list_folder" | "get_file" | "search";
  path?: string;
  fileId?: string;
  query?: string;
  limit?: number;
}

function getBaseUrl(): string {
  return process.env.EGNYTE_DOMAIN?.replace(/\/+$/, "") || "";
}

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "egnyte"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("egnyte", rows[0]);
}

export function createEgnyteToolForUser(userId: string): Tool {
  return createTool({
    description: `Egnyte integration tool.

Actions:
- list_folder: List files in a folder (optional: path).
- get_file: Read a file (requires: fileId or path).
- search: Search files by query.`,
    inputSchema,
    execute: async (input: EgnyteToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const base = getBaseUrl();
        if (!base) return { error: "Egnyte is not configured (EGNYTE_DOMAIN missing)." };
        const accessToken = await getAccessToken(userId);
        if (!accessToken) return { error: "Egnyte is not connected." };
        const headers = { Authorization: `Bearer ${accessToken}` };

        if (action === "list_folder") {
          const res = await fetch(
            `${base}/api/v1/fs${input.path || "/"}?limit=${limit}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "get_file") {
          if (!input.path) return { error: "path required" };
          const res = await fetch(
            `${base}/api/v1/fs${input.path}?list=false`,
            { headers },
          );
          return await res.json();
        }
        if (action === "search") {
          if (!input.query) return { error: "query required" };
          const res = await fetch(
            `${base}/api/v1/search?query=${encodeURIComponent(input.query)}&limit=${limit}`,
            { headers },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Egnyte tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Egnyte operation failed.",
        };
      }
    },
  });
}

export const egnyteTool = createTool({
  description: "Egnyte tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Egnyte tool requires user context." }),
});
