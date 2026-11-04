import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_accounts", "list_opportunities", "get_account", "search", "soql"]),
  objectType: z.string().default("Account").describe("SObject type (Account, Opportunity, Lead, Contact, etc.)"),
  accountId: z.string().optional(),
  query: z.string().optional().describe("SOQL query string (for soql action)"),
  searchTerm: z.string().optional().describe("Search term (for search action)"),
  stage: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface SalesforceToolInput {
  action: "list_accounts" | "list_opportunities" | "get_account" | "search" | "soql";
  objectType?: string;
  accountId?: string;
  query?: string;
  searchTerm?: string;
  stage?: string;
  limit?: number;
}

function getInstanceUrl(metadata: any): string | null {
  return (metadata?.instance_url as string) || process.env.SALESFORCE_LOGIN_URL || null;
}

async function getAccessToken(userId: string) {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "salesforce"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  const token = await refreshConnectorToken("salesforce", rows[0]);
  if (!token) return null;
  return {
    token,
    instanceUrl: getInstanceUrl(rows[0].metadata),
  };
}

export function createSalesforceToolForUser(userId: string): Tool {
  return createTool({
    description: `Salesforce integration tool.

Actions:
- list_accounts: List Account records.
- list_opportunities: List Opportunity records (optional: stage).
- get_account: Read a single Account (requires: accountId).
- search: SOSL search across an object type (requires: searchTerm, objectType).
- soql: Run a custom SOQL query (requires: query).`,
    inputSchema,
    execute: async (input: SalesforceToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const creds = await getAccessToken(userId);
        if (!creds) return { error: "Salesforce is not connected." };
        if (!creds.instanceUrl) {
          return { error: "Salesforce instance URL not yet linked. Reconnect." };
        }
        const headers = {
          Authorization: `Bearer ${creds.token}`,
          "Content-Type": "application/json",
        };

        if (action === "list_accounts") {
          const res = await fetch(
            `${creds.instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(`SELECT Id, Name FROM Account ORDER BY Name LIMIT ${limit}`)}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "list_opportunities") {
          const where = input.stage
            ? `WHERE StageName = '${input.stage.replace(/'/g, "\\'")}' `
            : "";
          const res = await fetch(
            `${creds.instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(
              `SELECT Id, Name, StageName, Amount FROM Opportunity ${where}LIMIT ${limit}`,
            )}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "get_account") {
          if (!input.accountId) return { error: "accountId required" };
          const res = await fetch(
            `${creds.instanceUrl}/services/data/v59.0/sobjects/Account/${input.accountId}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "search") {
          if (!input.searchTerm || !input.objectType) {
            return { error: "searchTerm and objectType required" };
          }
          const res = await fetch(
            `${creds.instanceUrl}/services/data/v59.0/search?q=${encodeURIComponent(
              `FIND {${input.searchTerm}} IN ALL FIELDS RETURNING ${input.objectType}(Id, Name)`,
            )}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "soql") {
          if (!input.query) return { error: "query required" };
          const res = await fetch(
            `${creds.instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(input.query)}`,
            { headers },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Salesforce tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Salesforce operation failed.",
        };
      }
    },
  });
}

export const salesforceTool = createTool({
  description: "Salesforce tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Salesforce tool requires user context." }),
});
