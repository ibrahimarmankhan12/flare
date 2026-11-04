import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_projects", "search_issues", "get_issue", "add_comment"]),
  projectKey: z.string().optional().describe("Jira project key"),
  issueKey: z.string().optional().describe("Jira issue key (e.g. PROJ-123)"),
  jql: z.string().optional().describe("JQL search string"),
  comment: z.string().optional().describe("Comment body (for add_comment)"),
  limit: z.number().min(1).max(100).optional(),
});

interface JiraToolInput {
  action: "list_projects" | "search_issues" | "get_issue" | "add_comment";
  projectKey?: string;
  issueKey?: string;
  jql?: string;
  comment?: string;
  limit?: number;
}

const JIRA_API = "https://api.atlassian.com/ex/jira";
const CLOUD_ID_METADATA_KEY = "jiraCloudId";

async function getAccessToken(userId: string) {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "jira"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  const token = await refreshConnectorToken("jira", rows[0]);
  if (!token) return null;
  const cloudId = (rows[0].metadata as any)?.[CLOUD_ID_METADATA_KEY] as
    | string
    | undefined;
  return { token, cloudId };
}

export function createJiraToolForUser(userId: string): Tool {
  return createTool({
    description: `Jira integration tool.

Actions:
- list_projects: List accessible Jira projects.
- search_issues: Search issues by JQL (optional: projectKey, jql).
- get_issue: Read an issue's full details (requires: issueKey).
- add_comment: Add a comment to an issue (requires: issueKey, comment).

User must connect Jira first via the Connectors menu.`,
    inputSchema,
    execute: async (input: JiraToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const creds = await getAccessToken(userId);
        if (!creds) {
          return {
            error:
              "Jira is not connected or authentication has expired. Please connect via the Connectors menu.",
          };
        }
        if (!creds.cloudId) {
          return {
            error: "Jira workspace not yet linked. Please reconnect Jira.",
          };
        }
        const headers = {
          Authorization: `Bearer ${creds.token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        };
        const baseUrl = `${JIRA_API}/${creds.cloudId}/rest/api/3`;

        if (action === "list_projects") {
          const res = await fetch(
            `${baseUrl}/project/search?maxResults=${limit}`,
            { headers },
          );
          if (!res.ok) {
            return { error: `Jira API error: ${res.status}` };
          }
          const data = (await res.json()) as { values?: any[] };
          return {
            projects: (data.values || []).map((p) => ({
              id: p.id,
              key: p.key,
              name: p.name,
            })),
          };
        }

        if (action === "search_issues") {
          const jql =
            input.jql ||
            (input.projectKey ? `project = "${input.projectKey}"` : "ORDER BY created DESC");
          const res = await fetch(
            `${baseUrl}/search?jql=${encodeURIComponent(jql)}&maxResults=${limit}`,
            { headers },
          );
          if (!res.ok) {
            return { error: `Jira search failed: ${res.status}` };
          }
          const data = (await res.json()) as { issues?: any[] };
          return {
            issues: (data.issues || []).map((i) => ({
              key: i.key,
              id: i.id,
              summary: i.fields?.summary,
              status: i.fields?.status?.name,
              assignee: i.fields?.assignee?.displayName,
            })),
          };
        }

        if (action === "get_issue") {
          if (!input.issueKey) {
            return { error: "issueKey is required for get_issue" };
          }
          const res = await fetch(
            `${baseUrl}/issue/${input.issueKey}`,
            { headers },
          );
          if (!res.ok) {
            return { error: `Failed to fetch issue: ${res.status}` };
          }
          return await res.json();
        }

        if (action === "add_comment") {
          if (!input.issueKey || !input.comment) {
            return {
              error: "issueKey and comment are required for add_comment",
            };
          }
          const res = await fetch(
            `${baseUrl}/issue/${input.issueKey}/comment`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                body: {
                  type: "doc",
                  version: 1,
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: input.comment }],
                    },
                  ],
                },
              }),
            },
          );
          if (!res.ok) {
            return { error: `Failed to add comment: ${res.status}` };
          }
          return { success: true };
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Jira tool error:", error);
        return {
          error:
            error instanceof Error ? error.message : "Jira operation failed.",
        };
      }
    },
  });
}

export const jiraTool = createTool({
  description: "Jira tool (requires user context).",
  inputSchema,
  execute: async () => ({
    error:
      "Jira tool requires user context. This should not happen in normal operation.",
  }),
});
