import { NextRequest } from "next/server";
import { getSession } from "auth/server";
import { VercelAIMcpTool } from "app-types/mcp";
import { ChatMention } from "app-types/chat";
import {
  filterMcpServerCustomizations,
  loadMcpTools,
  mergeSystemPrompt,
} from "../../../chat/shared.chat";
import {
  buildMcpServerCustomizationsSystemPrompt,
  buildSpeechSystemPrompt,
} from "lib/ai/prompts";
import { safe } from "ts-safe";
import { DEFAULT_VOICE_TOOLS } from "lib/ai/speech";
import {
  rememberAgentAction,
  rememberMcpServerCustomizationsAction,
} from "../../../chat/actions";
import globalLogger from "lib/logger";
import { colorize } from "consola/utils";
import { getUserPreferences } from "lib/user/server";

export const runtime = "nodejs";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", "Kimi + ElevenLabs API: "),
});

const ELEVENLABS_TOKEN_URL =
  "https://api.elevenlabs.io/v1/convai/conversation/token";

interface ElevenLabsSessionRequest {
  voice?: string;
  mentions?: ChatMention[];
  agentId?: string;
  participantName?: string;
}

export async function POST(request: NextRequest) {
  try {
    validateEnvironment();

    const session = await getSession();

    if (!session?.user.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: ElevenLabsSessionRequest | undefined;

    try {
      body = (await request.json()) as ElevenLabsSessionRequest;
    } catch (_error) {
      body = undefined;
    }

    const { mentions = [], agentId, participantName } = body ?? {};

    const agent = await rememberAgentAction(agentId);
    if (agentId) {
      logger.info(`[${agentId}] Agent: ${agent?.name ?? "not found"}`);
    }

    const enabledMentions = agent ? agent.instructions.mentions : mentions;

    const allowedMcpTools = await loadMcpTools({ mentions: enabledMentions });
    const toolNames = Object.keys(allowedMcpTools ?? {});

    if (toolNames.length > 0) {
      logger.info(`${toolNames.length} tools found`);
    } else {
      logger.info("No tools found");
    }

    const userPreferences = await getUserPreferences(session.user.id);

    const mcpServerCustomizations = await safe()
      .map(() => {
        if (Object.keys(allowedMcpTools ?? {}).length === 0)
          throw new Error("No tools found");
        return rememberMcpServerCustomizationsAction();
      })
      .map((value) => filterMcpServerCustomizations(allowedMcpTools!, value))
      .orElse({});

    const openAiStyleTools = Object.entries(allowedMcpTools ?? {}).map(
      ([name, tool]) => vercelAIToolToOpenAITool(tool, name),
    );

    const instructions = mergeSystemPrompt(
      buildSpeechSystemPrompt(
        session.user,
        userPreferences ?? undefined,
        agent ?? undefined,
      ),
      buildMcpServerCustomizationsSystemPrompt(mcpServerCustomizations),
    );

    const bindingTools = [...openAiStyleTools, ...DEFAULT_VOICE_TOOLS];

    const elevenLabsToken = await requestElevenLabsToken({
      agentId: process.env.ELEVENLABS_AGENT_ID!,
      participantName:
        participantName ??
        session.user.name ??
        session.user.email ??
        session.user.id,
    });

    return new Response(
      JSON.stringify({
        token: elevenLabsToken,
        elevenLabsAgentId: process.env.ELEVENLABS_AGENT_ID,
        voiceId: process.env.ELEVENLABS_VOICE_ID ?? null,
        instructions,
        tools: bindingTools,
        hasKimiCredentials: hasKimiProviderCredentials(),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error: any) {
    logger.error(error);
    return new Response(
      JSON.stringify({ error: error?.message ?? "Unknown error" }),
      {
        status: 500,
      },
    );
  }
}

function validateEnvironment() {
  const missing = [
    ["ELEVENLABS_API_KEY", process.env.ELEVENLABS_API_KEY],
    ["ELEVENLABS_AGENT_ID", process.env.ELEVENLABS_AGENT_ID],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
}

function hasKimiProviderCredentials() {
  return Boolean(process.env.KIMI_API_KEY || process.env.GROQ_API_KEY);
}

async function requestElevenLabsToken({
  agentId,
  participantName,
}: {
  agentId: string;
  participantName?: string;
}) {
  const params = new URLSearchParams({ agent_id: agentId });

  if (participantName) {
    params.set("participant_name", participantName);
  }

  const response = await fetch(`${ELEVENLABS_TOKEN_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Unable to create ElevenLabs session (${response.status}): ${errorBody}`,
    );
  }

  const data = (await response.json()) as { token?: string };

  if (!data?.token) {
    throw new Error("Missing token in ElevenLabs response");
  }

  return data.token;
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
