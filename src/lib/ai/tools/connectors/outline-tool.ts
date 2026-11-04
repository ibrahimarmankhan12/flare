import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_collections", "list_documents", "get_document", "search"]),
  collectionId: z.string().optional(),
  documentId: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface OutlineToolInput {
  action: "list_collections" | "list_documents" | "get_document" | "search";
  collectionId?: string;
  documentId?: string;
  query?: string;
  limit?: number;
}

function getBaseUrl(): string {
  return process.env.OUTLINE_BASE_URL?.replace(/\/+$/, "") || "https://app.getoutline.com";
}

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "outline"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("outline", rows[0]);
}

export function createOutlineToolForUser(userId: string): Tool {
  return createTool({
    description: `Outline integration tool.

Actions:
- list_collections: List collections.
- list_documents: List documents in a collection (requires: collectionId).
- get_document: Read a document (requires: documentId).
- search: Search documents by query.`,
    inputSchema,
    execute: async (input: OutlineToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) return { error: "Outline is not connected." };
        const headers = {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        };
        const post = async (body: any) => {
          const res = await fetch(`${getBaseUrl()}/api/`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          });
          if (!res.ok) return { error: `Outline API error: ${res.status}` };
          return await res.json();
        };

        if (action === "list_collections") {
          return await post({ method: "collections.list", limit });
        }
        if (action === "list_documents") {
          if (!input.collectionId) return { error: "collectionId required" };
          return await post({
            method: "documents.list",
            collection: input.collectionId,
            limit,
          });
        }
        if (action === "get_document") {
          if (!input.documentId) return { error: "documentId required" };
          return await post({ method: "documents.info", id: input.documentId });
        }
        if (action === "search") {
          if (!input.query) return { error: "query required" };
          return await post({
            method: "documents.search",
            query: input.query,
            limit,
          });
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Outline tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Outline operation failed.",
        };
      }
    },
  });
}

export const outlineTool = createTool({
  description: "Outline tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Outline tool requires user context." }),
});
