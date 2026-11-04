import "server-only";

import {
  AGENTS,
  DEFAULT_AGENT_ID,
  FLARE_DEFAULT_MODEL,
  isAgentAvailable,
  listFlareModels,
  usesFlare,
} from "lib/sandbox/agents";
import { isE2BConfigured, listFlareTemplates, SANDBOX_LEASE_MS } from "lib/sandbox/client";
import {
  SANDBOX_ENVIRONMENTS,
  WORK_DIR,
  availableEnvironments,
  describeEnvironmentContents,
  enabledEnvIds,
} from "lib/sandbox/templates";

// ---------------------------------------------------------------------------
// Agent harness — the runtime briefing injected into the system prompt.
// ---------------------------------------------------------------------------
// Modeled on the harness-identity pattern (see DeepSeek Harness "everything
// is a plugin"): one assembly that tells the model exactly what machinery it
// is embedded in. The capabilities section (toolkit catalog) says which
// toolkits are bound; this section says what is UNDER them — the sandbox
// environments with real specs and preinstalled toolchains, the coding agents
// the Build feature can run, and the models the gateway serves.
//
// Everything is generated from the same registries the runtime uses
// (`templates.ts`, `agents.ts`, `client.ts`), so it can never advertise a
// template or agent this deployment cannot actually spawn. All reads are
// in-memory except `listFlareModels`, which is cached with a static fallback.
// ---------------------------------------------------------------------------

const envSpec = (env: (typeof SANDBOX_ENVIRONMENTS)[number]): string =>
  `  - ${env.id} (${env.label}): ${env.cpuCount} CPU / ${env.memoryMB}MB, template ${env.template ?? "stock E2B image"}`;

const buildEnvironmentsSection = async (): Promise<string> => {
  const enabled = new Set(enabledEnvIds());
  // Includes synthesized entries for flare-* team templates found at runtime.
  const envs = availableEnvironments();
  const unbuilt = SANDBOX_ENVIRONMENTS.filter((e) => !enabled.has(e.id));

  const lines = [
    "<sandbox_environments>",
    "The sandbox tool runs commands in one of these prebuilt Linux environments. Pick the one matching the task — its toolchain is already installed and warm. The sandbox has PASSWORDLESS SUDO, so you are effectively root: anything missing can be installed on the fly (`sudo apt-get install`, pip, npm, any toolchain). Prebuilt envs are a speed choice, not a limit.",
    "",
    ...envs.map((env) => {
      const contents = describeEnvironmentContents(env);
      return contents ? `${envSpec(env)}\n${contents}` : envSpec(env);
    }),
  ];

  if (envs.length === 0) {
    lines.push(
      "  (none built on this deployment — the sandbox runs a stock Linux image with Node and Python; install what you need with sudo)",
    );
  }

  if (unbuilt.length) {
    lines.push(
      "",
      "Defined but NOT built on this deployment (asking for one will degrade to the default env — but with sudo you can install the toolchain yourself):",
      ...unbuilt.map((e) => `  - ${e.id} (${e.label})`),
    );
  }

  try {
    // Only list team templates not already covered by `envs` above, so a
    // discovered flare-* template is not advertised twice.
    const custom = (await listFlareTemplates()).filter(
      (t) => !envs.some((e) => e.id === t.name),
    );
    if (custom.length > 0) {
      lines.push(
        "",
        "Custom templates built on the flare team (available right now — use env=\"<name>\"):",
        ...custom.map(
          (t) => `  - ${t.name}: ${t.cpuCount} CPU / ${t.memoryMB}MB, template ${t.templateId}`,
        ),
      );
    }
  } catch {
    // Custom team templates are best-effort; never let them break the harness.
  }

  lines.push("", `All work happens in ${WORK_DIR}. Relative paths resolve there.`);
  lines.push("</sandbox_environments>");
  return lines.join("\n");
};

