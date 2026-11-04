import "server-only";

import { google } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { LanguageModelV2, createOpenRouter } from "@openrouter/ai-sdk-provider";
import { LanguageModel, wrapLanguageModel } from "ai";
import { ChatModel } from "app-types/chat";
import {
  createOpenAICompatibleModels,
  openaiCompatibleModelsSafeParse,
} from "./create-openai-compatiable";
import {
  DEFAULT_FILE_PART_MIME_TYPES,
  GEMINI_FILE_MIME_TYPES,
} from "./file-support";

// Collect all OpenRouter API keys (OPENROUTER_API_KEY, OPENROUTER_API_KEY_2, etc.)
function getOpenRouterApiKeys(): string[] {
  const keys: string[] = [];

  // Primary key
  if (
    process.env.OPENROUTER_API_KEY &&
    process.env.OPENROUTER_API_KEY !== "****"
  ) {
    keys.push(process.env.OPENROUTER_API_KEY);
  }

  // Fallback keys (OPENROUTER_API_KEY_2, OPENROUTER_API_KEY_3, etc.)
  for (let i = 2; i <= 10; i++) {
    const key = process.env[`OPENROUTER_API_KEY_${i}`];
    if (key && key !== "****") {
      keys.push(key);
    }
  }

  return keys;
}

// OpenRouter key management
const openRouterApiKeys = getOpenRouterApiKeys();
let currentKeyIndex = 0;

// Get current OpenRouter API key
function getCurrentOpenRouterKey(): string | undefined {
  if (openRouterApiKeys.length === 0) return undefined;
  return openRouterApiKeys[currentKeyIndex % openRouterApiKeys.length];
}

// Rotate to next key - export for error handlers to use
export function rotateOpenRouterKey(): boolean {
  if (openRouterApiKeys.length > 1) {
    currentKeyIndex = (currentKeyIndex + 1) % openRouterApiKeys.length;
    console.log(
      `[OpenRouter] Rotated to key index: ${currentKeyIndex} (${openRouterApiKeys.length} keys available)`,
    );
    return true;
  }
  return false;
}

// Check if error is a rate limit error
export function isRateLimitError(error: any): boolean {
  if (!error) return false;
  const message = error?.message?.toLowerCase() || "";
  const statusCode =
    error?.status || error?.statusCode || error?.response?.status;

  return (
    statusCode === 429 ||
    message.includes("rate limit") ||
    message.includes("rate_limit") ||
    message.includes("too many requests") ||
    message.includes("quota exceeded") ||
    message.includes("429")
  );
}

// Get number of available OpenRouter keys
export function getOpenRouterKeyCount(): number {
  return openRouterApiKeys.length;
}

// Create OpenRouter provider dynamically (uses current key)
function createOpenRouterProvider() {
  return createOpenRouter({
    apiKey: getCurrentOpenRouterKey(),
  });
}

// Create OpenRouter model dynamically - this ensures we use the current key after rotation
export function getOpenRouterModel(modelId: string): LanguageModel {
  const provider = createOpenRouterProvider();
  return provider(modelId);
}

// Default OpenRouter provider (for backward compatibility)

const groq = createGroq({
  baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
});

/**
 * Custom fetch wrapper that normalizes streaming responses from OpenAI-compatible APIs.
 * Some APIs don't include the required 'index' field in tool_calls, which causes
 * AI SDK validation errors. This wrapper adds the missing index field.
 */
const normalizeToolCallsFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);

  const contentType = response.headers.get("content-type") || "";

  // Normalize non-standard error responses (e.g., {"error":"string"} → proper Error)
  // Some upstream providers return {"error": "message"} instead of standard OpenAI error format
  if (contentType.includes("application/json")) {
    try {
      const clone = response.clone();
      const data = await clone.json();
      if (data && typeof data === "object" && "error" in data) {
        const error = data.error;
        if (typeof error === "string") {
          throw new Error(`Provider Error: ${error}`);
        }
      }
    } catch (e: any) {
      if (e.message && e.message.startsWith("Provider Error:")) {
        throw e;
      }
      // Ignore JSON parsing errors, let SDK handle the response
    }
  }

  // Only process streaming responses
  if (!contentType.includes("text/event-stream") || !response.body) {
    return response;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const transformedStream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      // Some gateways (e.g. Bifrost -> Bedrock) never close the SSE body:
      // they stream the content chunk (with finish_reason), a usage chunk,
      // then keep the connection alive with `: heartbeat` comments forever,
      // never sending `data: [DONE]`. The AI SDK waits for stream end
      // before emitting `finish`, so without terminating here the chat
      // response hangs after the last token. Close shortly after a
      // finish_reason chunk once the trailing usage chunk has been read.
      let finished = false;
      let postFinishLines = 0;

      // DeepSeek V3.x models sometimes emit native tool calls using their
      // own DSML markup as plain text instead of OpenAI tool_call deltas:
      //   <｜DSML｜function_calls>
      //     <｜DSML｜invoke name="tool">
      //       <｜DSML｜parameter name="x">v</｜DSML｜parameter>
      //     </｜DSML｜invoke>
      //   </｜DSML｜function_calls>
      // Convert those blocks into real tool_calls so tools execute and no
      // raw markup leaks into the chat transcript.
      const DSML_START = "<\uFF5CDSML\uFF5Cfunction_calls";
      const DSML_END = "</\uFF5CDSML\uFF5Cfunction_calls>";
      let dsmlMode: string = "text";
      let dsmlCapture = "";
      let dsmlHold = "";
      let emittedDsmlToolCalls = false;

      const partialSuffixLen = (s: string, marker: string) => {
        for (let k = Math.min(marker.length - 1, s.length); k > 0; k--) {
          if (s.endsWith(marker.slice(0, k))) return k;
        }
        return 0;
      };

      const emitSyntheticToolCalls = (block: string) => {
        const invokes = [
          ...block.matchAll(
            /<\uFF5CDSML\uFF5Cinvoke name="([^"]+)">([\s\S]*?)<\/\uFF5CDSML\uFF5Cinvoke>/g,
          ),
        ];
        if (!invokes.length) return;
        const toolCalls = invokes.map((m, i) => {
          const args: Record<string, string> = {};
          for (const pm of m[2].matchAll(
            /<\uFF5CDSML\uFF5Cparameter name="([^"]+)">([\s\S]*?)<\/\uFF5CDSML\uFF5Cparameter>/g,
          )) {
            args[pm[1]] = pm[2];
          }
          return {
            index: i,
            id: `call_dsml_${Date.now()}_${i}`,
            type: "function",
            function: { name: m[1], arguments: JSON.stringify(args) },
          };
        });
        emittedDsmlToolCalls = true;
        controller.enqueue(
          encoder.encode(
            "data: " +
              JSON.stringify({
                choices: [
                  {
                    index: 0,
                    delta: { tool_calls: toolCalls },
                    finish_reason: null,
                  },
                ],
              }) +
              "\n",
          ),
        );
      };

      const processDsmlText = (chunk: string): string => {
        let s = dsmlHold + chunk;
        dsmlHold = "";
        let out = "";
        while (s.length > 0) {
          if (dsmlMode === "text") {
            const idx = s.indexOf(DSML_START);
            if (idx >= 0) {
              out += s.slice(0, idx);
              dsmlMode = "capture";
              dsmlCapture = "";
              s = s.slice(idx + DSML_START.length);
            } else {
              const hold = partialSuffixLen(s, DSML_START);
              out += s.slice(0, s.length - hold);
              dsmlHold = s.slice(s.length - hold);
              s = "";
            }
          } else {
            const endIdx = s.indexOf(DSML_END);
            if (endIdx >= 0) {
              dsmlCapture += s.slice(0, endIdx);
              emitSyntheticToolCalls(dsmlCapture);
              dsmlMode = "text";
              s = s.slice(endIdx + DSML_END.length);
            } else {
              dsmlCapture += s;
              s = "";
            }
          }
        }
        return out;
      };

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            // Flush any remaining buffer content
            if (buffer.trim()) {
              controller.enqueue(encoder.encode(buffer + "\n"));
            }
            controller.close();
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");

          // Keep incomplete line in buffer
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ") || line === "data: [DONE]") {
              controller.enqueue(encoder.encode(line + "\n"));
              continue;
            }

            try {
              const jsonStr = line.slice(6); // Remove "data: " prefix
              const data = JSON.parse(jsonStr);

              // Detect error objects embedded in the stream
              // Some providers return 200 OK with data: {"error": {...}} in the SSE stream
              if (data.error && !data.choices) {
                const errorMsg =
                  typeof data.error === "string"
                    ? data.error
                    : data.error.message || JSON.stringify(data.error);
                controller.error(new Error(`Provider Error: ${errorMsg}`));
                return; // Stop processing the stream
              }

              if (data.choices) {
                for (const choice of data.choices) {
                  const deltaContent = choice.delta?.content;
                  if (typeof deltaContent === "string") {
                    const cleaned = processDsmlText(deltaContent);
                    if (cleaned.length === 0) {
                      delete choice.delta.content;
                    } else if (cleaned !== deltaContent) {
                      choice.delta.content = cleaned;
                    }
                  }
                }
              }

              // Normalize tool_calls by adding missing index field
              if (data.choices) {
                for (const choice of data.choices) {
                  if (choice.delta?.tool_calls) {
                    choice.delta.tool_calls = choice.delta.tool_calls.map(
                      (tc: any, i: number) => ({
                        index: tc.index ?? i,
                        ...tc,
                      }),
                    );
                  }
                }
                const finishReason = data.choices[0]?.finish_reason;
                if (finishReason) {
                  if (dsmlMode === "capture" && dsmlCapture.trim()) {
                    emitSyntheticToolCalls(dsmlCapture);
                  }
                  dsmlMode = "text";
                  dsmlCapture = "";
                  if (emittedDsmlToolCalls && finishReason === "stop") {
                    data.choices[0].finish_reason = "tool_calls";
                  }
                  finished = true;
                }
              }

              controller.enqueue(
                encoder.encode("data: " + JSON.stringify(data) + "\n"),
              );

              // The finish chunk may already carry the usage payload
              // (e.g. Bifrost sends finish_reason and usage in the same
              // final chunk). That chunk is then terminal: no further
              // data: line follows, only heartbeat comments. Close
              // immediately in that case instead of waiting for a
              // trailing usage chunk that never arrives, otherwise the
              // response hangs after the last token.
              const hasUsage = !!data.usage;
              if (finished && (hasUsage || ++postFinishLines >= 2)) {
                controller.close();
                try {
                  await reader.cancel();
                } catch {
                  // Ignore cancel errors; the stream is being torn down.
                }
                return; // Stop processing the stream
              }
            } catch {
              // If JSON parsing fails, pass through the original line
              controller.enqueue(encoder.encode(line + "\n"));
            }
          }
        }
      } catch (err) {
        // Signal errors properly so the stream doesn't hang
        controller.error(err);
      }
    },
  });

  return new Response(transformedStream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};

// `perplexity` is mis-named historically — the base URL points at Nvidia's
// build catalog (`integrate.api.nvidia.com`). Fall back to NVIDIA_API_KEY
// when PERPLEXITY_API_KEY is unset so that google/anthropic/openai models
// routed through this provider keep working without two env vars.
const perplexity = createOpenAICompatible({
  name: "perplexity",
  apiKey:
    process.env.PERPLEXITY_API_KEY || process.env.NVIDIA_API_KEY || undefined,
  baseURL: "https://integrate.api.nvidia.com/v1",
});

const parallel = createOpenAICompatible({
  name: "parallel",
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: "https://cloud.flare-sh.tech/ai-api-backend/v1",
  headers: {
    Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
    "X-API-Key": process.env.NVIDIA_API_KEY || "",
  },
  fetch: normalizeToolCallsFetch,
});

