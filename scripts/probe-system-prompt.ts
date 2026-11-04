import "load-env";
import { buildUserSystemPrompt } from "lib/ai/prompts";
import {
  DEFAULT_ENABLED_TOOLKITS,
  TOOLKIT_CATALOG,
} from "lib/ai/tools/toolkit-catalog";

const all = TOOLKIT_CATALOG.map((t) => t.id);
const on = DEFAULT_ENABLED_TOOLKITS as string[];
const off = all.filter((id) => !on.includes(id));

const p = buildUserSystemPrompt(
  { id: "u", name: "Kety", email: "k@example.com" } as any,
  undefined,
  undefined,
  { provider: "flare", model: "opus" },
  {
    enabledToolkits: on,
    availableButOff: off,
    supportsTools: true,
    tier: "flare-enterprises-max",
  },
);
const i = p.indexOf("<capabilities>");
console.log(p.slice(i));
