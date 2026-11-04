import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_contacts", "list_deals", "get_contact", "get_deal"]),
  contactId: z.string().optional(),
  dealId: z.string().optional(),
  stage: z.string().optional().describe("Filter deals by dealstage"),
  limit: z.number().min(1).max(100).optional(),
});

interface HubSpotToolInput {
  action: "list_contacts" | "list_deals" | "get_contact" | "get_deal";
  contactId?: string;
  dealId?: string;
  stage?: string;
  limit?: number;
}

const HUBSPOT_API = "https://api.hubapi.com";

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "hubspot"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("hubspot", rows[0]);
}

export function createHubSpotToolForUser(userId: string): Tool {
  return createTool({
    description: `HubSpot integration tool.

Actions:
- list_contacts: List contacts.
- list_deals: List deals (optional: stage).
- get_contact: Read a contact (requires: contactId).
- get_deal: Read a deal (requires: dealId).`,
    inputSchema,
    execute: async (input: HubSpotToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) return { error: "HubSpot is not connected." };
        const headers = {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        };
        if (action === "list_contacts") {
          const res = await fetch(
            `${HUBSPOT_API}/crm/v3/objects/contacts?limit=${limit}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "list_deals") {
          const url = input.stage
            ? `${HUBSPOT_API}/crm/v3/objects/deals/search`
            : `${HUBSPOT_API}/crm/v3/objects/deals?limit=${limit}`;
          if (input.stage) {
            const res = await fetch(url, {
              method: "POST",
              headers,
              body: JSON.stringify({
                filterGroups: [
                  {
                    filters: [
                      { propertyName: "dealstage", operator: "EQ", value: input.stage },
                    ],
                  },
                ],
                limit,
              }),
            });
            return await res.json();
          }
          const res = await fetch(url, { headers });
          return await res.json();
        }
        if (action === "get_contact") {
          if (!input.contactId) return { error: "contactId required" };
          const res = await fetch(
            `${HUBSPOT_API}/crm/v3/objects/contacts/${input.contactId}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "get_deal") {
          if (!input.dealId) return { error: "dealId required" };
          const res = await fetch(
            `${HUBSPOT_API}/crm/v3/objects/deals/${input.dealId}`,
            { headers },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("HubSpot tool error:", error);
        return {
          error: error instanceof Error ? error.message : "HubSpot operation failed.",
        };
      }
    },
  });
}

export const hubspotTool = createTool({
  description: "HubSpot tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "HubSpot tool requires user context." }),
});
