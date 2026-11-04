import "server-only";

// ---------------------------------------------------------------------------
// Coding agents runnable inside an E2B sandbox.
// ---------------------------------------------------------------------------
// E2B publishes a prebuilt template per agent, each with the CLI installed.
// Template names, env vars and headless invocations below were taken from
// e2b.dev/docs/agents/<agent> — not guessed.
//
// Availability: every agent except OpenCode needs its vendor's own API key.
// OpenCode is the exception and the default, because its Zen models work with
// NO credentials at all — verified in a sandbox (`opencode auth list` reports
// 0 credentials and the task still completes). That matters here because every
// vendor key in this deployment's .env is currently a `****` placeholder.
//
// The `--dangerously-*` / `--full-auto` style flags are what put these CLIs in
// non-interactive mode. They are only acceptable because the process is inside
// a disposable E2B sandbox with no access to our infrastructure.
// ---------------------------------------------------------------------------

export interface AgentDefinition {
  id: string;
  label: string;
  /** E2B prebuilt template that has this agent installed. */
  template: string;
  /** Vendor API key required, or null when the agent needs none. */
  requiredEnv: string | null;
  /**
   * Env that redirects this agent at Flare's own gateway instead of its
   * vendor. Only defined for agents actually verified to work that way —
   * an agent with this set needs no vendor key at all.
   */
  flareEnvs?: (apiKey: string, model?: string) => Record<string, string>;
  /** Optional model ids the agent accepts (OpenCode Zen free tier). */
  models?: { id: string; label: string }[];
  defaultModel?: string;
  /** Build the headless shell command for a task. */
  command: (task: string, model?: string) => string;
  description: string;
}