const buildAgentsSection = async (): Promise<string> => {
  const flareModels = AGENTS.some((a) => usesFlare(a))
    ? await listFlareModels()
    : [];

  const lines = ["<coding_agents>"];

  if (!isE2BConfigured()) {
    lines.push(
      "No coding agents available — the Build feature needs E2B_API_KEY, which is not set on this deployment.",
    );
    lines.push("</coding_agents>");
    return lines.join("\n");
  }

  for (const agent of AGENTS) {
    const available = isAgentAvailable(agent);
    const viaFlare = usesFlare(agent);
    const models = viaFlare ? flareModels : (agent.models ?? []);

    // Deduplicate and cap: the gateway can advertise hundreds of models in
    // several formats (prefixed, unprefixed, duplicated), and pasting them
    // all into the prompt would burn context on every request. "+N more"
    // counts only deduped models truncated past the cap — duplicates are
    // never reported as "more".
    const seen = new Set<string>();
    const unique = models
      .map((m) => m.id)
      .filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
    const capped = unique.slice(0, 8);
    const modelList =
      capped.length > 0
        ? `${capped.join(", ")}${unique.length > capped.length ? ` +${unique.length - capped.length} more` : ""}`
        : agent.defaultModel ?? "default";

    lines.push(
      `- ${agent.id}${available ? "" : " (UNAVAILABLE — needs a key)"}: ${agent.description}${viaFlare ? " [runs on the Flare gateway]" : ""}`,
    );
    lines.push(`    models: ${modelList}`);
  }

  lines.push(
    "",
    `The default agent is "${DEFAULT_AGENT_ID}" (model "${FLARE_DEFAULT_MODEL}") when none is specified.`,
  );
  lines.push("</coding_agents>");
  return lines.join("\n");
};

/**
 * Full runtime briefing: harness identity, sandbox machinery, environments
 * with real specs, coding agents and gateway models. Safe to call on every
 * request — registry reads in memory plus one cached model fetch (8s timeout,
 * static fallback).
 */
export const buildAgentHarness = async (): Promise<string> => {
  const configured = isE2BConfigured();
  const leaseHours = Math.round(SANDBOX_LEASE_MS / 3_600_000);

  const sections = [
    "<agent_harness>",
    "You are the Flare assistant running inside the Flare runtime. Here is the machinery actually available to you in this deployment — your identity, your powers, and what sits under every tool you hold:",
    "",
    configured
      ? [
          "The sandbox is a real Linux VM per conversation: files, installed packages and running servers persist across turns. The sandbox has PASSWORDLESS SUDO — you are effectively ROOT and can install anything (`sudo apt-get install`, pip, npm, compilers, services). Preview URLs served with action='serve' are public and stay up while the sandbox is alive; sandboxes auto-pause when idle (free, files kept) and resume in about a second.",
          `Sandbox lease is ${leaseHours}h — long enough for a working session; idle boxes auto-pause anyway.`,
        ].join("\n")
      : "The sandbox is NOT configured on this deployment (E2B_API_KEY missing) — do not claim you can run commands or build apps.",
  ];

  const sectionsJoined = await Promise.all([
    buildEnvironmentsSection(),
    buildAgentsSection(),
  ]);

  return [...sections, ...sectionsJoined, "</agent_harness>"].join("\n\n");
};

/**
 * Cached harness text for prompt assembly. The harness is identical for every
 * conversation on a deployment (it describes the runtime, not the user), so
 * it is rendered once per model-list refresh instead of once per request.
 */
let cached: { at: number; text: string } | null = null;
const HARNESS_CACHE_TTL_MS = 5 * 60_000;

export const buildAgentHarnessCached = async (): Promise<string | undefined> => {
  try {
    if (cached && Date.now() - cached.at < HARNESS_CACHE_TTL_MS) {
      return cached.text;
    }
    const text = await buildAgentHarness();
    cached = { at: Date.now(), text };
    return text;
  } catch {
    // A harness failure must never break the conversation.
    return undefined;
  }
};