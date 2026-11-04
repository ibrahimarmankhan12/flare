import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["inbox", "read"]),
  messageId: z
    .string()
    .optional()
    .describe("The Outlook message ID (for read action)"),
  top: z
    .number()
    .min(1)
    .max(25)
    .optional()
    .describe("Maximum number of inbox messages (default 10)"),
});

interface OutlookToolInput {
  action: "inbox" | "read";
  messageId?: string;
  top?: number;
}

const GRAPH = "https://graph.microsoft.com/v1.0";

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "outlook"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("outlook", rows[0]);
}

export function createOutlookToolForUser(userId: string): Tool {
  return createTool({
    description: `Outlook (Microsoft 365) mail integration tool.

Actions:
- inbox: List recent inbox messages (optional: top 1-25, default 10).
- read: Read a single message's full content (requires: messageId from inbox results).

IMPORTANT:
- User must connect Outlook first via the Connectors menu.
- Send/reply are not yet supported; use Gmail for outgoing mail.`,
    inputSchema,
    execute: async (input: OutlookToolInput) => {
      try {
        const { action, messageId, top = 10 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) {
          return {
            error:
              "Outlook is not connected or authentication has expired. Please connect via the Connectors menu.",
          };
        }

        if (action === "read") {
          if (!messageId) {
            return { error: "messageId is required for the read action" };
          }
          const res = await fetch(
            `${GRAPH}/me/messages/${encodeURIComponent(messageId)}?$select=subject,from,toRecipients,receivedDateTime,bodyPreview,body,isRead`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (!res.ok) return { error: "Failed to fetch message" };
          return { message: await res.json() };
        }

        // inbox
        const res = await fetch(
          `${GRAPH}/me/messages?$top=${top}&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,isRead,bodyPreview`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!res.ok) return { error: "Failed to fetch inbox" };
        const data = (await res.json()) as { value?: any[] };
        return {
          messages: data.value || [],
          count: data.value?.length || 0,
        };
      } catch (error) {
        console.error("Outlook tool error:", error);
        return {
          error:
            error instanceof Error
              ? error.message
              : "Outlook operation failed.",
        };
      }
    },
  });
}

export const outlookTool = createTool({
  description: "Outlook tool (requires user context).",
  inputSchema,
  execute: async () => ({
    error:
      "Outlook tool requires user context. This should not happen in normal operation.",
  }),
});
