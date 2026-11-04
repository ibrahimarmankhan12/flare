import { NextRequest } from "next/server";
import { getSession } from "auth/server";
import globalLogger from "lib/logger";
import { colorize } from "consola/utils";

export const runtime = "nodejs";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", "Voice Chat Streaming API: "),
});

// Voice chat LLM uses Flare AI models (api.flare-sh.tech) by default, falling
// back to Groq if the Flare key is not configured. Both are OpenAI-compatible.
const FLARE_BASE_URL = (
  process.env.FLARE_API_BASE_URL || "https://api.flare-sh.tech/v1"
).replace(/\/+$/, "");
const FLARE_API_KEY = process.env.FLARE_API_KEY || process.env.KORE_API_KEY;
const GROQ_BASE_URL = (
  process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1"
).replace(/\/+$/, "");
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Default voice model. Override per-request via body.model or env.
// Flare uses provider-prefixed ids (e.g. oc/deepseek-flash); Groq uses raw ids.
const FLARE_VOICE_MODEL = process.env.VOICE_CHAT_MODEL || "oc/deepseek-flash";
const GROQ_VOICE_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

interface ChatRequest {
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_call_id?: string;
    name?: string;
  }>;
  tools?: any[];
  model?: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Prefer Flare AI; fall back to Groq.
    const useFlare = Boolean(FLARE_API_KEY);
    const apiKey = useFlare ? FLARE_API_KEY : GROQ_API_KEY;
    const baseUrl = useFlare ? FLARE_BASE_URL : GROQ_BASE_URL;
    const provider = useFlare ? "Flare" : "Groq";

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "No voice LLM key configured (FLARE_API_KEY or GROQ_API_KEY)",
        }),
        { status: 500 },
      );
    }

    const body = (await request.json()) as ChatRequest;
    // Flare AI needs a provider-prefixed id (e.g. "oc/deepseek-flash"). If the
    // client sends a bare/legacy id (e.g. "llama-3.1-8b-instant") while Flare is
    // the active provider, it cannot resolve a provider — fall back to the
    // configured Flare voice model instead of forwarding an unusable id.
    const requestedModel = body.model?.trim();
    const isProviderPrefixed = Boolean(
      requestedModel && requestedModel.includes("/"),
    );
    let model: string;
    if (useFlare) {
      model = isProviderPrefixed ? requestedModel! : FLARE_VOICE_MODEL;
    } else {
      model = requestedModel || GROQ_VOICE_MODEL;
    }

    const payload: Record<string, any> = {
      model,
      messages: body.messages,
      stream: true,
    };

    // Only add tools when there are tools to use
    if (body.tools && body.tools.length > 0) {
      payload.tools = body.tools;
      payload.tool_choice = "auto";
    }

    logger.info(
      `Streaming from ${provider} (${model}) with ${body.messages.length} messages`,
    );

    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      logger.error(`${provider} API error: ${upstream.status} ${errorText}`);
      return new Response(
        JSON.stringify({
          error: `${provider} API error: ${upstream.status}`,
          details: errorText,
        }),
        { status: upstream.status },
      );
    }

    // Stream the SSE response through to the client
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    logger.error(error);
    return new Response(
      JSON.stringify({ error: error?.message ?? "Unknown error" }),
      { status: 500 },
    );
  }
}
