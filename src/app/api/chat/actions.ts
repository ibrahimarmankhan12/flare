"use server";

import {
  LanguageModel,
  type UIMessage,
  generateObject,
  generateText,
  jsonSchema,
} from "ai";

import {
  CREATE_THREAD_TITLE_PROMPT,
  generateExampleToolSchemaPrompt,
} from "lib/ai/prompts";

import type { ChatModel, ChatThread } from "app-types/chat";

import { MCPToolInfo, McpServerCustomizationsPrompt } from "app-types/mcp";
import { getSession } from "auth/server";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { customModelProvider } from "lib/ai/models";
import { serverCache } from "lib/cache";
import { CacheKeys } from "lib/cache/cache-keys";
import {
  agentRepository,
  chatExportRepository,
  chatRepository,
  mcpMcpToolCustomizationRepository,
  mcpServerCustomizationRepository,
} from "lib/db/repository";
import { toAny } from "lib/utils";
import logger from "logger";

import { Agent } from "app-types/agent";
import { ObjectJsonSchema7 } from "app-types/util";
import { JSONSchema7 } from "json-schema";
import { normalizeToolInputSchema } from "lib/ai/tools/sanitize-tool-schemas";
import { jsonSchemaToZod } from "lib/json-schema-to-zod";
import { convertToSavePart } from "./shared.chat";

export async function getUserId() {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("User not found");
  }
  return userId;
}

export async function generateTitleFromUserMessageAction({
  message,
  model,
}: { message: UIMessage; model: LanguageModel }) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  const prompt = toAny(message.parts?.at(-1))?.text || "unknown";

  const { text: title } = await generateText({
    model,
    system: CREATE_THREAD_TITLE_PROMPT,
    prompt,
  });

  return title.trim();
}

export async function selectThreadWithMessagesAction(threadId: string) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  const thread = await chatRepository.selectThread(threadId);

  if (!thread) {
    logger.error("Thread not found", threadId);
    return null;
  }
  if (thread.userId !== session?.user.id) {
    return null;
  }
  const messages = await chatRepository.selectMessagesByThreadId(threadId);
  return { ...thread, messages: messages ?? [] };
}

export async function deleteMessageAction(messageId: string) {
  const userId = await getUserId();
  const msg = await chatRepository.selectMessage(messageId);
  if (!msg) return;
  const thread = await chatRepository.selectThread(msg.threadId);
  if (thread?.userId !== userId) throw new Error("Unauthorized");
  await chatRepository.deleteChatMessage(messageId);
}

export async function deleteThreadAction(threadId: string) {
  const userId = await getUserId();
  const thread = await chatRepository.selectThread(threadId);
  if (thread && thread.userId !== userId) throw new Error("Unauthorized");
  await chatRepository.deleteThread(threadId);
}

export async function deleteMessagesByChatIdAfterTimestampAction(
  messageId: string,
) {
  "use server";
  const userId = await getUserId();
  const msg = await chatRepository.selectMessage(messageId);
  if (!msg) return;
  const thread = await chatRepository.selectThread(msg.threadId);
  if (thread?.userId !== userId) throw new Error("Unauthorized");
  await chatRepository.deleteMessagesByChatIdAfterTimestamp(messageId);
}

export async function updateThreadAction(
  id: string,
  thread: Partial<Omit<ChatThread, "createdAt" | "updatedAt" | "userId">>,
) {
  const userId = await getUserId();
  const existingThread = await chatRepository.selectThread(id);
  if (existingThread && existingThread.userId !== userId)
    throw new Error("Unauthorized");
  await chatRepository.updateThread(id, { ...thread, userId });
}

export async function deleteThreadsAction() {
  const userId = await getUserId();
  await chatRepository.deleteAllThreads(userId);
}

export async function deleteUnarchivedThreadsAction() {
  const userId = await getUserId();
  await chatRepository.deleteUnarchivedThreads(userId);
}

