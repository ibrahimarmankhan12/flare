import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_repos", "list_issues", "get_issue", "list_pull_requests"]),
  workspace: z.string().optional().describe("Bitbucket workspace"),
  repo: z.string().optional().describe("Bitbucket repo slug"),
  issueId: z.union([z.string(), z.number()]).optional(),
  state: z.enum(["new", "open", "resolved", "closed", "on-hold", "invalid", "wontfix", "duplicate", "all"]).optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface BitbucketToolInput {
  action: "list_repos" | "list_issues" | "get_issue" | "list_pull_requests";
  workspace?: string;
  repo?: string;
  issueId?: string | number;
  state?: "new" | "open" | "resolved" | "closed" | "on-hold" | "invalid" | "wontfix" | "duplicate" | "all";
  limit?: number;
}

const BITBUCKET_API = "https://api.bitbucket.org/2.0";

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "bitbucket"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("bitbucket", rows[0]);
}

export function createBitbucketToolForUser(userId: string): Tool {
  return createTool({
    description: `Bitbucket integration tool.

Actions:
- list_repos: List repos in a workspace (requires: workspace).
- list_issues: List issues in a repo (requires: workspace, repo, optional: state).
- get_issue: Read an issue (requires: workspace, repo, issueId).
- list_pull_requests: List PRs in a repo (requires: workspace, repo, optional: state).`,
    inputSchema,
    execute: async (input: BitbucketToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) return { error: "Bitbucket is not connected." };
        const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };

        if (action === "list_repos") {
          if (!input.workspace) return { error: "workspace required" };
          const res = await fetch(
            `${BITBUCKET_API}/repositories/${input.workspace}?pagelen=${limit}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "list_issues") {
          if (!input.workspace || !input.repo) {
            return { error: "workspace and repo required" };
          }
          const q = input.state ? `?state=${input.state}&pagelen=${limit}` : `?pagelen=${limit}`;
          const res = await fetch(
            `${BITBUCKET_API}/repositories/${input.workspace}/${input.repo}/issues${q}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "get_issue") {
          if (!input.workspace || !input.repo || !input.issueId) {
            return { error: "workspace, repo, issueId required" };
          }
          const res = await fetch(
            `${BITBUCKET_API}/repositories/${input.workspace}/${input.repo}/issues/${input.issueId}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "list_pull_requests") {
          if (!input.workspace || !input.repo) {
            return { error: "workspace and repo required" };
          }
          const q = input.state ? `?state=${input.state}&pagelen=${limit}` : `?pagelen=${limit}`;
          const res = await fetch(
            `${BITBUCKET_API}/repositories/${input.workspace}/${input.repo}/pullrequests${q}`,
            { headers },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("Bitbucket tool error:", error);
        return {
          error: error instanceof Error ? error.message : "Bitbucket operation failed.",
        };
      }
    },
  });
}

export const bitbucketTool = createTool({
  description: "Bitbucket tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "Bitbucket tool requires user context." }),
});
