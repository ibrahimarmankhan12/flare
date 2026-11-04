import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getTokenProviderToken } from "lib/connectors/credentials";

const inputSchema = z.object({
  action: z.enum(["list_projects", "list_cases", "list_runs", "get_run"]),
  projectId: z.number().int().optional().describe("TestRail project ID (numeric)"),
  suiteId: z.number().int().optional().describe("TestRail suite ID (numeric)"),
  runId: z.number().int().optional().describe("TestRail run ID (numeric)"),
  limit: z.number().min(1).max(100).optional(),
});

interface TestRailToolInput {
  action: "list_projects" | "list_cases" | "list_runs" | "get_run";
  projectId?: number;
  suiteId?: number;
  runId?: number;
  limit?: number;
}

function getBaseUrl(): string | null {
  return process.env.TESTRAIL_URL?.replace(/\/+$/, "") || null;
}

/**
 * TestRail uses HTTP Basic Auth with username + API token. The username is
 * read from `TESTRAIL_USER` env var; the API token is read via
 * `getTokenProviderToken("testrail")`.
 */
async function getAuthHeader(): Promise<string | null> {
  const token = getTokenProviderToken("testrail");
  const user = process.env.TESTRAIL_USER?.trim();
  if (!token || !user) return null;
  return `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`;
}

async function getIsConnected(userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "testrail"),
      ),
    )
    .limit(1);
  return rows.length > 0 && rows[0].isConnected;
}

export function createTestRailToolForUser(userId: string): Tool {
  return createTool({
    description: `TestRail integration tool (server-token).

Actions:
- list_projects: List TestRail projects.
- list_cases: List test cases in a project/suite (requires: projectId, optional: suiteId).
- list_runs: List test runs for a project (requires: projectId).
- get_run: Read a test run (requires: runId).

TestRail is configured server-side via TESTRAIL_URL, TESTRAIL_USER, TESTRAIL_API_TOKEN env vars.`,
    inputSchema,
    execute: async (input: TestRailToolInput) => {
      try {
        const { limit = 25 } = input;
        const baseUrl = getBaseUrl();
        const auth = await getAuthHeader();
        if (!baseUrl || !auth) {
          return {
            error: "TestRail is not configured. Set TESTRAIL_URL, TESTRAIL_USER, TESTRAIL_API_TOKEN env vars.",
          };
        }
        if (!(await getIsConnected(userId))) {
          return {
            error:
              "TestRail is not connected. Click Connect on the TestRail card to enable it (single-tenant).",
          };
        }
        const headers = { Authorization: auth, "Content-Type": "application/json" };

        if (action_label(input) === "list_projects") {
          const res = await fetch(`${baseUrl}/index.php?/api/v2/get_projects`, { headers });
          const data = (await res.json()) as any[];
          return { projects: (data || []).slice(0, limit) };
        }
        if (action_label(input) === "list_cases") {
          if (!input.projectId) return { error: "projectId required" };
          const suiteQ = input.suiteId ? `&suite_id=${input.suiteId}` : "";
          const res = await fetch(
            `${baseUrl}/index.php?/api/v2/get_cases/${input.projectId}&limit=${limit}${suiteQ}`,
            { headers },
          );
          const data = (await res.json()) as any[];
          return { cases: data || [] };
        }
        if (action_label(input) === "list_runs") {
          if (!input.projectId) return { error: "projectId required" };
          const res = await fetch(
            `${baseUrl}/index.php?/api/v2/get_runs/${input.projectId}&limit=${limit}`,
            { headers },
          );
          const data = (await res.json()) as any[];
          return { runs: data || [] };
        }
        if (action_label(input) === "get_run") {
          if (!input.runId) return { error: "runId required" };
          const res = await fetch(
            `${baseUrl}/index.php?/api/v2/get_run/${input.runId}`,
            { headers },
          );
          return await res.json();
        }
        return { error: "Unknown action" };
      } catch (error) {
        console.error("TestRail tool error:", error);
        return {
          error: error instanceof Error ? error.message : "TestRail operation failed.",
        };
      }
    },
  });
}

// Type guard helper for switch-like dispatch
function action_label(input: TestRailToolInput) {
  return input.action;
}

export const testrailTool = createTool({
  description: "TestRail tool (requires user context).",
  inputSchema,
  execute: async () => ({ error: "TestRail tool requires user context." }),
});