const zai = createOpenAICompatible({
  name: "zai",
  apiKey: process.env.ZAI_API_KEY,
  baseURL: process.env.ZAI_BASE_URL || "https://api.z-ai.io/v1",
  fetch: normalizeToolCallsFetch,
});

const flare = createOpenAICompatible({
  name: "flare",
  apiKey: process.env.FLARE_API_KEY || process.env.KORE_API_KEY || undefined,
  baseURL: "https://api.flare-sh.tech/v1",
  headers: {
    // Optional: set FLARE_ORIGIN to override the default. The api.flare-sh.tech
    // gateway doesn't require an Origin header, so we only send one when set.
    ...(process.env.FLARE_ORIGIN && { Origin: process.env.FLARE_ORIGIN }),
    ...(process.env.FLARE_REFERER && { Referer: process.env.FLARE_REFERER }),
  },
  fetch: normalizeToolCallsFetch,
});

/**
 * Build the Flare provider's model map dynamically from
 * `${FLARE_BASE_URL}/v1/models`. The api.flare-sh.tech gateway exposes
 * whatever models are currently routed through it, so the model picker in
 * the UI stays in sync without redeploying the app.
 *
 * Results are cached in-memory for 5 minutes to avoid hitting the gateway
 * on every request, and deduped by model id (the gateway returns both
 * `claude-opus-4-6` and `claude-opus-4.6` for the same model, etc.).
 */
const FLARE_LIST_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedFlareModels: {
  fetchedAt: number;
  map: Record<string, ReturnType<typeof flare>>;
} | null = null;

const dedupeFlareIds = (ids: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    // Normalize `claude-opus-4-6` and `claude-opus-4.6` to the same key.
    const key = id.replace(/\./g, "-").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
};

const prettifyFlareName = (id: string): string => {
  // Strip provider prefix (everything before and including `/`)
  // e.g. `flare/openai.gpt-oss-120b` -> `openai.gpt-oss-120b`,
  // `zen/deepseek-v4-flash-free` -> `deepseek-v4-flash-free`
  const stripped = id.includes("/") ? id.slice(id.indexOf("/") + 1) : id;
  // Hide the free tag: `deepseek-v4-flash-free` -> `deepseek-v4-flash`
  const noFreeTag = stripped.endsWith("-free")
    ? stripped.slice(0, -"-free".length)
    : stripped;
  // Subprovider separator is the first dot ONLY if it comes before any
  // hyphen (`openai.gpt-oss-120b` -> `openai/gpt-oss-120b`). Dots after the
  // first hyphen are part of the model name and kept as-is
  // (`laguna-s-2.1` -> `laguna/s-2.1`, `mimo-v2.5` -> `mimo/v2.5`).
  const dotIdx = noFreeTag.indexOf(".");
  const hyphenIdx = noFreeTag.indexOf("-");
  if (dotIdx !== -1 && (hyphenIdx === -1 || dotIdx < hyphenIdx)) {
    return `${noFreeTag.slice(0, dotIdx)}/${noFreeTag.slice(dotIdx + 1)}`;
  }
  // No qualifying dot (e.g. free zen ids): split on the first token
  // `deepseek-v4-flash` -> `deepseek/v4-flash`, `hy3` -> `hy3`
  const tokens = noFreeTag.split("-");
  if (tokens.length > 1) {
    const rest = tokens.slice(1).join("-");
    return rest ? `${tokens[0]}/${rest}` : noFreeTag;
  }
  return noFreeTag;
};

