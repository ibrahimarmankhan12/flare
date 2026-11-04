import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_docs", "list_tables", "list_rows", "get_row"]),
  docId: z.string().optional().describe("Coda doc ID"),
  tableId: z.string().optional().describe("Coda table ID"),
  rowId: z.string().optional().describe("Coda row ID"),
  query: z.string().optional().describe("Optional filter (e.g. search)"),
  limit: z.number().min(1).max(100).optional(),
});

interface CodaToolInput {
  action: "list_docs" | "list_tables" | "list_rows" | "get_row";
  docId?: string;
  tableId?: string;
  rowId?: string;
  query?: string;
  limit?: number;
}

const CODA_API = "https://coda.io/apis/v1";

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "coda"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("coda", rows[0]);
}

export function createCodaToolForUser(userId: string): Tool {
  return createTool({
    description: `Coda integration tool.

Actions:
- list_docs: List accessible Coda docs.
- list_tables: List tables in a doc (requires: docId).
- list_rows: List rows in a table (requires: docId, tableId, optional: query).
- get_row: Read a single row (requires: docId, tableId, rowId).`,
    inputSchema,
    execute: async (input: CodaToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) return { error: "Coda is not connected." };
        const headers = { Authorization: `Bearer ${accessToken}` };

        if (action === "list_docs") {
          const res = await fetch(`${CODA_API}/docs?limit=${limit}`, { headers });
          const data = (await res.json()) as { items?: any[] };
          return { docs: data.items || [] };
        }
        if (action === "list_tables") {
          if (!input.docId) return { error: "docId required" };
          const res = await fetch(
            `${CODA_API}/docs/${input.docId}/tables?limit=${limit}`,
            { headers },
          );
          const data = (await res.json()) as { items?: any[] };
          return { tables: data.items || [] };
        }
        if (action === "list_rows") {
          if (!input.docId || !input.tableId) {
            return { error: "docId and tableId required" };
          }
          const q = input.query
            ? `&query=${encodeURIComponent(input.query)}`
            : "";
          const res = await fetch(
            `${CODA_API}/docs/${input.docId}/tables/${input.tableId}/rows?limit=${limit}${q}`,
            { headers },
          );
          const data = (await res.json()) as { items?: any[] };
          return { rows: data.items || [] };
        }
        if (action === "get_row") {
          if (!input.docId || !input.tableId || !input.rowId) {
            return { error: "docId, tableId, rowId required" };
          }
          const res = await fetch(
            `${CODA_API}/docs/${input.docId}/rows/${input.rowId}?valueFormat=rich`,
            { headers },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Coda tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Coda operation failed.",
        };
      }
    },
  });
}

export const codaTool = createTool({
  description: "Coda tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Coda tool requires user context." }),
});
