import { NextRequest } from "next/server";
import { getSession } from "auth/server";
import { VercelAIMcpTool } from "app-types/mcp";
import {
  filterMcpServerCustomizations,
  loadMcpTools,
  mergeSystemPrompt,
} from "../shared.chat";
import {
  buildMcpServerCustomizationsSystemPrompt,
  buildSpeechSystemPrompt,
} from "lib/ai/prompts";

import { safe } from "ts-safe";
import { DEFAULT_VOICE_TOOLS } from "lib/ai/speech";
import {
  rememberAgentAction,
  rememberMcpServerCustomizationsAction,
} from "../actions";
import globalLogger from "lib/logger";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { colorize } from "consola/utils";
import { getUserPreferences } from "lib/user/server";
import { ChatMention } from "app-types/chat";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `OpenAI Realtime API: `),
});

// Realtime audio is among the most expensive model families we proxy. Only
// allowlisted ids may be minted, and each user is RPM-capped.
const REALTIME_MODEL_ALLOWLIST = new Set([
  "gpt-4o-realtime-preview",
  "gpt-4o-mini-realtime-preview",
]);
const DEFAULT_REALTIME_MODEL = "gpt-4o-realtime-preview";

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Realtime voice is not configured" }),
        {
          status: 503,
        },
      );
    }

    const session = await getSession();

    if (!session?.user.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const rate = await checkApiRateLimit({
      kind: "chat-user",
      id: session.user.id,
      limit: 10,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
      });
    }

    const { model, voice, mentions, agentId } = (await request.json()) as {
      model: string;
      voice: string;
      agentId?: string;
      mentions: ChatMention[];
    };
    // Never forward an arbitrary model string to the upstream provider.
    const realtimeModel =
      typeof model === "string" && REALTIME_MODEL_ALLOWLIST.has(model)
        ? model
        : DEFAULT_REALTIME_MODEL;

    const agent = await rememberAgentAction(agentId);

    agentId && logger.info(`[${agentId}] Agent: ${agent?.name}`);

    const enabledMentions = agent ? agent.instructions.mentions : mentions;

    const allowedMcpTools = await loadMcpTools({ mentions: enabledMentions });

    const toolNames = Object.keys(allowedMcpTools ?? {});

    if (toolNames.length > 0) {
      logger.info(`${toolNames.length} tools found`);
    } else {
      logger.info(`No tools found`);
    }

    const userPreferences = await getUserPreferences(session.user.id);

    const mcpServerCustomizations = await safe()
      .map(() => {
        if (Object.keys(allowedMcpTools ?? {}).length === 0)
          throw new Error("No tools found");
        return rememberMcpServerCustomizationsAction();
      })
      .map((v) => filterMcpServerCustomizations(allowedMcpTools!, v))
      .orElse({});

    const openAITools = Object.entries(allowedMcpTools ?? {}).map(
      ([name, tool]) => {
        return vercelAIToolToOpenAITool(tool, name);
      },
    );

    const systemPrompt = mergeSystemPrompt(
      buildSpeechSystemPrompt(
        session.user,
        userPreferences ?? undefined,
        agent,
        {
          provider: "openai",
          model: realtimeModel,
        },
      ),
      buildMcpServerCustomizationsSystemPrompt(mcpServerCustomizations),
    );

    const bindingTools = [...openAITools, ...DEFAULT_VOICE_TOOLS];

    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        model: realtimeModel,
        voice: voice || "alloy",
        input_audio_transcription: {
          model: "whisper-1",
        },
        instructions: systemPrompt,
        tools: bindingTools,
      }),
    });

    return new Response(r.body, {
      status: r.ok ? 200 : 502,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    // Log details server-side; return a generic message so upstream
    // provider errors are never reflected to clients.
    logger.error("[openai-realtime] session creation failed", error);
    return new Response(
      JSON.stringify({ error: "Failed to create realtime session" }),
      {
        status: 500,
      },
    );
  }
}

function vercelAIToolToOpenAITool(tool: VercelAIMcpTool, name: string) {
  return {
    name,
    type: "function",
    description: tool.description,
    parameters: (tool.inputSchema as any).jsonSchema ?? {
      type: "object",
      properties: {},
      required: [],
    },
  };
}