const buildFlareModels = async (
  flareProvider: ReturnType<typeof createOpenAICompatible>,
): Promise<Record<string, ReturnType<typeof flareProvider>>> => {
  if (
    cachedFlareModels &&
    Date.now() - cachedFlareModels.fetchedAt < FLARE_LIST_CACHE_TTL_MS
  ) {
    return cachedFlareModels.map;
  }
  const baseURL =
    (flareProvider as any).baseURL || "https://api.flare-sh.tech/v1";
  const apiKey =
    process.env.FLARE_API_KEY || process.env.KORE_API_KEY || undefined;
  if (!apiKey) {
    return {};
  }
  try {
    const res = await fetch(`${baseURL.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { data?: Array<{ id: string }> };
    const ids = dedupeFlareIds(
      (json.data || [])
        .map((m) => m.id)
        .filter(Boolean)
        .filter((id) => !id.startsWith("zen/") || id.endsWith("-free")),
    );
    const map: Record<string, ReturnType<typeof flareProvider>> = {};
    for (const id of ids) {
      map[prettifyFlareName(id)] = flareProvider(id);
    }
    cachedFlareModels = { fetchedAt: Date.now(), map };
    return map;
  } catch (err) {
    console.warn(
      "[flare] failed to fetch /v1/models, returning empty list",
      err,
    );
    return cachedFlareModels?.map ?? {};
  }
};

const xai = createOpenAICompatible({
  name: "xai",
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.fireworks.ai/inference/v1",
  fetch: normalizeToolCallsFetch,
});

const staticModels = {
  google: {
    "Gemini 3 Flash": perplexity("gemini-3-flash-preview"),
    "Gemini 3.1 Pro": parallel("gemini-3.1-pro-low"),
    "Gemma 4 31B": google("gemma-4-31b-it"),
    "Gemma 4 26B": google("gemma-4-26b-a4b-it"),
  },
  groq: {
    "Llama 3.3 70b Versatile": groq("llama-3.3-70b-versatile"),
    "Llama 4 17b Scout": groq("meta-llama/llama-4-scout-17b-16e-instruct"),
    "Llama 3.1 8b Instant": groq("llama-3.1-8b-instant"),
    "Groq Compound": groq("groq/compound"),
    "Groq Compound Mini": groq("groq/compound-mini"),
  },
  perplexity: {
    Sonar: groq("groq/compound"),
  },
  anthropic: {
    "Claude Opus 4.7": parallel("anthropic/claude-opus-4.7"),
    "Claude Opus 4.6": parallel("anthropic/claude-opus-4.6"),
    "Claude Opus 4.5": parallel("anthropic/claude-opus-4.6"),
  },
  openai: {
    "GPT 5.5": parallel("openai/gpt-5.5"),
    "GPT 5.4": parallel("openai/gpt-5.4"),
  },
  Qwen: {
    "Qwen 3 32B": groq("qwen/qwen3-32b"),
    "Qwen 3.6 Plus": xai("accounts/fireworks/models/qwen3p6-plus"),
  },
  "KonvO AI": {
    "KonvO M": perplexity("konvoai/konvo-m"),
    "KonvO 105b": parallel("konvoai/konvo-105b"),
    "KonvO 30b": parallel("konvoai/konvo-30b"),
  },
  Nvidia: {
    "Nemotron 3 Super": xai(
      "accounts/fireworks/models/nvidia-nemotron-3-super-120b-a12b-nvfp4",
    ),
    "Nemotron 3 Omni": xai(
      "accounts/fireworks/models/nvidia-nemotron-3-nano-omni-30b-a3b",
    ),
    "Nemotron 3 Nano Omni": perplexity(
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    ),
  },
  // Deepseek: disabled — use Flare provider models from api.flare-sh.tech instead
  Moonshot: {
    "Kimi K2.6": xai("accounts/fireworks/models/kimi-k2p6"),
    "Kimi K2.5": perplexity("moonshotai/kimi-k2.6"),
    "Kimi K2 Thinking": xai("accounts/fireworks/models/kimi-k2-thinking"),
  },
  MiniMax: {
    "MiniMax M 2.7": xai("accounts/fireworks/models/minimax-m2p7"),
    "MiniMax M 2.5": xai("accounts/fireworks/models/minimax-m2p5"),
    "MiniMax M 2.1": xai("accounts/fireworks/models/minimax-m2p1"),
  },
  zAI: {
    "GLM 5.1": zai("glm-5.1"),
    "GLM 5": zai("glm-5"),
    "GLM 4.7": zai("glm-4.7"),
  },
  flare: await buildFlareModels(flare),
};

const staticUnsupportedModels = new Set(
  [
    staticModels["KonvO AI"]["KonvO M"],
    staticModels.groq["Groq Compound"],
    staticModels.perplexity.Sonar,
    staticModels.groq["Groq Compound Mini"],
    staticModels.groq["Llama 3.3 70b Versatile"],
    staticModels.groq["Llama 3.1 8b Instant"],
  ].filter(Boolean),
);

// Models routed through the BlackBox API (parallel provider)
const staticBlackboxModels = new Set<LanguageModelV2>(
  [
    // Google models via parallel
    staticModels.google["Gemini 2.5 Pro"],
    staticModels.google["Gemini 3 Pro Thinking"],
    staticModels.google["Gemini 3 Pro"],
    // Anthropic models via parallel/openrouter with blackboxai prefix
    staticModels.anthropic["Claude Opus 4.6"],
    staticModels.anthropic["Claude Sonnet 4"],
    staticModels.anthropic["Claude Sonnet 4.5"],
    staticModels.anthropic["Claude Sonnet 4.6"],
    // OpenAI models via parallel
    staticModels.openai["GPT 5.3 Codex"],
    staticModels.openai["GPT 5.2"],
  ].filter(Boolean),
);

const staticSupportImageInputModels = new Set<LanguageModelV2>([
  ...Object.values(staticModels.google),
  ...Object.values(staticModels.anthropic),
  ...Object.values(staticModels.openai),
  ...Object.values(staticModels.groq),
  ...Object.values(staticModels.Qwen),
  ...Object.values(staticModels.Nvidia),
]);

const staticFilePartSupportByModel = new Map<
  LanguageModel,
  readonly string[]
>();

const registerFileSupport = (
  model: LanguageModel | undefined,
  mimeTypes: readonly string[] = DEFAULT_FILE_PART_MIME_TYPES,
) => {
  if (!model) return;
  staticFilePartSupportByModel.set(model, Array.from(mimeTypes));
};

// Register file support for all providers with image-capable models.
//
// Flare resolves known model names through Flare first (see
// `resolveModel`) so a request for `provider: "google", model:
// "Gemini 3 Flash"` returns the Flare-backed model object when that
// alias exists. Register Gemini file support on both the canonical
// Google model objects and the Flare Gemini aliases so runtime model
// resolution and UI metadata stay consistent.
const providersWithFileSupport = [
  { models: staticModels.google, mimeTypes: GEMINI_FILE_MIME_TYPES },
  { models: staticModels.anthropic, mimeTypes: DEFAULT_FILE_PART_MIME_TYPES },
  { models: staticModels.openai, mimeTypes: DEFAULT_FILE_PART_MIME_TYPES },
  { models: staticModels.groq, mimeTypes: DEFAULT_FILE_PART_MIME_TYPES },
  { models: staticModels.Qwen, mimeTypes: DEFAULT_FILE_PART_MIME_TYPES },
  { models: staticModels.Nvidia, mimeTypes: DEFAULT_FILE_PART_MIME_TYPES },
];

providersWithFileSupport.forEach(({ models, mimeTypes }) => {
  Object.values(models).forEach((model) => {
    registerFileSupport(model, mimeTypes);
  });
});

Object.entries(staticModels.flare)
  .filter(([name]) => /gemini/i.test(name))
  .forEach(([, model]) => {
    registerFileSupport(model, GEMINI_FILE_MIME_TYPES);
  });

const openaiCompatibleProviders = openaiCompatibleModelsSafeParse(
  process.env.OPENAI_COMPATIBLE_DATA,
);

const {
  providers: openaiCompatibleModels,
  unsupportedModels: openaiCompatibleUnsupportedModels,
} = createOpenAICompatibleModels(openaiCompatibleProviders);

const allModels = { ...openaiCompatibleModels, ...staticModels };

// Refresh Flare gateway models every 15 seconds so new models pushed to the
// gateway appear in the model picker without a restart.
setInterval(() => {
  (async () => {
    try {
      cachedFlareModels = null;
      const models = await buildFlareModels(flare);
      staticModels.flare = models;
      allModels.flare = models;
    } catch {
      // keep last known models
    }
  })();
}, 15_000);
// REFRESH_15S

const allUnsupportedModels = new Set([
  ...openaiCompatibleUnsupportedModels,
  ...staticUnsupportedModels,
]);

export const isToolCallUnsupportedModel = (model: LanguageModel) => {
  return allUnsupportedModels.has(model);
};

const isImageInputUnsupportedModel = (model: LanguageModelV2) => {
  return !staticSupportImageInputModels.has(model);
};

export const supportsNativeImageInput = (model: LanguageModel) => {
  return staticSupportImageInputModels.has(model as LanguageModelV2);
};

export const getFilePartSupportedMimeTypes = (model: LanguageModel) => {
  return staticFilePartSupportByModel.get(model) ?? [];
};

const hiddenFailureFallbackModel = flare("bedrock_mantle/deepseek.v3.2");

// All model fallbacks -> Flare DeepSeek V4 Flash
const glm5FallbackModel = flare("bedrock_mantle/deepseek.v3.2");

/**
 /**
 * Resolve the "no model selected / unknown model" fallback lazily so the
 * Flare dynamic registry (populated asynchronously at boot) is preferred
 * when it has any models. Always uses the first available Flare model;
 * falls back to DeepSeek V4 Flash if none are registered.
 */
const resolveFallbackModel = (): LanguageModel => {
  const flareEntries = Object.values(allModels.flare ?? {});
  if (flareEntries.length > 0) {
    return flareEntries[0]!;
  }
  return hiddenFailureFallbackModel;
};
const llama4ScoutFallbackModel = flare("bedrock_mantle/deepseek.v3.2");

// ---------------------------------------------------------------------------
// Admin-configurable fallback chain (set via setAdminFallbackChain)
// ---------------------------------------------------------------------------

export interface AdminFallbackEntry {
  provider: string;
  model: string;
}

/**
 * In-memory cache of the admin-configured fallback chain per primary provider.
 * Updated via `setAdminFallbackChain` (called by the config save API).
 * Falls back to empty array if not set — runtime uses heuristic defaults.
 */
const adminFallbackChainMap = new Map<string, AdminFallbackEntry[]>();

/**
 * Set the admin-configured fallback chain for a given provider.
 * Called by `/api/admin/config` after saving model config.
 */
export function setAdminFallbackChain(
  provider: string,
  chain: AdminFallbackEntry[],
) {
  if (chain.length === 0) {
    adminFallbackChainMap.delete(provider);
  } else {
    adminFallbackChainMap.set(provider, chain);
  }
}

/**
 * Get the admin-configured fallback chain for a provider.
 * Returns empty array if none is configured — caller falls back to heuristic defaults.
 */
export function getAdminFallbackChain(provider: string): AdminFallbackEntry[] {
  return adminFallbackChainMap.get(provider) ?? [];
}

// ---------------------------------------------------------------------------
// Dynamic Provider Registry
// ---------------------------------------------------------------------------

/**
 * A dynamically registered provider backed by an OpenAI-compatible API.
 * Registered providers are stored in the module-level registry and also
 * merged into `allModels` so they appear in `modelsInfo` automatically.
 */
export type DynamicProvider = {
  baseURL: string;
  apiKey: string;
  models: { name: string; apiModelId: string }[];
};

/** Module-level registry of dynamically registered providers. */
const dynamicProviderRegistry = new Map<string, DynamicProvider>();

/**
 * Register a dynamic provider. The provider is stored in the registry and
 * merged into `allModels` so it appears in `modelsInfo`.
 */
export function registerDynamicProvider(
  id: string,
  baseURL: string,
  apiKey: string,
  models: { name: string; apiModelId: string }[],
): void {
  dynamicProviderRegistry.set(id, { baseURL, apiKey, models });

  const customProvider = createOpenAICompatible({
    name: id,
    apiKey,
    baseURL,
    fetch: normalizeToolCallsFetch,
  });

  const providerModels: Record<string, LanguageModel> = {};
  for (const m of models) {
    try {
      providerModels[m.name] = customProvider(m.apiModelId);
    } catch {
      // Skip model names that fail to instantiate
    }
  }

  // Merge into allModels so dynamic models show up in modelsInfo automatically
  allModels[id] = providerModels;
}

/** Remove a previously registered dynamic provider. */
export function unregisterDynamicProvider(id: string): void {
  dynamicProviderRegistry.delete(id);
  delete allModels[id];
}

/** Returns the model list for a registered dynamic provider, or undefined. */
export function getDynamicProviderModels(
  id: string,
): { name: string; apiModelId: string }[] | undefined {
  return dynamicProviderRegistry.get(id)?.models;
}

/** Returns all registered dynamic provider IDs. */
export function getAllDynamicProviderIds(): string[] {
  return Array.from(dynamicProviderRegistry.keys());
}

/**
 * Decrypts an encrypted API key produced by `encrypt()` in
 * `src/lib/security/encryption.ts` (AES-256-GCM).
 *
 * Kept local to this module to avoid an `encryption.ts` import cycle (that
 * module pulls in `node:crypto`, which Next.js can bundle into the runtime
 * registry already; doing the decrypt here lets us hydrate dynamic providers
 * lazily without a static dependency on `lib/security/encryption`).
 */
// `node:crypto` is loaded via a dynamic require so webpack's static analysis
// can't pull it into the client bundle. The function is only ever called from
// server code paths (hydrating admin-configured dynamic providers), and the
// require is a no-op outside a Node.js runtime.
let _createDecipheriv: any = null;
function createDecipherivLazy(): any {
  if (_createDecipheriv) return _createDecipheriv;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  _createDecipheriv = require("node:crypto").createDecipheriv;
  return _createDecipheriv;
}

function decryptProviderApiKey(encryptedBase64: string): string | null {
  try {
    if (!encryptedBase64 || typeof encryptedBase64 !== "string") return null;
    const masterKey = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKey || masterKey.length !== 32) return null;
    const data = Buffer.from(encryptedBase64, "base64");
    if (data.length < 28) return null;
    const iv = data.subarray(0, 12);
    const tag = data.subarray(data.length - 16);
    const ciphertext = data.subarray(12, data.length - 16);
    const decipher = (createDecipherivLazy() as any)(
      "aes-256-gcm",
      Buffer.from(masterKey),
      iv,
    );
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Boot-time hydration of dynamic providers from the site config DB.
//
// The admin Models page stores dynamic providers under
// `siteConfig.models.dynamicProviders`. The runtime model registry
// (`dynamicProviderRegistry` above) is populated only by explicit calls to
// `registerDynamicProvider()`, which is fragile because nothing on the chat
// path calls it. We hydrate lazily here so admin-added providers (including
// any provider exposing a model literally named "fallback") become
// runtime-eligible the first time the fallback chain looks for them.
// ---------------------------------------------------------------------------

const DYNAMIC_HYDRATION_TTL_MS = 30_000;
let dynamicHydratedAt = 0;
let dynamicHydrationInFlight: Promise<void> | null = null;

async function hydrateDynamicProvidersFromSiteConfig(): Promise<void> {
  // Skip entirely when DB / repo is not available (e.g., during build).
  let repo: any;
  try {
    const mod = await import("lib/db/repository");
    repo = mod.siteConfigRepository;
  } catch {
    return;
  }
  if (!repo || typeof repo.getConfig !== "function") return;

  let cfg: any;
  try {
    cfg = await repo.getConfig("models");
  } catch {
    return;
  }
  const dynamicProviders = cfg?.dynamicProviders as
    | Record<string, any>
    | undefined;
  if (!dynamicProviders || typeof dynamicProviders !== "object") return;

  for (const [id, dyn] of Object.entries(dynamicProviders)) {
    if (!dyn || typeof dyn !== "object") continue;
    if (dynamicProviderRegistry.has(id)) continue;
    const baseURL = dyn.baseURL;
    const encryptedKey = dyn.apiKey;
    if (!baseURL || typeof baseURL !== "string") continue;
    const modelList = Array.isArray(dyn.models)
      ? (dyn.models as string[]).filter(
          (m) => typeof m === "string" && m.length > 0,
        )
      : [];
    if (modelList.length === 0) continue;

    let apiKey: string | undefined;
    if (encryptedKey && typeof encryptedKey === "string") {
      const decrypted = decryptProviderApiKey(encryptedKey);
      if (decrypted) apiKey = decrypted;
    }

    try {
      registerDynamicProvider(
        id,
        baseURL,
        apiKey ?? "",
        modelList.map((name) => ({
          name,
          apiModelId: name,
        })),
      );
    } catch {
      /* skip providers that fail to register */
    }
  }
}

async function ensureDynamicProvidersHydrated(): Promise<void> {
  const now = Date.now();
  if (now - dynamicHydratedAt < DYNAMIC_HYDRATION_TTL_MS) return;
  if (dynamicHydrationInFlight) {
    await dynamicHydrationInFlight;
    return;
  }
  dynamicHydrationInFlight = hydrateDynamicProvidersFromSiteConfig()
    .catch(() => undefined)
    .finally(() => {
      dynamicHydratedAt = Date.now();
      dynamicHydrationInFlight = null;
    });
  await dynamicHydrationInFlight;
}

const isClaudeOpusModel = (modelId: string) => modelId.includes("claude-opus");

const isGemini31ProModel = (modelId: string) =>
  modelId.includes("gemini-3.1-pro");

const isGeminiFlashModel = (modelId: string) =>
  modelId.includes("gemini") && modelId.includes("flash");

// Determine the right fallback for a given primary model
function getFallbackForModel(primaryModel: LanguageModelV2): LanguageModelV2 {
  const normalizedModelId = primaryModel.modelId.toLowerCase();
  const isFlare = primaryModel.provider === "flare";

  // Claude models -> GLM 5 (zai)
  if (
    isFlare &&
    (normalizedModelId.includes("claude-") ||
      normalizedModelId.includes("claude"))
  ) {
    return glm5FallbackModel as unknown as LanguageModelV2;
  }

  // Gemini, Deepseek, Qwen models -> GLM 5 (zai)
  if (
    isFlare &&
    (normalizedModelId.includes("gemini") ||
      normalizedModelId.includes("deepseek") ||
      normalizedModelId.includes("qwen"))
  ) {
    return glm5FallbackModel as unknown as LanguageModelV2;
  }

  // Llama models -> Llama 4 Scout (groq)
  if (isFlare && normalizedModelId.includes("llama")) {
    return llama4ScoutFallbackModel as unknown as LanguageModelV2;
  }

  // Mistral, Grok, Command R -> default GPT-OSS fallback
  if (isFlare) {
    return hiddenFailureFallbackModel as unknown as LanguageModelV2;
  }

  // Claude Opus + Gemini 3.1 Pro -> GLM 5
  if (
    isClaudeOpusModel(normalizedModelId) ||
    isGemini31ProModel(normalizedModelId)
  ) {
    return glm5FallbackModel as unknown as LanguageModelV2;
  }

  // Gemini Flash variants -> Llama 4 Scout
  if (isGeminiFlashModel(normalizedModelId) && llama4ScoutFallbackModel) {
    return llama4ScoutFallbackModel as unknown as LanguageModelV2;
  }

  // Everything else -> default hidden fallback
  return hiddenFailureFallbackModel as unknown as LanguageModelV2;
}

/**
 * Resolve a model whose user-facing `name` matches `name` (case-insensitive)
 * anywhere in `allModels` (Flare, static providers, dynamic providers).
 *
 * Used by the runtime fallback chain: if any model fails, the system tries a
 * model literally named "fallback" before falling back to the hidden
 * Groq GPT-OSS endpoint. Admin can register a provider with `"fallback"` in
 * its `models` list and that becomes the universal safety net.
 *
 * Returns `null` when no such model exists.
 */
function resolveModelByName(name: string): LanguageModelV2 | null {
  const target = name.trim().toLowerCase();
  if (!target) return null;
  // Fire-and-forget hydration: if a dynamic provider with the named alias
  // hasn't been registered yet (e.g., admin just saved the config), pull
  // it from the DB on the next tick so the next attempt can use it.
  void ensureDynamicProvidersHydrated();
  try {
    for (const [providerId, providerModels] of Object.entries(allModels)) {
      if (!providerModels || typeof providerModels !== "object") continue;
      for (const [modelName, model] of Object.entries(providerModels)) {
        if (modelName.trim().toLowerCase() === target) {
          return model as unknown as LanguageModelV2;
        }
      }
      // Dynamic providers may also expose the alias via the registry list
      // (e.g. admin configured a dynamic provider with "fallback" as a model
      // name but it wasn't yet merged into `allModels` for this session).
      const dp = dynamicProviderRegistry.get(providerId);
      if (dp) {
        const alias = dp.models.find(
          (m) => m.name.trim().toLowerCase() === target,
        );
        if (alias) {
          const p = createOpenAICompatible({
            name: providerId,
            apiKey: dp.apiKey,
            baseURL: dp.baseURL,
            fetch: normalizeToolCallsFetch,
          });
          return p(alias.apiModelId) as unknown as LanguageModelV2;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

const withFailureFallback = (model: LanguageModel): LanguageModel => {
  const primaryModel = model as unknown as LanguageModelV2;

  // Make sure admin-configured dynamic providers (including any provider
  // exposing a model literally named "fallback") are loaded into the
  // runtime registry before we build the fallback chain. We can't await
  // here because the AI SDK expects a synchronous model object; the
  // first attempt may race, but the second chat request will see the
  // hydrated providers.
  void ensureDynamicProvidersHydrated();

  // Get the admin-configured chain for this provider
  const adminChain = getAdminFallbackChain(primaryModel.provider);

  // Build the full fallback sequence: primary -> admin chain (in order) -> heuristic -> "fallback"-named model -> hidden
  // Each entry is a LanguageModelV2 or null
  const chain: (LanguageModelV2 | null)[] = [];

  // Add admin-configured fallbacks in order (skip if same as primary to prevent loops)
  for (const entry of adminChain) {
    const resolved = resolveModelByProviderModel(entry.provider, entry.model);
    if (
      resolved &&
      !(
        primaryModel.provider === resolved.provider &&
        primaryModel.modelId === resolved.modelId
      )
    ) {
      chain.push(resolved);
    }
  }

  // Add heuristic fallback if not already in chain and not same as primary
  const heuristicFallback = getFallbackForModel(primaryModel);
  if (
    heuristicFallback &&
    heuristicFallback.provider &&
    heuristicFallback.modelId &&
    !chain.some(
      (m) =>
        m &&
        m.provider === heuristicFallback.provider &&
        m.modelId === heuristicFallback.modelId,
    ) &&
    !(
      primaryModel.provider === heuristicFallback.provider &&
      primaryModel.modelId === heuristicFallback.modelId
    )
  ) {
    chain.push(heuristicFallback);
  }

  // If no fallbacks at all, return model unwrapped
  if (chain.length === 0 || !chain.some(Boolean)) {
    return model;
  }

  // Last-resort named fallback: if any provider (Flare, static, or dynamic)
  // exposes a model literally named "fallback" (case-insensitive), try it
  // before surrendering to the hidden Groq GPT-OSS endpoint. Admins can
  // register a dynamic provider with "fallback" in its `models` list to
  // make that provider the universal safety net for any primary failure.
  const namedFallback = resolveModelByName("fallback");
  if (
    namedFallback &&
    namedFallback.provider &&
    namedFallback.modelId &&
    !(
      primaryModel.provider === namedFallback.provider &&
      primaryModel.modelId === namedFallback.modelId
    ) &&
    !chain.some(
      (m) =>
        m &&
        m.provider === namedFallback.provider &&
        m.modelId === namedFallback.modelId,
    )
  ) {
    chain.push(namedFallback);
  }

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const dedupedChain = chain.filter((m) => {
    if (!m) return false;
    const key = `${m.provider}/${m.modelId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Nested wrapper: each layer retries on the next
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let wrapped: any = primaryModel;
  for (let i = 0; i < dedupedChain.length; i++) {
    const nextModel = dedupedChain[i]!;
    const finalFallback =
      i === dedupedChain.length - 1
        ? hiddenFailureFallbackModel
        : dedupedChain[i + 1]!;
    wrapped = wrapLanguageModel({
      model: wrapped,
      middleware: {
        wrapGenerate: async ({ doGenerate, params }) => {
          try {
            return await doGenerate();
          } catch (error) {
            console.warn(
              `[ModelFallback] Model failed (${primaryModel.provider}/${primaryModel.modelId}). Falling back to ${nextModel.provider}/${nextModel.modelId}.`,
              error,
            );
            try {
              return await nextModel.doGenerate(params);
            } catch (fallbackError) {
              if (finalFallback) {
                console.warn(
                  `[ModelFallback] Fallback also failed (${nextModel.provider}/${nextModel.modelId}). Trying ${finalFallback.provider}/${finalFallback.modelId}.`,
                  fallbackError,
                );
                return await finalFallback.doGenerate(params);
              }
              throw fallbackError;
            }
          }
        },
        wrapStream: async ({ doStream, params }) => {
          try {
            return await doStream();
          } catch (error) {
            console.warn(
              `[ModelFallback] Model failed (${primaryModel.provider}/${primaryModel.modelId}). Falling back to ${nextModel.provider}/${nextModel.modelId}.`,
              error,
            );
            try {
              return await nextModel.doStream(params);
            } catch (fallbackError) {
              if (finalFallback) {
                console.warn(
                  `[ModelFallback] Fallback also failed (${nextModel.provider}/${nextModel.modelId}). Trying ${finalFallback.provider}/${finalFallback.modelId}.`,
                  fallbackError,
                );
                return await finalFallback.doStream(params);
              }
              throw fallbackError;
            }
          }
        },
      },
    }) as LanguageModel;
  }

  return wrapped;
};

const resolveModel = (model?: ChatModel): LanguageModel => {
  try {
    if (!model) return resolveFallbackModel();
    if (/grok/i.test(model.model)) return hiddenFailureFallbackModel;

    // Always route through Flare if the model name exists there — this makes Flare
    // the unified backend for all provider/model combinations.
    const flareModel = allModels.flare?.[model.model];
    if (flareModel) return flareModel;

    // Check static models for the requested provider (only reached if not in Flare)
    const staticModel = allModels[model.provider]?.[model.model];
    if (staticModel) return staticModel;

    // Check dynamic providers
    const dp = dynamicProviderRegistry.get(model.provider);
    if (dp) {
      const p = createOpenAICompatible({
        name: model.provider,
        apiKey: dp.apiKey,
        baseURL: dp.baseURL,
        fetch: normalizeToolCallsFetch,
      });
      return p(model.model);
    }

    // Unknown provider/model: log loudly. The hidden fallback keeps the app
    // resilient (stale client state, renamed upstream ids), but silent
    // fallback must never become a way to smuggle unapproved model ids.
    console.warn(
      `[models] unknown model requested provider=${model.provider} model=${model.model} — serving fallback`,
    );
    return resolveFallbackModel();
  } catch {
    return resolveFallbackModel();
  }
};

/**
 * Resolve a model by explicit provider + model name (used by fallback chain).
 * Returns a LanguageModelV2 or null if not found.
 */
function resolveModelByProviderModel(
  providerId: string,
  modelName: string,
): LanguageModelV2 | null {
  try {
    // Route through Flare if the model exists there
    const flareModel = allModels.flare?.[modelName];
    if (flareModel) return flareModel as unknown as LanguageModelV2;

    // Check static models for the requested provider
    const staticModel = allModels[providerId]?.[modelName];
    if (staticModel) return staticModel as unknown as LanguageModelV2;

    // Check dynamic providers
    const dp = dynamicProviderRegistry.get(providerId);
    if (dp) {
      const p = createOpenAICompatible({
        name: providerId,
        apiKey: dp.apiKey,
        baseURL: dp.baseURL,
        fetch: normalizeToolCallsFetch,
      });
      return p(modelName) as unknown as LanguageModelV2;
    }

    return null;
  } catch {
    return null;
  }
}

export const customModelProvider = {
  get modelsInfo() {
    // Deduplicate providers (OPENAI_COMPATIBLE_DATA may have "Flare" while static has "flare")
    const deduped: Record<
      string,
      {
        provider: string;
        models: {
          name: string;
          isToolCallUnsupported: boolean;
          isImageInputUnsupported: boolean;
          isBlackboxModel: boolean;
          supportedFileMimeTypes: string[];
        }[];
        hasAPIKey: boolean;
      }
    > = {};
    for (const [provider, models] of Object.entries(allModels)) {
      const key = provider.toLowerCase();
      if (!deduped[key]) {
        deduped[key] = {
          provider,
          models: [],
          hasAPIKey: checkProviderAPIKey(provider as keyof typeof staticModels),
        };
      }
      // Merge models, avoid duplicates by name
      const nameSet = new Set(deduped[key].models.map((m) => m.name));
      for (const [name, model] of Object.entries(models)) {
        if (!/grok/i.test(name) && !nameSet.has(name)) {
          deduped[key].models.push({
            name,
            isToolCallUnsupported:
              isToolCallUnsupportedModel(model) || /gemma/i.test(name),
            isImageInputUnsupported: isImageInputUnsupportedModel(model),
            isBlackboxModel: staticBlackboxModels.has(model),
            supportedFileMimeTypes: [...getFilePartSupportedMimeTypes(model)],
          });
          nameSet.add(name);
        }
      }
      // Demote models with known upstream tool-calling breakage (gemma emits
      // tool_code text and empty content) to the end of the picker list.
      // Purely cosmetic ordering; resolveModel still finds them.
      deduped[key].models.sort(
        (a, b) => Number(/gemma/i.test(a.name)) - Number(/gemma/i.test(b.name)),
      );
    }
    return Object.values(deduped);
  },
  getModel: resolveModel,
  getModelWithFailureFallback: (model?: ChatModel): LanguageModel =>
    withFailureFallback(resolveModel(model)),
};

function checkProviderAPIKey(provider: string) {
  switch (provider) {
    case "google":
      return (
        !!process.env.GOOGLE_GENERATIVE_AI_API_KEY &&
        process.env.GOOGLE_GENERATIVE_AI_API_KEY !== "****"
      );
    case "groq":
    case "perplexity":
      return (
        (!!process.env.PERPLEXITY_API_KEY &&
          process.env.PERPLEXITY_API_KEY !== "****") ||
        (!!process.env.NVIDIA_API_KEY && process.env.NVIDIA_API_KEY !== "****")
      );
    case "nvidia":
      return (
        (!!process.env.NVIDIA_API_KEY &&
          process.env.NVIDIA_API_KEY !== "****") ||
        (!!process.env.PERPLEXITY_API_KEY &&
          process.env.PERPLEXITY_API_KEY !== "****")
      );
    case "openai":
      return true;
    case "anthropic":
    case "Qwen":
    case "Nvidia":
      // OpenRouter uses key rotation
      return openRouterApiKeys.length > 0;
    case "zAI":
      return !!process.env.ZAI_API_KEY && process.env.ZAI_API_KEY !== "****";
    case "flare":
      return (
        (!!process.env.FLARE_API_KEY && process.env.FLARE_API_KEY !== "****") ||
        (!!process.env.KORE_API_KEY && process.env.KORE_API_KEY !== "****")
      );
    default:
      return true; // assume the provider has an API key
  }
}
