import { smoothStream, streamText } from "ai";

import { customModelProvider } from "lib/ai/models";
import { CREATE_THREAD_TITLE_PROMPT } from "lib/ai/prompts";
import globalLogger from "logger";
import { ChatModel } from "app-types/chat";
import { isFreeTier } from "app-types/subscription";
import { chatRepository, userRepository } from "lib/db/repository";
import { getSession } from "auth/server";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { getFreeTierLimitCheck } from "lib/rate-limit/free-tier-usage";
import { colorize } from "consola/utils";
import { handleError } from "../shared.chat";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Title API: `),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();

    const {
      chatModel,
      message = "hello",
      threadId,
    } = json as {
      chatModel?: ChatModel;
      message: string;
      threadId: string;
    };

    const session = await getSession();
    if (!session) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Abuse controls: this endpoint streams real completions, so apply the
    // same per-user RPM and free-tier daily-token gate as /api/chat.
    const [user, rate] = await Promise.all([
      userRepository.getUserById(session.user.id),
      checkApiRateLimit({
        kind: "chat-user",
        id: session.user.id,
        limit: 30,
        windowMs: 60_000,
      }),
    ]);
    if (!rate.allowed) {
      return new Response("Too many requests", {
        status: 429,
        headers: {
          "retry-after": String(
            Math.max(1, Math.ceil(rate.retryAfterMs / 1000)),
          ),
        },
      });
    }
    if (isFreeTier(user?.tier)) {
      const usageCheck = await getFreeTierLimitCheck(session.user.id);
      if (!usageCheck.allowed) {
        return new Response("Daily free-tier token limit reached", {
          status: 429,
        });
      }
    }

    // Ownership guard: only allow the title write when threadId belongs to
    // the caller (or is a fresh id that does not exist yet).
    if (
      typeof threadId === "string" &&
      threadId.length > 0 &&
      !(await chatRepository.checkAccess(threadId, session.user.id))
    ) {
      const exists = await chatRepository.selectThreadDetails(threadId);
      if (exists) {
        return new Response("Not found", { status: 404 });
      }
    }

    logger.info(
      `chatModel: ${chatModel?.provider}/${chatModel?.model}, threadId: ${threadId}`,
    );

    const result = streamText({
      model: customModelProvider.getModelWithFailureFallback(chatModel),
      system: CREATE_THREAD_TITLE_PROMPT,
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: message,
      abortSignal: request.signal,
      onFinish: (ctx) => {
        chatRepository
          .upsertThread({
            id: threadId,
            title: ctx.text,
            userId: session.user.id,
          })
          .catch((err) => logger.error(err));
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}
