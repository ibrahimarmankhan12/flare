import { getSession } from "auth/server";
import {
  UIMessage,
  convertToModelMessages,
  smoothStream,
  streamText,
} from "ai";
import { isFreeTier } from "app-types/subscription";
import { customModelProvider } from "lib/ai/models";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { userRepository } from "lib/db/repository";
import globalLogger from "logger";
import { buildUserSystemPrompt } from "lib/ai/prompts";
import {
  estimateFreeTierTokenReservation,
  getFreeTierLimits,
  reserveFreeTierTokens,
  settleFreeTierTokenUsage,
} from "lib/rate-limit/free-tier-usage";
import { getUserPreferences } from "lib/user/server";
import {
  resolveChatSecuritySessionIpAddress,
  resolveChatSecuritySessionId,
  resolveChatSecuritySessionUserAgent,
  verifyChatRequestGuard,
} from "lib/security/chat-request-guard.server";
import { resolveEncryptedChatRequestBody } from "lib/security/chat-payload-obfuscation.server";

import { colorize } from "consola/utils";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Temporary Chat API: `),
});

const extractTotalTokens = (usage: any): number => {
  if (!usage || typeof usage !== "object") return 0;

  const candidates = [
    usage.totalTokens,
    usage.total_tokens,
    usage.usageTokens,
    usage.total,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return Math.max(0, Math.floor(candidate));
    }
  }

  const inputCandidates = [
    usage.inputTokens,
    usage.promptTokens,
    usage.prompt_tokens,
  ];
  const outputCandidates = [
    usage.outputTokens,
    usage.completionTokens,
    usage.completion_tokens,
  ];

  const input = inputCandidates.find(
    (value) => typeof value === "number" && Number.isFinite(value),
  ) as number | undefined;
  const output = outputCandidates.find(
    (value) => typeof value === "number" && Number.isFinite(value),
  ) as number | undefined;

  return Math.max(0, Math.floor((input || 0) + (output || 0)));
};

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const decryptedBodyResult = await resolveEncryptedChatRequestBody(rawBody);
    if (!decryptedBodyResult.ok) {
      return Response.json(
        {
          code: decryptedBodyResult.code,
          message: decryptedBodyResult.message,
        },
        { status: decryptedBodyResult.status },
      );
    }
    const json = decryptedBodyResult.body;

    const session = await getSession();
    if (!session) {
      return new Response("Unauthorized", { status: 401 });
    }

    const currentUser = await userRepository.getUserById(session.user.id);
    const isCurrentUserFree = isFreeTier(currentUser?.tier);

    // Per-user RPM cap for all tiers (see main chat route).
    try {
      const userRate = await checkApiRateLimit({
        kind: "chat-user",
        id: session.user.id,
        limit: isCurrentUserFree ? 20 : 60,
        windowMs: 60_000,
      });
      if (!userRate.allowed) {
        return Response.json(
          {
            code: "chat-rate-limit-exceeded",
            message: `Too many chat requests. Try again in ${Math.max(1, Math.ceil(userRate.retryAfterMs / 1000))}s.`,
          },
          {
            status: 429,
            headers: {
              "retry-after": String(
                Math.max(1, Math.ceil(userRate.retryAfterMs / 1000)),
              ),
            },
          },
        );
      }
    } catch {
      // fail-open on limiter store errors
    }

    // TOCTOU fix: reserve an estimate before generating (same as /api/chat).
    let freeTierReservation = 0;
    if (isCurrentUserFree) {
      const bodyMessages = (json as { messages?: unknown }).messages;
      const reservation = await reserveFreeTierTokens(
        session.user.id,
        estimateFreeTierTokenReservation(
          JSON.stringify(bodyMessages ?? "").length,
        ),
      );
      freeTierReservation = reservation.reserved;
      if (!reservation.allowed) {
        const limits = await getFreeTierLimits();
        return Response.json(
          {
            code: "free-tier-token-limit-exceeded",
            message: `Daily free-tier token limit reached (${limits.dailyTokens.toLocaleString()}). Please upgrade or try again tomorrow.`,
            usage: {
              tokensUsed: reservation.tokensUsed,
              tokensLimit: limits.dailyTokens,
            },
          },
          { status: 429 },
        );
      }
    }

    const guardResult = await verifyChatRequestGuard({
      request,
      body: json,
      userId: session.user.id,
      sessionId: resolveChatSecuritySessionId(session),
      sessionIpAddress: resolveChatSecuritySessionIpAddress(session),
      sessionUserAgent: resolveChatSecuritySessionUserAgent(session),
    });
    if (!guardResult.ok) {
      return Response.json(
        {
          code: guardResult.code,
          message: guardResult.message,
        },
        { status: guardResult.status },
      );
    }

    const { messages, chatModel, instructions } = json as {
      messages: UIMessage[];
      chatModel?: {
        provider: string;
        model: string;
      };
      instructions?: string;
    };

    // Input hygiene: the transcript is fully client-supplied, so (1) cap the
    // injected instructions length and (2) keep only user/assistant roles —
    // forged tool/system parts must never reach the model.
    const MAX_INSTRUCTIONS_CHARS =
      Number(process.env.TEMPORARY_CHAT_MAX_INSTRUCTIONS) || 4000;
    const cappedInstructions = instructions
      ? instructions.slice(0, MAX_INSTRUCTIONS_CHARS)
      : undefined;
    const sanitizedMessages = Array.isArray(messages)
      ? messages
          .filter((m) => m?.role === "user" || m?.role === "assistant")
          .slice(-200)
      : [];

    logger.info(`model: ${chatModel?.provider}/${chatModel?.model}`);
    const model = customModelProvider.getModelWithFailureFallback(chatModel);
    const userPreferences =
      (await getUserPreferences(session.user.id)) || undefined;
    const modelMessages = await Promise.resolve(
      convertToModelMessages(sanitizedMessages, {
        ignoreIncompleteToolCalls: true,
      }),
    );

    const result = streamText({
      model,
      system: `${buildUserSystemPrompt(
        session.user,
        userPreferences,
        undefined,
        {
          provider: chatModel?.provider,
          model: chatModel?.model,
        },
      )} ${cappedInstructions ? `\n\n${cappedInstructions}` : ""}`.trim(),
      messages: modelMessages,
      experimental_transform: smoothStream({
        chunking: "word",
        delayInMs: 0,
      }),
    });

    return result.toUIMessageStreamResponse({
      messageMetadata: ({ part }) => {
        if (part.type === "finish" && isCurrentUserFree) {
          const totalTokens = extractTotalTokens(part.totalUsage);
          if (totalTokens > 0) {
            settleFreeTierTokenUsage(
              session.user.id,
              freeTierReservation,
              totalTokens,
            );
          }
        }
      },
    });
  } catch (error: any) {
    logger.error(error);
    return new Response("An internal error occurred. Please try again.", {
      status: 500,
    });
  }
}
