import "load-env";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AgentTable } from "lib/db/pg/schema.pg";
import { buildUserSystemPrompt } from "lib/ai/prompts";
import {
  DEFAULT_ENABLED_TOOLKITS,
  TOOLKIT_CATALOG,
} from "lib/ai/tools/toolkit-catalog";
import { loadAppDefaultTools } from "@/app/api/chat/shared.chat";

const all = TOOLKIT_CATALOG.map((t) => t.id);
const on = DEFAULT_ENABLED_TOOLKITS as string[];
const caps = {
  enabledToolkits: on,
  availableButOff: all.filter((i) => !on.includes(i)),
  supportsTools: true,
  tier: "flare-enterprises-max",
};

const main = async () => {
  // 1. Plain chat (no agent) — the "main Flare agent".
  const base = buildUserSystemPrompt(
    { id: "u", name: "Kety", email: "k@x.com" } as any,
    undefined,
    undefined,
    { provider: "flare", model: "opus" },
    caps,
  );
  console.log("=== default chat assistant ===");
  console.log("prompt chars:", base.length);
  for (const k of ["<capabilities>", "<flare_platform>", "<core_behaviour>"])
    console.log(`  has ${k}: ${base.includes(k)}`);

  // 2. Every agent: prompt assembles, and its tools actually resolve.
  const agents: any[] = await db.select().from(AgentTable);
  console.log("\n=== agents ===");
  let broken = 0;
  for (const a of agents.sort((x, y) => x.name.localeCompare(y.name))) {
    const p = buildUserSystemPrompt(
      { id: "u" } as any,
      undefined,
      a,
      { provider: "flare", model: "opus" },
      caps,
    );
    const mentions = (a.instructions?.mentions ?? []) as any[];
    const tools: any = await loadAppDefaultTools({
      userId: "probe",
      threadId: "t",
      ...(mentions.length ? { mentions } : {}),
    });
    const want = mentions.map((m) => m.name);
    const got = Object.keys(tools);
    const lost = want.filter((n: string) => !got.includes(n));
    if (lost.length) broken++;
    console.log(
      `${a.name.trim().slice(0, 24).padEnd(25)} prompt=${String(p.length).padStart(5)} ` +
        `core=${p.includes("<core_behaviour>") ? "y" : "N"} ` +
        `tools=${want.length ? `${got.length}/${want.length}` : "inherit"}` +
        (lost.length ? `  UNRESOLVED: ${lost.join(",")}` : ""),
    );
  }
  console.log(`\nagents with unresolved tool mentions: ${broken}`);
};
main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
