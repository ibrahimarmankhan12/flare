import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list_repos", "list_issues", "get_issue", "list_prs"]),
  owner: z
    .string()
    .optional()
    .describe("Repository owner (user or org) — required for list_issues/get_issue/list_prs"),
  repo: z
    .string()
    .optional()
    .describe("Repository name — required for list_issues/get_issue/list_prs"),
  number: z
    .number()
    .optional()
    .describe("Issue or PR number — required for get_issue"),
});

interface GitHubToolInput {
  action: "list_repos" | "list_issues" | "get_issue" | "list_prs";
  owner?: string;
  repo?: string;
  number?: number;
}

const GITHUB_API = "https://api.github.com";
const GH_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "flare-connector",
});

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "github"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("github", rows[0]);
}

export function createGitHubToolForUser(userId: string): Tool {
  return createTool({
    description: `GitHub integration tool.

Actions:
- list_repos: List the authenticated user's repositories (max 30 most recently updated).
- list_issues: List open issues in a repository (requires: owner, repo).
- get_issue: Get a single issue with its body (requires: owner, repo, number).
- list_prs: List open pull requests in a repository (requires: owner, repo).

IMPORTANT:
- User must connect GitHub first via the Connectors menu.`,
    inputSchema,
    execute: async (input: GitHubToolInput) => {
      try {
        const { action, owner, repo, number } = input;
        const accessToken = await getAccessToken(userId);
        if (!accessToken) {
          return {
            error:
              "GitHub is not connected or authentication has expired. Please connect via the Connectors menu.",
          };
        }

        if (action === "list_repos") {
          const res = await fetch(
            `${GITHUB_API}/user/repos?per_page=30&sort=updated`,
            { headers: GH_HEADERS(accessToken) },
          );
          if (!res.ok) return { error: "Failed to list repos" };
          const repos = (await res.json()) as any[];
          return {
            repos: repos.map((r) => ({
              name: r.name,
              full_name: r.full_name,
              private: r.private,
              html_url: r.html_url,
              description: r.description,
              updated_at: r.updated_at,
            })),
          };
        }

        if (action === "list_issues") {
          if (!owner || !repo) {
            return { error: "owner and repo are required for list_issues" };
          }
          const res = await fetch(
            `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=open&per_page=20`,
            { headers: GH_HEADERS(accessToken) },
          );
          if (!res.ok) return { error: "Failed to list issues" };
          const issues = (await res.json()) as any[];
          return {
            issues: issues
              .filter((i) => !i.pull_request) // exclude PRs from issues list
              .map((i) => ({
                number: i.number,
                title: i.title,
                state: i.state,
                user: i.user?.login,
                html_url: i.html_url,
                created_at: i.created_at,
              })),
          };
        }

        if (action === "get_issue") {
          if (!owner || !repo || !number) {
            return {
              error: "owner, repo, and number are required for get_issue",
            };
          }
          const res = await fetch(
            `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}`,
            { headers: GH_HEADERS(accessToken) },
          );
          if (!res.ok) return { error: "Failed to fetch issue" };
          const issue = await res.json();
          return {
            issue: {
              number: issue.number,
              title: issue.title,
              state: issue.state,
              body: issue.body,
              user: issue.user?.login,
              html_url: issue.html_url,
              comments: issue.comments,
              created_at: issue.created_at,
            },
          };
        }

        if (action === "list_prs") {
          if (!owner || !repo) {
            return { error: "owner and repo are required for list_prs" };
          }
          const res = await fetch(
            `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&per_page=20`,
            { headers: GH_HEADERS(accessToken) },
          );
          if (!res.ok) return { error: "Failed to list pull requests" };
          const prs = (await res.json()) as any[];
          return {
            pull_requests: prs.map((p) => ({
              number: p.number,
              title: p.title,
              state: p.state,
              user: p.user?.login,
              html_url: p.html_url,
              created_at: p.created_at,
            })),
          };
        }

        return { error: `Unknown action: ${action}` };
      } catch (error) {
        console.error("GitHub tool error:", error);
        return {
          error:
            error instanceof Error
              ? error.message
              : "GitHub operation failed.",
        };
      }
    },
  });
}

export const githubTool = createTool({
  description: "GitHub tool (requires user context).",
  inputSchema,
  execute: async () => ({
    error:
      "GitHub tool requires user context. This should not happen in normal operation.",
  }),
});
