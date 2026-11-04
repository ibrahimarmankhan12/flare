import "server-only";

import {
  UIMessage,
  convertToModelMessages,
  smoothStream,
  streamText,
} from "ai";
import { ChatModel } from "app-types/chat";
import {
  EmbedJwtError,
  mintEmbedToken,
  verifyEmbedToken,
} from "auth/embed-jwt";
import { colorize } from "consola/utils";
import { customModelProvider } from "lib/ai/models";
import { buildUserSystemPromptWithMemory } from "lib/ai/prompts";
import {
  agentInstallRepository,
  embedSessionRepository,
} from "lib/db/repository";
import { applyEmbedSessionQuota } from "lib/embed/quota";
import { generateUUID } from "lib/utils";
import globalLogger from "logger";

export const dynamic = "force-dynamic";

const SESSION_TTL_MS = 15 * 60 * 1000;
const DEFAULT_EMBED_MODEL: ChatModel = {
  provider: "google",
  model: "Gemini 3 Flash",
};

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", "Embed Session API: "),
});

const jsonError = (message: string, status: number, code = "embed-error") =>
  Response.json({ code, message }, { status });

const parseAgentId = async (request: Request): Promise<string | null> => {
  try {
    const body = await request.json();
    const agentId =
      typeof body?.agentId === "string" ? body.agentId.trim() : "";
    return agentId || null;
  } catch {
    return null;
  }
};

const getOrigin = (request: Request) => {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
};

const isSessionUsable = (
  session: Awaited<
    ReturnType<typeof embedSessionRepository.getEmbedSessionByToken>
  >,
  payload: ReturnType<typeof verifyEmbedToken>,
  agentId?: string,
) => {
  if (!session) return false;
  if (session.id !== payload.sessionId) return false;
  if (session.agentId !== payload.agentId) return false;
  if (agentId && session.agentId !== agentId) return false;
  if (session.anonymousToken !== payload.anonymousToken) return false;
  if (session.revokedAt) return false;
  if (session.expiresAt.getTime() <= Date.now()) return false;
  return true;
};

const verifyRequestSession = async (request: Request) => {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return {
      ok: false as const,
      response: jsonError("Missing embed token", 401),
    };
  }

  try {
    const payload = verifyEmbedToken(token);
    const session = await embedSessionRepository.getEmbedSessionByToken(
      payload.anonymousToken,
    );
    if (!isSessionUsable(session, payload)) {
      return {
        ok: false as const,
        response: jsonError("Invalid embed session", 401),
      };
    }
    const verifiedSession = session!;
    const agent = await agentInstallRepository.getPublishedAgent(
      payload.agentId,
    );
    if (!agent) {
      return {
        ok: false as const,
        response: jsonError("Agent not found or not published", 404),
      };
    }
    return { ok: true as const, payload, session: verifiedSession, agent };
  } catch (error) {
    const status =
      error instanceof EmbedJwtError && error.code === "expired-token"
        ? 401
        : 400;
    return {
      ok: false as const,
      response: jsonError("Invalid embed token", status),
    };
  }
};

const extractMessages = (body: unknown): UIMessage[] | null => {
  const messages = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(messages)) return null;
  return messages as UIMessage[];
};

export async function POST(request: Request) {
  if (request.headers.has("authorization")) {
    return POST_EMBED_CHAT(request);
  }

  const agentId = await parseAgentId(request);
  if (!agentId) {
    return jsonError("agentId is required", 400, "invalid-agent-id");
  }

  try {
    const agent = await agentInstallRepository.getPublishedAgent(agentId);
    if (!agent) {
      return jsonError(
        "Agent not found or not published",
        404,
        "agent-not-found",
      );
    }

    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const anonymousToken = generateUUID();
    const session = await embedSessionRepository.createEmbedSession({
      agentId,
      anonymousToken,
      expiresAt,
      rateLimitTier: "free",
    });
    const token = mintEmbedToken({
      agentId,
      sessionId: session.id,
      anonymousToken,
      ttlSeconds: Math.floor(SESSION_TTL_MS / 1000),
    });
    const iframeUrl = `${getOrigin(request)}/embed/${encodeURIComponent(
      agentId,
    )}?token=${encodeURIComponent(token)}`;

    return Response.json({
      token,
      iframeUrl,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    logger.error("create embed session failed", error);
    return jsonError("Internal Server Error", 500, "internal-error");
  }
}

export async function GET(request: Request) {
  const verified = await verifyRequestSession(request);
  if (!verified.ok) return verified.response;

  return Response.json({
    agent: {
      id: verified.agent.id,
      name: verified.agent.name,
      description: verified.agent.description ?? null,
      icon: verified.agent.icon ?? null,
    },
    session: {
      id: verified.session.id,
      expiresAt: verified.session.expiresAt.toISOString(),
    },
  });
}

async function POST_EMBED_CHAT(request: Request) {
  const verified = await verifyRequestSession(request);
  if (!verified.ok) return verified.response;

  try {
    const body = await request.json();
    const messages = extractMessages(body);
    if (!messages) {
      return jsonError("messages is required", 400, "invalid-messages");
    }

    const chatModel = ((body as { chatModel?: ChatModel })?.chatModel ??
      DEFAULT_EMBED_MODEL) as ChatModel;
    const model = customModelProvider.getModelWithFailureFallback(chatModel);
    const modelMessages = await Promise.resolve(
      convertToModelMessages(messages, { ignoreIncompleteToolCalls: true }),
    );
    const system = await buildUserSystemPromptWithMemory(
      undefined,
      undefined,
      verified.agent as any,
      {
        provider: chatModel.provider,
        model: chatModel.model,
      },
    );

    const quotaResult = await applyEmbedSessionQuota(verified.session);
    if (!quotaResult.allowed) {
      return Response.json(
        {
          code: quotaResult.code,
          message: quotaResult.message,
          quota: {
            tier: quotaResult.tier,
            limit: quotaResult.limit,
            remaining: quotaResult.remaining,
            resetAt: quotaResult.resetAt.toISOString(),
          },
        },
        { status: 429 },
      );
    }

    const result = streamText({
      model,
      system,
      messages: modelMessages,
      experimental_transform: smoothStream({ chunking: "word" }),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    logger.error("embed chat failed", error);
    return jsonError("Internal Server Error", 500, "internal-error");
  }
}