/** Single-quote a value for safe shell interpolation. */
const q = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`;

export const AGENTS: AgentDefinition[] = [
  {
    id: "opencode",
    label: "OpenCode",
    template: "opencode",
    requiredEnv: null,
    description: "Free — no API key needed. Default.",
    models: [
      { id: "opencode/deepseek-v4-flash-free", label: "DeepSeek V4 Flash" },
      { id: "opencode/mimo-v2.5-free", label: "MiMo V2.5" },
      { id: "opencode/nemotron-3-ultra-free", label: "Nemotron 3 Ultra" },
      { id: "opencode/north-mini-code-free", label: "North Mini Code" },
      { id: "opencode/big-pickle", label: "Big Pickle" },
    ],
    defaultModel: "opencode/deepseek-v4-flash-free",
    command: (task, model) =>
      // Model is client-supplied: it MUST be single-quoted like the task.
      // (Unquoted interpolation here was a shell-injection vector.)
      `opencode run${model ? ` --model ${q(model)}` : ""} ${q(task)}`,
  },
  {
    id: "claude-code",
    label: "Claude Code",
    template: "claude",
    requiredEnv: "ANTHROPIC_API_KEY",
    // Bifrost exposes an Anthropic-shaped API at /anthropic/v1, and Claude
    // Code honours ANTHROPIC_BASE_URL — verified end-to-end in a sandbox, no
    // Anthropic key involved. Note the model id has NO provider prefix on
    // this endpoint (`deepseek-v4-flash-free`, not `opencode-zen/...`).
    flareEnvs: (apiKey, model) => {
      const m = model || FLARE_DEFAULT_MODEL;
      return {
        ANTHROPIC_BASE_URL: FLARE_ANTHROPIC_BASE_URL,
        ANTHROPIC_API_KEY: apiKey,
        ANTHROPIC_AUTH_TOKEN: apiKey,
        ANTHROPIC_MODEL: m,
        // Claude Code uses a separate "small/fast" model for cheap internal
        // steps; leaving it on a model the gateway cannot serve makes those
        // steps fail even when the main model is fine.
        ANTHROPIC_SMALL_FAST_MODEL: m,
      };
    },
    description: "Runs on the Flare gateway — no Anthropic key needed.",
    command: (task) => `claude --dangerously-skip-permissions -p ${q(task)}`,
  },
  {
    id: "codex",
    label: "Codex",
    template: "codex",
    requiredEnv: "CODEX_API_KEY",
    // Cannot run on Flare: Codex talks to OpenAI's Responses API over a
    // websocket (wss://api.openai.com/v1/responses) and ignores
    // OPENAI_BASE_URL for it. A custom provider with `wire_api = "chat"` is
    // rejected outright — "no longer supported, set wire_api = responses".
    // Bifrost speaks chat-completions, so this needs a vendor key.
    description: "OpenAI's coding agent. Needs an OpenAI key.",
    command: (task) =>
      `codex exec --full-auto --skip-git-repo-check ${q(task)}`,
  },
  {
    id: "amp",
    label: "Amp",
    template: "amp",
    requiredEnv: "AMP_API_KEY",
    description: "Sourcegraph Amp.",
    command: (task) => `amp --dangerously-allow-all -x ${q(task)}`,
  },
  {
    id: "grok",
    label: "Grok Build",
    template: "grok",
    requiredEnv: "XAI_API_KEY",
    description: "xAI's coding agent.",
    command: (task) => `grok --always-approve -p ${q(task)}`,
  },
  {
    id: "droid",
    label: "Droid",
    template: "droid",
    requiredEnv: "FACTORY_API_KEY",
    description: "Factory's coding agent.",
    command: (task) => `droid exec --auto low ${q(task)}`,
  },
];

/** Flare's Anthropic-compatible gateway route. */
export const FLARE_ANTHROPIC_BASE_URL =
  process.env.FLARE_ANTHROPIC_BASE_URL || "https://api.flare-sh.tech/anthropic";

/** Model id as named on the Anthropic-shaped endpoint (no provider prefix). */
export const FLARE_DEFAULT_MODEL =
  process.env.FLARE_AGENT_MODEL || "deepseek.v3.2";

const flareKey = (): string | null => {
  const v = process.env.FLARE_API_KEY?.trim();
  return v && v !== "****" ? v : null;
};

/** True when this agent can run on Flare instead of its vendor. */
export const usesFlare = (a: AgentDefinition): boolean =>
  Boolean(a.flareEnvs && flareKey());

export const DEFAULT_AGENT_ID = "opencode";

export const getAgent = (id?: string | null): AgentDefinition =>
  AGENTS.find((a) => a.id === id) ??
  AGENTS.find((a) => a.id === DEFAULT_AGENT_ID)!;

/** A vendor key counts as configured only if it is non-empty and not a placeholder. */
const hasKey = (name: string): boolean => {
  const v = process.env[name]?.trim();
  return Boolean(v) && v !== "****";
};

export const isAgentAvailable = (a: AgentDefinition): boolean =>
  a.requiredEnv === null || usesFlare(a) || hasKey(a.requiredEnv);

/**
 * Env passed into the sandbox for this agent.
 *
 * Flare is preferred over a vendor key when the agent supports it: it costs
 * nothing extra, keeps traffic on our own gateway, and works on deployments
 * that have no vendor credentials at all.
 */
export const agentEnvs = (
  a: AgentDefinition,
  model?: string,
): Record<string, string> => {
  const key = flareKey();
  if (a.flareEnvs && key) return a.flareEnvs(key, model);
  if (a.requiredEnv && hasKey(a.requiredEnv)) {
    return { [a.requiredEnv]: process.env[a.requiredEnv]! };
  }
  return {};
};

/**
 * Models the Flare gateway can serve, as named on the Anthropic-shaped
 * endpoint (no provider prefix — that form is what Claude Code accepts).
 *
 * Fetched from the gateway so the list tracks reality instead of drifting,
 * with a short cache because the picker is opened often, and a static
 * fallback so a gateway blip degrades to a usable list rather than none.
 */
const FLARE_MODEL_FALLBACK = [
  "deepseek.v3.2",
  "deepseek.v3.1",
  "zai.glm-5",
  "openai.gpt-oss-120b",
  "qwen.qwen3-coder-next",
];

const MODEL_CACHE_TTL_MS = 5 * 60_000;
let modelCache: { at: number; ids: string[] } | null = null;

const prettify = (id: string) =>
  id
    .replace(/-free$/, "")
    .split(/[-_]/)
    .map((t) =>
      /^v?\d/.test(t)
        ? t.toUpperCase()
        : t.charAt(0).toUpperCase() + t.slice(1),
    )
    .join(" ");

export const listFlareModels = async (
  /** Skip the cache — used when the client is actively polling the picker. */
  fresh = false,
): Promise<{ id: string; label: string }[]> => {
  const key = flareKey();
  if (!key) return [];
  if (!fresh && modelCache && Date.now() - modelCache.at < MODEL_CACHE_TTL_MS) {
    return modelCache.ids.map((id) => ({ id, label: prettify(id) }));
  }
  let ids = FLARE_MODEL_FALLBACK;
  try {
    const res = await fetch(`${FLARE_ANTHROPIC_BASE_URL}/v1/models`, {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: { id?: string }[] };
      const fetched = (json.data ?? [])
        .map((m) => m.id)
        .filter(Boolean) as string[];
      if (fetched.length) ids = fetched;
    }
  } catch {
    // Fall back to the static list; an unreachable gateway should not empty
    // the model picker.
  }
  modelCache = { at: Date.now(), ids };
  return ids.map((id) => ({ id, label: prettify(id) }));
};

/** Serialisable catalogue for the client — never includes key values. */
export const listAgentsForClient = async (fresh = false) => {
  // Agents running on Flare pick from the gateway's models; agents on their
  // own vendor keep whatever list they declare (OpenCode's Zen models).
  const flareModels = AGENTS.some((a) => usesFlare(a))
    ? await listFlareModels(fresh)
    : [];

  return AGENTS.map((a) => {
    const viaFlare = usesFlare(a);
    const models =
      viaFlare && flareModels.length ? flareModels : (a.models ?? []);
    return {
      id: a.id,
      label: a.label,
      description: a.description,
      available: isAgentAvailable(a),
      // Surfaced so the UI can say *why* an agent is usable.
      viaFlare,
      requiredEnv: a.requiredEnv,
      models,
      defaultModel: viaFlare
        ? (models[0]?.id ?? FLARE_DEFAULT_MODEL)
        : (a.defaultModel ?? null),
    };
  });
};
