import "load-env";
import { pgDb as db } from "lib/db/pg/db.pg";
import { AgentTable } from "lib/db/pg/schema.pg";
import { eq } from "drizzle-orm";
import { buildUserSystemPrompt } from "lib/ai/prompts";
import {
  DEFAULT_ENABLED_TOOLKITS,
  TOOLKIT_CATALOG,
} from "lib/ai/tools/toolkit-catalog";

const main = async () => {
  const [agent]: any = await db
    .select()
    .from(AgentTable)
    .where(eq(AgentTable.id, "b3055f04-0179-40ae-8423-93260985dc03"));
  const all = TOOLKIT_CATALOG.map((t) => t.id);
  const on = DEFAULT_ENABLED_TOOLKITS as string[];
  const p = buildUserSystemPrompt(
    { id: "u", name: "Kety", email: "k@x.com" } as any,
    undefined,
    agent,
    { provider: "flare", model: "opus" },
    {
      enabledToolkits: on,
      availableButOff: all.filter((i) => !on.includes(i)),
      supportsTools: true,
      tier: "flare-enterprises-max",
    },
  );
  console.log("agent name       :", agent.name);
  console.log("system prompt len:", p.length);
  console.log(
    "has core_capabilities block:",
    p.includes("<core_capabilities>"),
  );
  for (const probe of [
    "env` on the first `sandbox`",
    "NON-ROOT",
    "assembleDebug",
    "write_many",
    "0.0.0.0",
    "Verify before you claim success",
  ]) {
    console.log(`  contains ${JSON.stringify(probe)}:`, p.includes(probe));
  }
};
main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
