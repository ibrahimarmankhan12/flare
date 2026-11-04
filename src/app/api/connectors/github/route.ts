import { NextRequest, NextResponse } from "next/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getSession } from "auth/server";
import { refreshConnectorToken } from "lib/connectors/refresh";

const GITHUB_API = "https://api.github.com";
const GH_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "flare-connector",
});

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "list_repos";
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");
    const number = searchParams.get("number");

    const rows = await db
      .select()
      .from(UserConnectorTable)
      .where(
        and(
          eq(UserConnectorTable.userId, session.user.id),
          eq(UserConnectorTable.provider, "github"),
        ),
      )
      .limit(1);

    if (rows.length === 0 || !rows[0].isConnected) {
      return NextResponse.json(
        { error: "GitHub is not connected" },
        { status: 400 },
      );
    }

    const accessToken = await refreshConnectorToken("github", rows[0]);
    if (!accessToken) {
      return NextResponse.json(
        { error: "GitHub authentication expired. Please reconnect." },
        { status: 401 },
      );
    }

    if (action === "list_repos") {
      const res = await fetch(
        `${GITHUB_API}/user/repos?per_page=30&sort=updated`,
        { headers: GH_HEADERS(accessToken) },
      );
      if (!res.ok) {
        return NextResponse.json(
          { error: "Failed to list repos" },
          { status: 500 },
        );
      }
      const repos = await res.json();
      return NextResponse.json({
        repos: (repos as any[]).map((r) => ({
          name: r.name,
          full_name: r.full_name,
          private: r.private,
          html_url: r.html_url,
          description: r.description,
          updated_at: r.updated_at,
        })),
      });
    }

    if (action === "list_issues") {
      if (!owner || !repo) {
        return NextResponse.json(
          { error: "owner and repo query params are required" },
          { status: 400 },
        );
      }
      const res = await fetch(
        `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=open&per_page=20`,
        { headers: GH_HEADERS(accessToken) },
      );
      if (!res.ok) {
        return NextResponse.json(
          { error: "Failed to list issues" },
          { status: 500 },
        );
      }
      const issues = await res.json();
      return NextResponse.json({
        issues: (issues as any[]).map((i) => ({
          number: i.number,
          title: i.title,
          state: i.state,
          user: i.user?.login,
          html_url: i.html_url,
          created_at: i.created_at,
        })),
      });
    }

    if (action === "get_issue") {
      if (!owner || !repo || !number) {
        return NextResponse.json(
          { error: "owner, repo, and number query params are required" },
          { status: 400 },
        );
      }
      const res = await fetch(
        `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${encodeURIComponent(number)}`,
        { headers: GH_HEADERS(accessToken) },
      );
      if (!res.ok) {
        return NextResponse.json(
          { error: "Failed to fetch issue" },
          { status: 500 },
        );
      }
      const issue = await res.json();
      return NextResponse.json({
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
      });
    }

    if (action === "list_prs") {
      if (!owner || !repo) {
        return NextResponse.json(
          { error: "owner and repo query params are required" },
          { status: 400 },
        );
      }
      const res = await fetch(
        `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&per_page=20`,
        { headers: GH_HEADERS(accessToken) },
      );
      if (!res.ok) {
        return NextResponse.json(
          { error: "Failed to list pull requests" },
          { status: 500 },
        );
      }
      const prs = await res.json();
      return NextResponse.json({
        pull_requests: (prs as any[]).map((p) => ({
          number: p.number,
          title: p.title,
          state: p.state,
          user: p.user?.login,
          html_url: p.html_url,
          created_at: p.created_at,
        })),
      });
    }

    return NextResponse.json(
      {
        error:
          "Invalid action. Valid: list_repos, list_issues, get_issue, list_prs",
      },
      { status: 400 },
    );
  } catch (error) {
    console.error("GitHub API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "GitHub request failed",
      },
      { status: 500 },
    );
  }
}
