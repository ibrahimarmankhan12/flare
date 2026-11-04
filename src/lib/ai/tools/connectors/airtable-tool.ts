import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_bases", "list_tables", "list_records", "get_record", "search"]),
  baseId: z.string().optional().describe("Airtable base ID"),
  tableId: z.string().optional().describe("Airtable table ID"),
  recordId: z.string().optional(),
  query: z.string().optional().describe("Search query (for search action)"),
  maxRecords: z.number().min(1).max(100).optional(),
});

interface AirtableToolInput {
  action: "list_bases" | "list_tables" | "list_records" | "get_record" | "search";
  baseId?: string;
  tableId?: string;
  recordId?: string;
  query?: string;
  maxRecords?: number;
}

const AIRTABLE_API = "https://api.airtable.com/v0";

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "airtable"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("airtable", rows[0]);
}

export function createAirtableToolForUser(userId: string): Tool {
  return createTool({
    description: `Airtable integration tool.

Actions:
- list_bases: List accessible bases.
- list_tables: List tables in a base (requires: baseId).
- list_records: List records in a table (requires: baseId, tableId).
- get_record: Read a single record (requires: baseId, tableId, recordId).
- search: Search records by query.`,
    inputSchema,
    execute: async (input: AirtableToolInput) => {
      try {
        const { action, maxRecords = 25 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) return { error: "Airtable is not connected." };
        const headers = { Authorization: `Bearer ${accessToken}` };
        if (action === "list_bases") {
          const res = await fetch(`${AIRTABLE_API}/meta/bases`, { headers });
          return await res.json();
        }
        if (action === "list_tables") {
          if (!input.baseId) return { error: "baseId required" };
          const res = await fetch(
            `${AIRTABLE_API}/meta/bases/${input.baseId}/tables`,
            { headers },
          );
          return await res.json();
        }
        if (action === "list_records") {
          if (!input.baseId || !input.tableId) {
            return { error: "baseId and tableId required" };
          }
          const res = await fetch(
            `${AIRTABLE_API}/${input.baseId}/${input.tableId}?maxRecords=${maxRecords}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "get_record") {
          if (!input.baseId || !input.tableId || !input.recordId) {
            return { error: "baseId, tableId, recordId required" };
          }
          const res = await fetch(
            `${AIRTABLE_API}/${input.baseId}/${input.tableId}/${input.recordId}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "search") {
          if (!input.baseId || !input.tableId || !input.query) {
            return { error: "baseId, tableId, query required" };
          }
          const res = await fetch(`${AIRTABLE_API}/search`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              searchTerm: input.query,
              tableId: input.tableId,
              baseId: input.baseId,
              maxRecords,
            }),
          });
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Airtable tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Airtable operation failed.",
        };
      }
    },
  });
}

export const airtableTool = createTool({
  description: "Airtable tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Airtable tool requires user context." }),
});
