import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_teams", "list_issues", "get_issue", "create_issue"]),
  teamId: z.string().optional().describe("Linear team ID (UUID)"),
  issueId: z.string().optional().describe("Linear issue ID (UUID)"),
  title: z.string().optional().describe("Issue title (for create_issue)"),
  description: z.string().optional().describe("Issue description"),
  state: z.string().optional().describe("Filter by state name"),
  limit: z.number().min(1).max(100).optional(),
});

interface LinearToolInput {
  action: "list_teams" | "list_issues" | "get_issue" | "create_issue";
  teamId?: string;
  issueId?: string;
  title?: string;
  description?: string;
  state?: string;
  limit?: number;
}

const LINEAR_API = "https://api.linear.app/graphql";

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "linear"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("linear", rows[0]);
}

export function createLinearToolForUser(userId: string): Tool {
  return createTool({
    description: `Linear integration tool.

Actions:
- list_teams: List Linear teams.
- list_issues: List issues for a team (requires: teamId, optional: state).
- get_issue: Read an issue (requires: issueId).
- create_issue: Create a new issue (requires: teamId, title).

User must connect Linear first via the Connectors menu.`,
    inputSchema,
    execute: async (input: LinearToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) {
          return {
            error:
              "Linear is not connected. Please connect via the Connectors menu.",
          };
        }
        const headers = {
          Authorization: accessToken,
          "Content-Type": "application/json",
        };
        const gql = async (query: string, variables: any = {}) => {
          const res = await fetch(LINEAR_API, {
            method: "POST",
            headers,
            body: JSON.stringify({ query, variables }),
          });
          if (!res.ok) {
            return { error: `Linear API error: ${res.status}` };
          }
          return await res.json();
        };

        if (action === "list_teams") {
          const data = (await gql(`{ teams(first: ${limit}) { nodes { id name key } } }`)) as any;
          return {
            teams: data?.data?.teams?.nodes || [],
          };
        }

        if (action === "list_issues") {
          if (!input.teamId) {
            return { error: "teamId is required for list_issues" };
          }
          const filter = input.state
            ? `, filter: { state: { name: { eq: "${input.state}" } } }`
            : "";
          const data = (await gql(
            `query($teamId: String!) { issues(first: ${limit}, filter: { team: { id: { eq: $teamId } } ${filter} }) { nodes { id identifier title state { name } } } }`,
            { teamId: input.teamId },
          )) as any;
          return { issues: data?.data?.issues?.nodes || [] };
        }

        if (action === "get_issue") {
          if (!input.issueId) {
            return { error: "issueId is required for get_issue" };
          }
          const data = (await gql(
            `query($id: String!) { issue(id: $id) { id identifier title description state { name } assignee { name email } } }`,
            { id: input.issueId },
          )) as any;
          return { issue: data?.data?.issue };
        }

        if (action === "create_issue") {
          if (!input.teamId || !input.title) {
            return { error: "teamId and title are required for create_issue" };
          }
          const data = (await gql(
            `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title } } }`,
            {
              input: {
                teamId: input.teamId,
                title: input.title,
                description: input.description,
              },
            },
          )) as any;
          return data?.data?.issueCreate;
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Linear tool error:", error);
        return {
          error:
            error instanceof Error ? error.message : "Linear operation failed.",
        };
      }
    },
  });
}

export const linearTool = createTool({
  description: "Linear tool (requires user context).",
  inputSchema,
  execute: async () => ({
    error:
      "Linear tool requires user context. This should not happen in normal operation.",
  }),
});
