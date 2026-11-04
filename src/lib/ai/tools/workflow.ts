import { tool } from "ai";
import z from "zod";

const WINDMILL_URL = process.env.WINDMILL_URL || "";
const WINDMILL_TOKEN = process.env.WINDMILL_TOKEN || "";
const WINDMILL_WORKSPACE = process.env.WINDMILL_WORKSPACE || "admins";
const ACTIVEPIECES_URL = process.env.ACTIVEPIECES_URL || "";
const ACTIVEPIECES_TOKEN = process.env.ACTIVEPIECES_TOKEN || "";

export const workflowTool = tool({
  description:
    "Run automation workflows on self-hosted Windmill or Activepieces. Use for scheduled jobs, integrations, or multi-step automations the user has set up. For windmill, target is a script/flow path like 'u/admin/hello'. For activepieces, target is a flow ID (use action=list_flows to discover).",
  inputSchema: z.object({
    platform: z.enum(["windmill", "activepieces"]),
    action: z
      .enum(["run", "list_flows", "list_scripts"])
      .describe(
        "run executes target with payload; list_flows/list_scripts discovers available automations",
      ),
    target: z
      .string()
      .optional()
      .describe("script path (windmill) or flow id (activepieces)"),
    payload: z
      .record(z.string(), z.any())
      .optional()
      .describe("input parameters for the run"),
  }),
  execute: async ({ platform, action, target, payload }) => {
    try {
      if (platform === "windmill") {
        if (!WINDMILL_URL || !WINDMILL_TOKEN)
          return {
            ok: false,
            error: "Windmill not configured on this deployment.",
          };
        const base = `${WINDMILL_URL.replace(/\/$/, "")}/api/w/${WINDMILL_WORKSPACE}`;
        const headers = {
          Authorization: `Bearer ${WINDMILL_TOKEN}`,
          "Content-Type": "application/json",
        };
        if (action === "list_scripts") {
          const r = await fetch(`${base}/scripts/list?page=1&per_page=20`, {
            headers,
          });
          const data = await r.json();
          return {
            ok: r.ok,
            scripts: (Array.isArray(data) ? data : []).map((s: any) => ({
              path: s.path,
              summary: s.summary,
            })),
          };
        }
        if (!target) return { ok: false, error: "target required for run" };
        // p/ = script by path (f/ is for flows); blocking until result
        const r = await fetch(`${base}/jobs/run_wait_result/p/${target}`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload ?? {}),
          signal: AbortSignal.timeout(55_000),
        });
        const job = await r.json();
        if (!r.ok)
          return { ok: false, error: job?.message || `HTTP ${r.status}` };
        return { ok: true, platform: "windmill", result: job };
      }

      // activepieces
      if (!ACTIVEPIECES_URL || !ACTIVEPIECES_TOKEN)
        return {
          ok: false,
          error: "Activepieces not configured on this deployment.",
        };
      const abase = `${ACTIVEPIECES_URL.replace(/\/$/, "")}/api/v1`;
      const aheaders = {
        Authorization: `Bearer ${ACTIVEPIECES_TOKEN}`,
        "Content-Type": "application/json",
      };
      if (action === "list_flows") {
        const r = await fetch(`${abase}/flows?limit=20`, { headers: aheaders });
        const data = await r.json();
        return {
          ok: r.ok,
          flows: (data?.data ?? []).map((f: any) => ({
            id: f.id,
            name: f.displayName ?? f.name,
            published: f.published?.version ?? null,
          })),
        };
      }
      if (!target)
        return { ok: false, error: "target (flow id) required for run" };
      const r = await fetch(`${abase}/flow-runs`, {
        method: "POST",
        headers: aheaders,
        body: JSON.stringify({ flowId: target, payload: payload ?? {} }),
      });
      const data = await r.json();
      return { ok: r.ok, platform: "activepieces", data };
    } catch (e: any) {
      return { ok: false, error: e?.message || "workflow tool error" };
    }
  },
});