export async function generateExampleToolSchemaAction(options: {
  model?: ChatModel;
  toolInfo: MCPToolInfo;
  prompt?: string;
}) {
  // Server actions are public RPC endpoints; require a session and
  // rate-limit so this cannot be used as an unauthenticated LLM oracle.
  const userId = await getUserId();
  const rate = await checkApiRateLimit({
    kind: "chat-user",
    id: userId,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    throw new Error("Too many requests. Please try again shortly.");
  }
  const model = customModelProvider.getModelWithFailureFallback(options.model);

  const schema = jsonSchema(
    normalizeToolInputSchema(
      toAny({
        ...options.toolInfo.inputSchema,
        properties: options.toolInfo.inputSchema?.properties ?? {},
        additionalProperties: false,
      }),
    ),
  );
  const { object } = await generateObject({
    model,
    schema,
    prompt: generateExampleToolSchemaPrompt({
      toolInfo: options.toolInfo,
      prompt: options.prompt,
    }),
  });

  return object;
}

export async function rememberMcpServerCustomizationsAction() {
  const userId = await getUserId();
  const key = CacheKeys.mcpServerCustomizations(userId);

  const cachedMcpServerCustomizations =
    await serverCache.get<Record<string, McpServerCustomizationsPrompt>>(key);
  if (cachedMcpServerCustomizations) {
    return cachedMcpServerCustomizations;
  }

  const mcpServerCustomizations =
    await mcpServerCustomizationRepository.selectByUserId(userId);
  const mcpToolCustomizations =
    await mcpMcpToolCustomizationRepository.selectByUserId(userId);

  const serverIds: string[] = [
    ...mcpServerCustomizations.map(
      (mcpServerCustomization) => mcpServerCustomization.mcpServerId,
    ),
    ...mcpToolCustomizations.map(
      (mcpToolCustomization) => mcpToolCustomization.mcpServerId,
    ),
  ];

  const prompts = Array.from(new Set(serverIds)).reduce(
    (acc, serverId) => {
      const sc = mcpServerCustomizations.find((v) => v.mcpServerId == serverId);
      const tc = mcpToolCustomizations.filter(
        (mcpToolCustomization) => mcpToolCustomization.mcpServerId === serverId,
      );
      const data: McpServerCustomizationsPrompt = {
        name: sc?.serverName || tc[0]?.serverName || "",
        id: serverId,
        prompt: sc?.prompt || "",
        tools: tc.reduce(
          (acc, v) => {
            acc[v.toolName] = v.prompt || "";
            return acc;
          },
          {} as Record<string, string>,
        ),
      };
      acc[serverId] = data;
      return acc;
    },
    {} as Record<string, McpServerCustomizationsPrompt>,
  );

  serverCache.set(key, prompts, 1000 * 60 * 30); // 30 minutes
  return prompts;
}

export async function generateObjectAction({
  model,
  prompt,
  schema,
}: {
  model?: ChatModel;
  prompt: {
    system?: string;
    user?: string;
  };
  schema: JSONSchema7 | ObjectJsonSchema7;
}) {
  // Server actions are public RPC endpoints (the action id ships in the
  // client bundle). Require a session + per-user RPM so this cannot be
  // abused as an unauthenticated, quota-free completion oracle.
  const userId = await getUserId();
  const rate = await checkApiRateLimit({
    kind: "chat-user",
    id: userId,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    throw new Error("Too many requests. Please try again shortly.");
  }
  const result = await generateObject({
    model: customModelProvider.getModelWithFailureFallback(model),
    system: prompt.system,
    prompt: prompt.user || "",
    schema: jsonSchemaToZod(schema),
  });
  return result.object;
}

export async function rememberAgentAction(
  agent: string | undefined,
  // Session-less callers (scheduler cron tick, embed widget) resolve the
  // user id themselves and pass it in — `getUserId()` reads the Better
  // Auth session, which those requests don't carry.
  userIdOverride?: string,
) {
  if (!agent) return undefined;
  const userId = userIdOverride ?? (await getUserId());
  const key = CacheKeys.agentInstructions(agent, userId);
  let cachedAgent = await serverCache.get<Agent | null>(key);
  if (!cachedAgent) {
    cachedAgent = await agentRepository.selectAgentById(agent, userId);
    await serverCache.set(key, cachedAgent);
  }
  return cachedAgent as Agent | undefined;
}

export async function exportChatAction({
  threadId,
  expiresAt,
}: {
  threadId: string;
  expiresAt?: Date;
}) {
  const userId = await getUserId();

  const isAccess = await chatRepository.checkAccess(threadId, userId);
  if (!isAccess) {
    return new Response("Unauthorized", { status: 401 });
  }

  return await chatExportRepository.exportChat({
    threadId,
    exporterId: userId,
    expiresAt: expiresAt ?? undefined,
  });
}

export async function upsertThreadMessageAction({
  threadId,
  message,
}: {
  threadId: string;
  message: Pick<UIMessage, "id" | "role" | "parts" | "metadata">;
}) {
  const userId = await getUserId();

  const hasAccess = await chatRepository.checkAccess(threadId, userId);
  if (!hasAccess) {
    throw new Error("Unauthorized");
  }

  await chatRepository.upsertMessage({
    threadId,
    id: message.id,
    role: message.role,
    parts: message.parts.map((part) => convertToSavePart(part as any)),
    metadata: message.metadata as any,
  });
}
