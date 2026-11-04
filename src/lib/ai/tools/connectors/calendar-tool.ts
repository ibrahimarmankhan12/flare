import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list", "get"]),
  eventId: z
    .string()
    .optional()
    .describe("The Calendar event ID (for get action)"),
  maxResults: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum number of events to return (default 10)"),
});

interface CalendarToolInput {
  action: "list" | "get";
  eventId?: string;
  maxResults?: number;
}

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "google-calendar"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("google-calendar", rows[0]);
}

export function createCalendarToolForUser(userId: string): Tool {
  return createTool({
    description: `Google Calendar integration tool.

Actions:
- list: List upcoming events (optional: maxResults 1-50, default 10).
- get: Get a specific event's full details (requires: eventId from list results).

IMPORTANT:
- User must connect Google Calendar first via the Connectors menu.
- For 'get', the eventId must come from a previous 'list' call.`,
    inputSchema,
    execute: async (input: CalendarToolInput) => {
      try {
        const { action, eventId, maxResults = 10 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) {
          return {
            error:
              "Google Calendar is not connected or authentication has expired. Please connect via the Connectors menu.",
          };
        }

        if (action === "get") {
          if (!eventId) {
            return { error: "eventId is required for the get action" };
          }
          const res = await fetch(
            `https://www.googleapis.com/calendar/v3/events/${encodeURIComponent(eventId)}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (!res.ok) {
            return { error: "Failed to fetch event" };
          }
          const event = await res.json();
          return { event };
        }

        // list upcoming events
        const now = new Date().toISOString();
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/events?maxResults=${maxResults}&timeMin=${encodeURIComponent(now)}&singleEvents=true&orderBy=startTime`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!res.ok) {
          return { error: "Failed to list events" };
        }
        const data = (await res.json()) as { items?: any[] };
        return {
          events: (data.items || []).map((e) => ({
            id: e.id,
            summary: e.summary,
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date,
            location: e.location,
            description: e.description,
            htmlLink: e.htmlLink,
          })),
          count: data.items?.length || 0,
        };
      } catch (error) {
        console.error("Calendar tool error:", error);
        return {
          error:
            error instanceof Error
              ? error.message
              : "Calendar operation failed.",
        };
      }
    },
  });
}

export const calendarTool = createTool({
  description: "Google Calendar tool (requires user context).",
  inputSchema,
  execute: async () => ({
    error:
      "Calendar tool requires user context. This should not happen in normal operation.",
  }),
});
