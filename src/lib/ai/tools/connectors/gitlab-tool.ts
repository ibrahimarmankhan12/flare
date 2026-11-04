import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_projects", "list_issues", "get_issue", "list_merge_requests"]),
  projectId: z.union([z.string(), z.number()]).optional().describe("GitLab project ID or path-encoded string"),
  issueIid: z.number().int().optional().describe("Issue IID within project"),
  state: z.enum(["opened", "closed", "merged", "all"]).optional(),
  search: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

interface GitLabToolInput {
  action: "list_projects" | "list_issues" | "get_issue" | "list_merge_requests";
  projectId?: string | number;
  issueIid?: number;
  state?: "opened" | "closed" | "merged" | "all";
  search?: string;
  limit?: number;
}

function getBaseUrl(): string {
  return process.env.GITLAB_BASE_URL?.replace(/\/+$/, "") || "https://gitlab.com";
}

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "gitlab"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("gitlab", rows[0]);
}

export function createGitLabToolForUser(userId: string): Tool {
  return createTool({
    description: `GitLab integration tool.

Actions:
- list_projects: List accessible projects.
- list_issues: List issues in a project (requires: projectId, optional: state).
- get_issue: Read an issue (requires: projectId, issueIid).
- list_merge_requests: List MRs in a project (requires: projectId, optional: state).`,
    inputSchema,
    execute: async (input: GitLabToolInput) => {
      try {
        const { action, limit = 25 } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) return { error: "GitLab is not connected." };
        const headers = { Authorization: `Bearer ${accessToken}` };
        const base = getBaseUrl();
        const projectSeg = input.projectId
          ? `/projects/${encodeURIComponent(String(input.projectId))}`
          : "";

        if (action === "list_projects") {
          const res = await fetch(
            `${base}/api/v4/projects?membership=true&per_page=${limit}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "list_issues") {
          if (!input.projectId) return { error: "projectId required" };
          const params = new URLSearchParams({ per_page: String(limit) });
          if (input.state) params.set("state", input.state);
          const res = await fetch(
            `${base}/api/v4${projectSeg}/issues?${params}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "get_issue") {
          if (!input.projectId || !input.issueIid) {
            return { error: "projectId and issueIid required" };
          }
          const res = await fetch(
            `${base}/api/v4${projectSeg}/issues/${input.issueIid}`,
            { headers },
          );
          return await res.json();
        }
        if (action === "list_merge_requests") {
          if (!input.projectId) return { error: "projectId required" };
          const params = new URLSearchParams({ per_page: String(limit) });
          if (input.state) params.set("state", input.state);
          const res = await fetch(
            `${base}/api/v4${projectSeg}/merge_requests?${params}`,
            { headers },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("GitLab tool error:", error);
        return {
          error: error instanceof Error ? error.message : "GitLab operation failed.",
        };
      }
    },
  });
}

export const gitlabTool = createTool({
  description: "GitLab tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "GitLab tool requires user context." }),
});
