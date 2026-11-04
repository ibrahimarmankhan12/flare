import "load-env";
import { buildUserSystemPrompt } from "lib/ai/prompts";
import {
  DEFAULT_ENABLED_TOOLKITS,
  TOOLKIT_CATALOG,
} from "lib/ai/tools/toolkit-catalog";
const all = TOOLKIT_CATALOG.map((t) => t.id);
const on = DEFAULT_ENABLED_TOOLKITS as string[];
console.log(
  buildUserSystemPrompt(
    { id: "u", name: "Kety", email: "k@x.com" } as any,
    undefined,
    undefined,
    { provider: "flare", model: "opus" },
    {
      enabledToolkits: on,
      availableButOff: all.filter((i) => !on.includes(i)),
      supportsTools: true,
      tier: "flare-enterprises-max",
    },
  ),
);
