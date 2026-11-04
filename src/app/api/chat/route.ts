import {
  Tool,
  UIMessage,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  smoothStream,
  stepCountIs,
  streamText,
} from "ai";

import {
  customModelProvider,
  isToolCallUnsupportedModel,
  supportsNativeImageInput,
} from "lib/ai/models";

import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";

import {
  ChatMention,
  ChatMetadata,
  chatApiSchemaRequestBodySchema,
} from "app-types/chat";
import { embedText } from "lib/ai/memory/embed";
import { runMemoryExtraction } from "lib/ai/memory/extract-and-store";
import { TOOLKIT_CATALOG } from "lib/ai/tools/toolkit-catalog";
import { getEnabledCategories } from "lib/site-config-runtime";
import { buildAgentHarnessCached } from "lib/ai/harness";
import { assemblePromptSections } from "lib/ai/system-prompt";
import {
  buildMcpServerCustomizationsSystemPrompt,
  buildMcpServersPromptSection,
  buildToolCallUnsupportedModelSystemPrompt,
  buildToolInventoryPromptSection,
  buildUserAgentsPromptSection,
  buildUserSystemPromptWithMemory,
} from "lib/ai/prompts";
import {
  agentRepository,
  chatRepository,
  embedSessionRepository,
  userRepository,
} from "lib/db/repository";
import { type RetrievedChunk, retrieveRelevantChunks } from "lib/rag/retrieve";
import globalLogger from "logger";

import { errorIf, safe } from "ts-safe";

import { buildCsvIngestionPreviewParts } from "@/lib/ai/ingest/csv-ingest";
import { buildPdfIngestionPreviewParts } from "@/lib/ai/ingest/pdf-ingest";
import { buildKonvOVisionIngestionPreviewParts } from "@/lib/ai/ingest/konvo-vision-ingest";
import { isFreeTier } from "app-types/subscription";
import { getSession } from "auth/server";
import { colorize } from "consola/utils";
import {
  buildSkillSystemPrompt,
  resolveSlashSkillInvocation,
} from "lib/ai/skills";
import {
  AppDefaultToolkit,
  DefaultToolName,
  ImageToolName,
} from "lib/ai/tools";
import { createCodeEngineTool } from "lib/ai/tools/code-engine";
import { NodeVMExecutor } from "lib/ai/tools/code-engine/executor";
import { createFlareImageTool } from "lib/ai/tools/image";
import { sanitizeToolSchemas } from "lib/ai/tools/sanitize-tool-schemas";
import {
  applyEmbedSessionQuota,
  isEmbedSessionExpired,
  shouldRequireEmbedCaptcha,
} from "lib/embed/quota";
import { applyEmbedToolPolicy } from "lib/embed/tool-policy";
import { serverFileStorage } from "lib/file-storage";
import {
  getFreeTierLimitCheck,
  getFreeTierLimits,
  recordFreeTierTokenUsage,
} from "lib/rate-limit/free-tier-usage";
import { resolveEncryptedChatRequestBody } from "lib/security/chat-payload-obfuscation.server";
import {
  resolveChatSecuritySessionId,
  resolveChatSecuritySessionIpAddress,
  resolveChatSecuritySessionUserAgent,
  verifyChatRequestGuard,
} from "lib/security/chat-request-guard.server";
import {
  SCHEDULE_SKILL_NAME,
  createScheduledJobFromSkill,
  parseScheduleArgs,
} from "lib/ai/skills/schedule";
import { publicScheduledJob } from "lib/scheduler/jobs";
import { generateUUID } from "lib/utils";
import {
  rememberAgentAction,
  rememberMcpServerCustomizationsAction,
} from "./actions";
import {
  convertToSavePart,
  excludeToolExecution,
  extractInProgressToolPart,
  filterMcpServerCustomizations,
  handleError,
  loadAppDefaultTools,
  loadMcpTools,
  loadWorkFlowTools,
  manualToolExecuteByLastMessage,
} from "./shared.chat";

// Extend timeout for image generation (Nano Banana uses polling up to 3 minutes)
export const maxDuration = 300; // 5 minutes

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Chat API: `),
});

const getPartToolName = (part: any): string | null => {
  if (!part || typeof part !== "object") return null;
  const partType = part?.type;
  if (partType === "dynamic-tool") {
    return typeof part?.toolName === "string" ? part.toolName : "";
  }
  if (typeof partType === "string" && partType.startsWith("tool-")) {
    return partType.slice("tool-".length);
  }
  if (
    partType === "tool-call" ||
    partType === "tool-result" ||
    partType === "tool-invocation"
  ) {
    if (typeof part?.toolName === "string") return part.toolName;
    if (typeof part?.name === "string") return part.name;
    return "";
  }
  return null;
};

const sanitizeMessagesForModel = (messages: UIMessage[]): UIMessage[] => {
  return messages
    .map((message) => {
      if (!Array.isArray(message.parts)) return message;
      const parts = message.parts
        .flatMap((part: any) => {
          if (part?.type === "source-url") {
            const sourceUrl =
              typeof part.url === "string" ? part.url.trim() : "";
            if (!sourceUrl) return [];
            return [
              {
                type: "text",
                text: `[Attached source URL: ${sourceUrl}]`,
              },
            ];
          }

          return [part];
        })
        .filter((part) => {
          const toolName = getPartToolName(part);
          if (toolName === null) return true;
          return toolName.trim().length > 0;
        });
      if (parts.length === message.parts.length) return message;
      return { ...message, parts };
    })
    .filter((message) => {
      if (!Array.isArray(message.parts)) return true;
      return message.parts.length > 0;
    });
};

const normalizeTextValue = (value: unknown) => {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const normalizeModelMessageContent = (message: any) => {
  if (!Array.isArray(message?.content)) return message;

  const normalizedContent = message.content.map((part: any) => {
    if (part?.type === "text") {
      return {
        ...part,
        text: normalizeTextValue(part.text),
      };
    }
    return part;
  });

  const hasOnlyText = normalizedContent.every(
    (part: any) => part?.type === "text",
  );
  if (hasOnlyText) {
    return {
      ...message,
      content: normalizedContent
        .map((part: any) => part.text)
        .filter((text: string) => text.length > 0)
        .join("\n\n"),
    };
  }

  return {
    ...message,
    content: normalizedContent,
  };
};

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

const ATTACHMENT_CONTEXT_TEXT_MARKERS = [
  "[Attached source URL:",
  "[Attached file:",
  "OCR file:",
  "--- Extracted text content ---",
];

const ATTACHMENT_BLOCKED_DEFAULT_TOOLS = new Set<string>([
  DefaultToolName.Http,
  DefaultToolName.WebSearch,
  DefaultToolName.WebContent,
  DefaultToolName.YouTubeSearch,
  DefaultToolName.YouTubeTranscript,
  DefaultToolName.BrowserAgent,
]);

const hasAttachmentContextInMessage = (message: UIMessage) => {
  if (!Array.isArray(message.parts)) return false;
  return message.parts.some((part: any) => {
    if (part?.type === "file") return true;
    if (part?.type !== "text") return false;
    const text = typeof part.text === "string" ? part.text : "";
    return ATTACHMENT_CONTEXT_TEXT_MARKERS.some((marker) =>
      text.includes(marker),
    );
  });
};

const isPdfLikeAttachment = (attachment: {
  mediaType?: string;
  filename?: string;
  url?: string;
}) => {
  const mediaType = (attachment.mediaType || "").toLowerCase();
  if (mediaType === "application/pdf") return true;

  const filename = (attachment.filename || "").toLowerCase();
  if (filename.endsWith(".pdf")) return true;

  const url = attachment.url || "";
  if (
    /(^|[?&])contentType=application\/pdf(&|$)/i.test(url) ||
    /(^|[?&])content-type=application\/pdf(&|$)/i.test(url)
  ) {
    return true;
  }

  return false;
};

const verifyEmbedTurnstileToken = async ({
  token,
  request,
}: {
  token: string | undefined;
  request: Request;
}): Promise<{ ok: true } | { ok: false; status: number; message: string }> => {
  if (!token) {
    return { ok: false, status: 403, message: "Captcha token is required." };
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return {
      ok: false,
      status: 500,
      message: "TURNSTILE_SECRET_KEY is not configured.",
    };
  }

  const body = new URLSearchParams({ secret, response: token });
  const remoteIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "";
  if (remoteIp && remoteIp !== "unknown") {
    body.set("remoteip", remoteIp);
  }

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    return {
      ok: false,
      status: 502,
      message: "Captcha verification service is unavailable.",
    };
  }

  const result = (await response.json()) as { success?: boolean };
  if (!result.success) {
    return { ok: false, status: 403, message: "Captcha verification failed." };
  }

  return { ok: true };
};

// Trusted internal scheduler requests (cron tick worker) carry both an
// origin marker and a shared secret. We accept them in place of a
// Better Auth session so the scheduler worker can post to /api/chat
// without needing cookies. The secret is taken from
// SCHEDULER_INTERNAL_SECRET and falls back to CRON_SECRET.
const SCHEDULER_INTERNAL_HEADER = "x-scheduler-source";
const SCHEDULER_USER_HEADER = "x-scheduler-user-id";
const SCHEDULER_SECRET_HEADER = "x-scheduler-secret";

const isAuthorizedSchedulerRequest = (request: Request): boolean => {
  const source = request.headers.get(SCHEDULER_INTERNAL_HEADER);
  if (source !== "cron-tick") return false;
  const expected =
    process.env.SCHEDULER_INTERNAL_SECRET || process.env.CRON_SECRET;
  if (!expected) return false;
  const provided = request.headers.get(SCHEDULER_SECRET_HEADER);
  if (!provided || provided.length !== expected.length) return false;
  // Constant-time-ish comparison to avoid trivial timing leaks.
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
};

const resolveSchedulerUserId = (request: Request): string | null => {
  const headerUserId = request.headers.get(SCHEDULER_USER_HEADER);
  if (typeof headerUserId !== "string" || headerUserId.length === 0)
    return null;
  // The header is a UUID we issued into scheduled_job.user_id; a basic
  // shape check avoids blindly trusting an arbitrary string.
  return /^[0-9a-f-]{8,64}$/i.test(headerUserId) ? headerUserId : null;
};

const readScheduleText = (parts: unknown): string =>
  (Array.isArray(parts) ? parts : [])
    .map((p) =>
      p && typeof p === "object" && (p as { type?: string }).type === "text"
        ? String((p as { text?: unknown }).text ?? "")
        : "",
    )
    .join(" ")
    .trim();

// Prepend "/schedule" so `parseScheduleArgs` can match its own regex
// without the chat layer having to retain the original prefix.
const reconstructedScheduleText = (parts: unknown): string => {
  const text = readScheduleText(parts);
  return text ? `/schedule ${text}` : "/schedule";
};

const buildScheduleConfirmation = (params: {
  job: {
    cron: string;
    nextRunAt: Date;
    payload: Record<string, unknown> | null;
    name: string;
  };
}): string => {
  const isOnce = params.job.payload?.scheduleType === "once";
  if (isOnce) {
    return `Timer set for ${params.job.nextRunAt.toISOString()}. I'll run "${params.job.name}" then.`;
  }
  return `Scheduled "${params.job.name}" with cron \`${params.job.cron}\`. Next run: ${params.job.nextRunAt.toISOString()}.`;
};

const handleScheduleSlashCommand = async (params: {
  userId: string;
  threadId: string;
  message: UIMessage;
  agentId: string | undefined;
  request: Request;
}): Promise<Response | null> => {
  // Always persist the user message first so the thread reflects the
  // slash invocation regardless of success/failure.
  await chatRepository.upsertMessage({
    threadId: params.threadId,
    role: params.message.role,
    parts: params.message.parts.map(convertToSavePart),
    id: params.message.id,
  });

  const reconstructed = reconstructedScheduleText(params.message.parts);
  const parsed = parseScheduleArgs(reconstructed);
  if (!parsed.ok) {
    return streamScheduleAssistantMessage(
      params.request,
      params.threadId,
      `Couldn't create a schedule: ${parsed.error}`,
      "error",
    );
  }

  try {
    const job = await createScheduledJobFromSkill(
      params.userId,
      params.agentId,
      parsed,
      params.threadId,
    );
    return streamScheduleAssistantMessage(
      params.request,
      params.threadId,
      buildScheduleConfirmation({ job }),
      "ok",
      { job: publicScheduledJob(job) },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create schedule.";
    return streamScheduleAssistantMessage(
      params.request,
      params.threadId,
      `Couldn't create a schedule: ${message}`,
      "error",
    );
  }
};

const streamSkillNotFoundMessage = (
  request: Request,
  threadId: string,
  text: string,
): Response => {
  const assistantMessageId = generateUUID();
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({
        type: "text-start",
        id: `${assistantMessageId}-text`,
      });
      writer.write({
        type: "text-delta",
        id: `${assistantMessageId}-text`,
        delta: text,
      });
      writer.write({
        type: "text-end",
        id: `${assistantMessageId}-text`,
      });
      writer.write({ type: "finish" });
    },
    onFinish: async ({ isAborted }) => {
      if (isAborted) return;
      try {
        await chatRepository.upsertMessage({
          threadId,
          role: "assistant",
          parts: [{ type: "text", text }],
          id: assistantMessageId,
        });
      } catch (err) {
        logger.error("[skills] failed to persist assistant message", err);
      }
    },
  });
  void request;
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
    },
  });
};

const streamScheduleAssistantMessage = (
  request: Request,
  threadId: string,
  text: string,
  status: "ok" | "error",
  extra: Record<string, unknown> = {},
): Response => {
  const assistantMessageId = generateUUID();
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({
        type: "text-start",
        id: `${assistantMessageId}-text`,
      });
      writer.write({
        type: "text-delta",
        id: `${assistantMessageId}-text`,
        delta: text,
      });
      writer.write({
        type: "text-end",
        id: `${assistantMessageId}-text`,
      });
      writer.write({ type: "finish" });
    },
    onFinish: async ({ isAborted }) => {
      if (isAborted) return;
      try {
        await chatRepository.upsertMessage({
          threadId,
          role: "assistant",
          parts: [{ type: "text", text }],
          id: assistantMessageId,
        });
      } catch (err) {
        logger.error("[schedule] failed to persist assistant message", err);
      }
    },
  });

  // Surface the schedule metadata to the client via a header so the UI
  // can refresh its schedules list without waiting for a follow-up fetch.
  const responseHeaders = new Headers({
    "x-schedule-status": status,
  });
  if (status === "ok" && extra.job) {
    responseHeaders.set(
      "x-schedule-job-id",
      String((extra.job as { id?: string }).id ?? ""),
    );
  }

  void request; // reserved for future signal handling

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      ...Object.fromEntries(responseHeaders),
    },
  });
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
    const parsedBody = chatApiSchemaRequestBodySchema.parse(json);
    const embedPayload = parsedBody.embed;
    const isEmbedMode = embedPayload?.mode === "embed";

    const embedSession = isEmbedMode
      ? await embedSessionRepository.getEmbedSessionByToken(embedPayload.token)
      : null;
    if (isEmbedMode) {
      if (!embedSession || isEmbedSessionExpired(embedSession)) {
        return Response.json(
          {
            code: "invalid-embed-session",
            message: "Invalid or expired embed session.",
          },
          { status: 403 },
        );
      }

      if (shouldRequireEmbedCaptcha(embedSession)) {
        const captchaResult = await verifyEmbedTurnstileToken({
          token: embedPayload.captchaToken,
          request,
        });
        if (!captchaResult.ok) {
          return Response.json(
            {
              code: "embed-captcha-required",
              message: captchaResult.message,
            },
            { status: captchaResult.status },
          );
        }
      }

      const quotaResult = await applyEmbedSessionQuota(embedSession);
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
    }

    const session = await getSession();

    const isSchedulerRequest =
      !isEmbedMode && isAuthorizedSchedulerRequest(request);
    const schedulerUserId = isSchedulerRequest
      ? resolveSchedulerUserId(request)
      : null;

    if (!isEmbedMode && !isSchedulerRequest && !session?.user.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (isSchedulerRequest && !schedulerUserId) {
      logger.warn("[chat] scheduler request missing or invalid user id header");
      return new Response("Unauthorized", { status: 401 });
    }

    const effectiveUserId =
      session?.user.id ?? embedSession?.userId ?? schedulerUserId;
    if (!effectiveUserId) {
      return Response.json(
        {
          code: "embed-owner-missing",
          message: "Embed session is not linked to an owner.",
        },
        { status: 403 },
      );
    }

    const currentUser = await userRepository.getUserById(effectiveUserId);
    const userTier = currentUser?.tier;
    const isCurrentUserFree = isFreeTier(userTier);

    const guardResult =
      !isEmbedMode && !isSchedulerRequest
        ? await verifyChatRequestGuard({
            request,
            body: json,
            userId: effectiveUserId,
            sessionId: resolveChatSecuritySessionId(session),
            sessionIpAddress: resolveChatSecuritySessionIpAddress(session),
            sessionUserAgent: resolveChatSecuritySessionUserAgent(session),
          })
        : ({ ok: true } as const);
    if (!guardResult.ok) {
      return Response.json(
        {
          code: guardResult.code,
          message: guardResult.message,
        },
        { status: guardResult.status },
      );
    }

    if (!isEmbedMode && !isSchedulerRequest && isCurrentUserFree) {
      const usageCheck = await getFreeTierLimitCheck(effectiveUserId);
      if (!usageCheck.allowed) {
        const limits = await getFreeTierLimits();
        return Response.json(
          {
            code: "free-tier-token-limit-exceeded",
            message: `Daily free-tier token limit reached (${limits.dailyTokens.toLocaleString()}). Please upgrade or try again tomorrow.`,
            usage: {
              tokensUsed: usageCheck.tokensUsed,
              tokensLimit: limits.dailyTokens,
              resetAt: usageCheck.resetAt,
            },
          },
          { status: 429 },
        );
      }
    }

    const {
      id,
      message,
      chatModel,
      toolChoice,
      allowedAppDefaultToolkit,
      allowedMcpServers,
      imageTool,
      mentions = [],
      attachments = [],
    } = parsedBody;

    let effectiveToolChoice = toolChoice;
    let effectiveMentions = mentions;
    let effectiveAllowedMcpServers = allowedMcpServers;
    let effectiveAllowedAppDefaultToolkit = allowedAppDefaultToolkit;
    let effectiveImageTool = imageTool;
    if (isEmbedMode) {
      const policy = applyEmbedToolPolicy({
        toolChoice,
        mentions,
        allowedMcpServers,
        allowedAppDefaultToolkit,
        imageTool,
      });
      effectiveToolChoice = policy.toolChoice;
      effectiveMentions = policy.mentions as typeof mentions;
      effectiveAllowedMcpServers = policy.allowedMcpServers;
      effectiveAllowedAppDefaultToolkit = policy.allowedAppDefaultToolkit;
      effectiveImageTool = policy.imageTool;
    }

    const effectiveChatModel = chatModel;

    const model = customModelProvider.getModel(effectiveChatModel);
    const runtimeModel =
      customModelProvider.getModelWithFailureFallback(effectiveChatModel);

    let thread = await chatRepository.selectThreadDetails(id);

    if (!thread) {
      logger.info(`create chat thread: ${id}`);
      const newThread = await chatRepository.insertThread({
        id,
        title: "",
        userId: effectiveUserId,
      });
      thread = await chatRepository.selectThreadDetails(newThread.id);
    }

    if (!isSchedulerRequest && thread!.userId !== effectiveUserId) {
      return new Response("Forbidden", { status: 403 });
    }
    // For trusted scheduler requests, the thread was just created by the
    // worker with job.userId. Trust that and avoid an extra ownership
    // round-trip; the userId still flows from the worker header so we
    // are not running as the caller of /api/chat.

    const messages: UIMessage[] = (thread?.messages ?? []).map((m) => {
      return {
        id: m.id,
        role: m.role,
        parts: m.parts,
        metadata: m.metadata,
      };
    });

    if (messages.at(-1)?.id == message.id) {
      messages.pop();
    }
    const downloadFile = (key: string) => serverFileStorage.download(key);
    const [csvParts, konvoVisionParts] = await Promise.all([
      buildCsvIngestionPreviewParts(attachments, downloadFile),
      buildKonvOVisionIngestionPreviewParts(attachments, downloadFile),
    ]);
    const konvoHandledAttachmentUrls = new Set(
      konvoVisionParts.map((item) => item.attachmentUrl),
    );
    const pdfFallbackAttachments = attachments.filter(
      (attachment) =>
        isPdfLikeAttachment(attachment) &&
        !konvoHandledAttachmentUrls.has(attachment.url),
    );
    const pdfParts = await buildPdfIngestionPreviewParts(
      pdfFallbackAttachments,
      downloadFile,
    );

    const ingestionPreviewParts = [
      ...csvParts,
      ...konvoVisionParts.map((item) => item.part),
      ...pdfParts,
    ];
    if (ingestionPreviewParts.length) {
      const baseParts = [...message.parts];
      let insertionIndex = -1;
      for (let i = baseParts.length - 1; i >= 0; i -= 1) {
        if (baseParts[i]?.type === "text") {
          insertionIndex = i;
          break;
        }
      }
      if (insertionIndex !== -1) {
        baseParts.splice(insertionIndex, 0, ...ingestionPreviewParts);
        message.parts = baseParts;
      } else {
        message.parts = [...baseParts, ...ingestionPreviewParts];
      }
    }

    if (attachments.length) {
      const firstTextIndex = message.parts.findIndex(
        (part: any) => part?.type === "text",
      );
      const attachmentParts: any[] = [];

      attachments.forEach((attachment) => {
        const exists = message.parts.some(
          (part: any) =>
            part?.type === attachment.type && part?.url === attachment.url,
        );
        if (exists) return;

        if (attachment.type === "file") {
          // Safety net: only send file parts for image media types.
          // Non-image files (e.g. PDFs) should be handled by ingestion above.
          const mediaType = attachment.mediaType || "";
          if (mediaType.startsWith("image/")) {
            attachmentParts.push({
              type: "file",
              url: attachment.url,
              mediaType: attachment.mediaType,
              filename: attachment.filename,
            });
          } else {
            // Non-image file part — add as a text note instead of raw file
            attachmentParts.push({
              type: "text",
              text: `[Attached file: ${attachment.filename || "unknown"}]`,
            });
          }
        } else if (attachment.type === "source-url") {
          attachmentParts.push({
            type: "text",
            text: `[Attached source URL: ${attachment.url}]`,
          });
        }
      });

      if (attachmentParts.length) {
        if (firstTextIndex >= 0) {
          message.parts = [
            ...message.parts.slice(0, firstTextIndex),
            ...attachmentParts,
            ...message.parts.slice(firstTextIndex),
          ];
        } else {
          message.parts = [...message.parts, ...attachmentParts];
        }
      }
    }

    const resolvedSkillInvocation = !isEmbedMode
      ? await resolveSlashSkillInvocation(effectiveUserId, message)
      : null;
    if (resolvedSkillInvocation) {
      message.parts = resolvedSkillInvocation.cleanedMessage.parts;
    }
    if (resolvedSkillInvocation?.notFound) {
      // Unknown slash skill: reply gracefully instead of failing the whole
      // request. Persist the user message, then stream a short assistant
      // response listing the available skills so nothing is lost.
      await chatRepository.upsertMessage({
        threadId: thread!.id,
        role: message.role,
        parts: message.parts.map(convertToSavePart),
        id: message.id,
      });
      return streamSkillNotFoundMessage(
        request,
        thread!.id,
        resolvedSkillInvocation.notFoundMessage ?? "",
      );
    }

    messages.push(message);

    // Direct /schedule dispatch. Bypasses the LLM entirely so even
    // tool-call-weak models can still set timers, and so the response
    // is immediate and not subject to streaming latency.
    if (
      !isEmbedMode &&
      !isSchedulerRequest &&
      resolvedSkillInvocation?.skillName === SCHEDULE_SKILL_NAME
    ) {
      const agentId = (
        effectiveMentions.find((m) => m.type === "agent") as
          | Extract<ChatMention, { type: "agent" }>
          | undefined
      )?.agentId;

      const scheduleResponse = await handleScheduleSlashCommand({
        userId: effectiveUserId,
        threadId: thread!.id,
        message,
        agentId: agentId || undefined,
        request,
      });
      if (scheduleResponse) return scheduleResponse;
    }

    const supportToolCall = !isToolCallUnsupportedModel(model);

    const agentId = (
      effectiveMentions.find((m) => m.type === "agent") as Extract<
        ChatMention,
        { type: "agent" }
      >
    )?.agentId;

    const agent = await rememberAgentAction(agentId, effectiveUserId);

    if (agent?.instructions?.mentions) {
      effectiveMentions.push(...agent.instructions.mentions);
    }

    const useImageTool = Boolean(effectiveImageTool?.model);
    const useAutoImageTool =
      !isEmbedMode &&
      supportToolCall &&
      effectiveToolChoice !== "none" &&
      !useImageTool;
    const hasAttachments = attachments.length > 0;
    const hasAttachmentContext =
      hasAttachments ||
      hasAttachmentContextInMessage(message) ||
      messages.slice(-8).some(hasAttachmentContextInMessage);
    effectiveAllowedAppDefaultToolkit = hasAttachmentContext
      ? (
          effectiveAllowedAppDefaultToolkit ?? Object.values(AppDefaultToolkit)
        ).filter(
          (toolkit) =>
            toolkit !== AppDefaultToolkit.Http &&
            toolkit !== AppDefaultToolkit.WebSearch,
        )
      : effectiveAllowedAppDefaultToolkit;

    // Heuristic to detect "Thinking Mode"
    const isThinkingMode =
      chatModel?.model?.toLowerCase().includes("thinking") ||
      chatModel?.model?.toLowerCase().includes("reasoning");

    const isToolCallAllowed =
      supportToolCall &&
      (effectiveToolChoice != "none" || effectiveMentions.length > 0) &&
      !useImageTool;

    const metadata: ChatMetadata = {
      agentId: agent?.id,
      toolChoice: effectiveToolChoice,
      toolCount: 0,
      chatModel: chatModel,
    };

    await chatRepository.upsertMessage({
      threadId: thread!.id,
      role: message.role,
      parts: message.parts.map(convertToSavePart),
      id: message.id,
    });

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        // === Direct image generation bypass ===
        // When the user explicitly selects an image model (Generate/Edit
        // Image dropdown), run the image tool directly instead of routing
        // through the chat LLM. The orchestrating model may be rate-limited
        // and, for some providers (e.g. gemma), cannot emit tool calls at
        // all — so relying on it makes image generation fail. Generating
        // here keeps image gen fully independent of chat model availability.
        // Only fire on a genuine new user turn. The bypass produces a
        // provider-executed tool result; without this guard a stray
        // continuation could regenerate.
        if (
          useImageTool &&
          effectiveImageTool?.model &&
          message.role === "user"
        ) {
          const toolCallId = generateUUID();
          const promptText = (message.parts ?? [])
            .filter(
              (p: any) => p?.type === "text" && typeof p.text === "string",
            )
            .map((p: any) => p.text)
            .join(" ")
            .trim();
          const toolInput = {
            prompt: promptText || undefined,
            model: effectiveImageTool.model,
            size: effectiveImageTool.size,
          };
          dataStream.write({ type: "start" });
          // providerExecuted: true marks this as a server-executed tool so the
          // client does NOT auto-resubmit (lastAssistantMessageIsCompleteWith
          // ToolCalls ignores provider-executed parts). This prevents the
          // generation loop where a still-selected image model regenerated on
          // every auto-continuation.
          dataStream.write({
            type: "tool-input-available",
            toolCallId,
            toolName: ImageToolName,
            input: toolInput,
            providerExecuted: true,
          });
          try {
            const imageToolInstance = createFlareImageTool(
              effectiveImageTool.model,
              isThinkingMode,
              effectiveImageTool.size,
              { userId: effectiveUserId, userTier: userTier },
            );
            const output = await imageToolInstance.execute!(toolInput as any, {
              toolCallId,
              // UIMessage parts are shape-compatible with the tool's prompt/
              // image extractors, so the tool can still infer edit mode from
              // an attached image on the current message.
              messages: [{ role: "user", content: message.parts }] as any,
              abortSignal: request.signal,
            });
            dataStream.write({
              type: "tool-output-available",
              toolCallId,
              output,
              providerExecuted: true,
            });
          } catch (err: any) {
            logger.error("Direct image generation failed", err);
            dataStream.write({
              type: "tool-output-error",
              toolCallId,
              errorText:
                err?.message || "Image generation failed. Please try again.",
              providerExecuted: true,
            });
          }
          dataStream.write({ type: "finish" });
          return;
        }

        // Phase 1+#1 — start the memory embedding in parallel with the
        // MCP / workflow / app-tool loads. By the time the system prompt
        // is assembled below, the embedding is usually already in hand.
        // A 1.5s safety-net timeout falls back to `getAll` semantics if
        // the embed call is slow or fails, so the chat hot path is never
        // blocked on the memory lookup.
        //
        // P2.3 — fire the RAG retrieval in the same parallel block. The
        // retrieval call needs the same `lastUserText` and is bounded by
        // the same 1.5s safety-net. If retrieval is slow or yields
        // nothing, the retrieved-context section is simply omitted from
        // the prompt.
        const lastUserText = message.parts
          .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
          .filter(Boolean)
          .join("\n")
          .trim();
        const lastUserMessageEmbeddingPromise: Promise<number[] | null> =
          lastUserText.length > 0
            ? embedText(lastUserText)
                .then((r) => r.embedding)
                .catch((err) => {
                  logger.warn(
                    "Memory embed failed; falling back to getAll",
                    err,
                  );
                  return null;
                })
            : Promise.resolve(null);
        const retrievedChunksPromise: Promise<RetrievedChunk[]> =
          lastUserText.length > 0
            ? retrieveRelevantChunks(effectiveUserId, lastUserText, {
                topK: 5,
                minScore: 0.5,
              }).catch((err) => {
                logger.warn("RAG retrieval failed; skipping", err);
                return [] as RetrievedChunk[];
              })
            : Promise.resolve([] as RetrievedChunk[]);
        const embedTimeoutPromise = new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 1500);
        });
        const retrievalTimeoutPromise = new Promise<any[]>((resolve) => {
          setTimeout(() => resolve([]), 1500);
        });

        // Only load MCP tools if tool calls are allowed AND MCP servers are configured
        const hasMcpMentions = effectiveMentions.some(
          (m) => m.type === "mcpTool" || m.type === "mcpServer",
        );
        const hasAllowedMcpServers =
          effectiveAllowedMcpServers &&
          Object.keys(effectiveAllowedMcpServers).length > 0;

        // Skip MCP loading entirely if not needed - prevents blocking on timeout
        let mcpClients: Awaited<
          ReturnType<typeof mcpClientsManager.getClients>
        > = [];
        let mcpTools: Awaited<ReturnType<typeof mcpClientsManager.tools>> = {};

        if (isToolCallAllowed && (hasMcpMentions || hasAllowedMcpServers)) {
          try {
            mcpClients = await mcpClientsManager.getClients();
            mcpTools = await mcpClientsManager.tools();
            logger.info(
              `mcp-server count: ${mcpClients.length}, mcp-tools count :${Object.keys(mcpTools).length}`,
            );
          } catch (error) {
            logger.warn(
              "Failed to load MCP tools, continuing without them",
              error,
            );
          }
        } else {
          logger.info("Skipping MCP loading - not needed for this request");
        }

        const MCP_TOOLS = await safe()
          .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
          .map(() =>
            loadMcpTools({
              mentions: effectiveMentions,
              allowedMcpServers: effectiveAllowedMcpServers,
            }),
          )
          .orElse({});

        const WORKFLOW_TOOLS = await safe()
          .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
          .map(() =>
            loadWorkFlowTools({
              mentions: effectiveMentions,
              dataStream,
            }),
          )
          .orElse({});

        const APP_DEFAULT_TOOLS = await safe()
          .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
          .map(() =>
            loadAppDefaultTools({
              mentions: effectiveMentions.filter(
                (m) => !(m.type === "defaultTool" && m.name === "code-engine"),
              ),
              allowedAppDefaultToolkit: effectiveAllowedAppDefaultToolkit,
              userId: effectiveUserId,
              threadId: thread!.id,
            }),
          )
          .orElse({});
        const filteredAppDefaultTools = hasAttachmentContext
          ? Object.fromEntries(
              Object.entries(APP_DEFAULT_TOOLS).filter(
                ([toolName]) => !ATTACHMENT_BLOCKED_DEFAULT_TOOLS.has(toolName),
              ),
            )
          : APP_DEFAULT_TOOLS;

        // What the model is actually holding, so the prompt can describe its
        // own abilities instead of leaving it to infer them from tool schemas.
        // `availableButOff` is what lets it tell the user "enable web search
        // and I can do that" rather than simply failing.
        const siteEnabledCategories = await getEnabledCategories().catch(
          () => null,
        );
        const deploymentToolkits = TOOLKIT_CATALOG.filter(
          (t) =>
            !siteEnabledCategories ||
            siteEnabledCategories.has(t.configKey.toLowerCase()),
        ).map((t) => t.id);
        const activeToolkits = new Set<string>(
          effectiveAllowedAppDefaultToolkit ?? deploymentToolkits,
        );
        const promptCapabilities = {
          enabledToolkits: deploymentToolkits.filter((id) =>
            activeToolkits.has(id),
          ),
          availableButOff: deploymentToolkits.filter(
            (id) => !activeToolkits.has(id),
          ),
          supportsTools: supportToolCall,
          tier: userTier,
        };

        const codeEngineMention = effectiveMentions.find(
          (m) => m.type === "defaultTool" && m.name === "code-engine",
        );
        const codeEngineTool = codeEngineMention
          ? (() => {
              const executor = new NodeVMExecutor({ timeout: 60000 });
              return {
                [DefaultToolName.CodeEngine]: createCodeEngineTool(
                  filteredAppDefaultTools,
                  executor,
                ),
              };
            })()
          : {};
        const inProgressToolParts = extractInProgressToolPart(message);
        if (inProgressToolParts.length) {
          await Promise.all(
            inProgressToolParts.map(async (part) => {
              const output = await manualToolExecuteByLastMessage(
                part,
                {
                  ...MCP_TOOLS,
                  ...WORKFLOW_TOOLS,
                  ...filteredAppDefaultTools,
                  ...codeEngineTool,
                },
                request.signal,
              );
              part.output = output;

              dataStream.write({
                type: "tool-output-available",
                toolCallId: part.toolCallId,
                output,
                // providerExecuted: true tells the client this tool ran on the
                // server, so lastAssistantMessageIsCompleteWithToolCalls will
                // NOT auto-resend the conversation (which would re-execute
                // the same tool calls and duplicate the assistant message).
                providerExecuted: true,
              });
            }),
          );
        }

        const userPreferences = thread?.userPreferences || undefined;

        const mcpServerCustomizations = await safe()
          .map(() => {
            if (Object.keys(MCP_TOOLS ?? {}).length === 0)
              throw new Error("No tools found");
            return rememberMcpServerCustomizationsAction();
          })
          .map((v) => filterMcpServerCustomizations(MCP_TOOLS!, v))
          .orElse({});

        // Embed and scheduler requests both run without a Better Auth
        // session, so `session` is null for them — dereferencing it here
        // threw and surfaced as a 500 on every scheduled job run.
        const embedModeUser =
          isEmbedMode || isSchedulerRequest
            ? ({ id: effectiveUserId } as Parameters<
                typeof buildUserSystemPromptWithMemory
              >[0])
            : session!.user;

        // The user's own custom agents, so the assistant knows what they
        // created. The currently selected agent is excluded — its full
        // instructions are already in the prompt above.
        const userAgents = await safe()
          .map(() => agentRepository.selectAgentsByUserId(effectiveUserId))
          .map((agents) => agents.filter((a) => !agent || a.id !== agent.id))
          .orElse([]);
        // Prompt assembly follows the dsh (DeepSeek Harness) convention:
        // named sections ordered -100 (harness identity) -> 0 (persona) ->
        // 50 (capabilities) -> 100-199 (tool guidance) -> 200+ (dynamic
        // context). The harness goes first so the model always knows what
        // machinery it runs inside; per-request sections follow in order.
        const systemPrompt = await assemblePromptSections([
          {
            name: "agent-harness",
            order: -100,
            text: () => buildAgentHarnessCached(),
          },
          {
            name: "persona",
            order: 0,
            text: async () =>
              buildUserSystemPromptWithMemory(
                embedModeUser,
                userPreferences,
                agent,
                {
                  provider: chatModel?.provider,
                  model: chatModel?.model,
                },
                {
                  lastUserMessageEmbedding:
                    (await Promise.race([
                      lastUserMessageEmbeddingPromise,
                      embedTimeoutPromise,
                    ])) ?? undefined,
                  agentId: agent?.id,
                  threadId: thread!.id,
                  retrievedChunks: await Promise.race([
                    retrievedChunksPromise,
                    retrievalTimeoutPromise,
                  ]),
                  capabilities: promptCapabilities,
                },
              ),
          },
          {
            name: "user-agents",
            order: 50,
            text: () => buildUserAgentsPromptSection(userAgents),
          },
          {
            name: "mcp-servers",
            order: 60,
            text: () => buildMcpServersPromptSection(effectiveAllowedMcpServers),
          },
          {
            name: "tool-inventory",
            order: 100,
            text: () =>
              buildToolInventoryPromptSection({
                appDefault: Object.keys(filteredAppDefaultTools ?? {}),
                mcp: Object.keys(MCP_TOOLS ?? {}),
                workflow: Object.keys(WORKFLOW_TOOLS ?? {}),
              }),
          },
          {
            name: "mcp-customizations",
            order: 110,
            text: () =>
              buildMcpServerCustomizationsSystemPrompt(mcpServerCustomizations),
          },
          {
            name: "skills",
            order: 120,
            text: () => buildSkillSystemPrompt(resolvedSkillInvocation),
          },
          {
            name: "unsupported-model",
            order: 130,
            text: () =>
              !supportToolCall && buildToolCallUnsupportedModelSystemPrompt,
          },
        ]);

        // P2.3 — persist the RAG chunks on the assistant message so the
        // `<CitationList />` chip strip can re-render on refresh. We only
        // write when retrieval actually returned something; an empty
        // array is fine (the chip strip is a no-op for empty).
        const resolvedRetrievedChunks = await Promise.race([
          retrievedChunksPromise,
          retrievalTimeoutPromise,
        ]);
        if (resolvedRetrievedChunks && resolvedRetrievedChunks.length > 0) {
          metadata.retrievedChunks = resolvedRetrievedChunks;
        }

        const IMAGE_TOOL: Record<string, Tool> =
          useImageTool || useAutoImageTool
            ? {
                [ImageToolName]: createFlareImageTool(
                  imageTool?.model,
                  isThinkingMode,
                  imageTool?.size,
                  {
                    userId: effectiveUserId,
                    userTier: userTier,
                  },
                ),
              }
            : {};
        const vercelAITooles = safe({
          ...MCP_TOOLS,
          ...WORKFLOW_TOOLS,
          ...codeEngineTool,
        })
          .map((t) => {
            const bindingTools =
              toolChoice === "manual" ||
              (message.metadata as ChatMetadata)?.toolChoice === "manual"
                ? excludeToolExecution(t)
                : t;
            return {
              ...bindingTools,
              ...(codeEngineMention ? {} : filteredAppDefaultTools), // APP_DEFAULT_TOOLS Not Supported Manual
              ...IMAGE_TOOL,
            };
          })
          .unwrap();
        const sanitizedTools = sanitizeToolSchemas(vercelAITooles);
        metadata.toolCount = Object.keys(sanitizedTools).length;

        const allowedMcpTools = Object.values(allowedMcpServers ?? {})
          .map((t) => t.tools)
          .flat();

        logger.info(
          `${agent ? `agent: ${agent.name}, ` : ""}tool mode: ${toolChoice}, mentions: ${mentions.length}`,
        );

        logger.info(
          `allowedMcpTools: ${allowedMcpTools.length ?? 0}, allowedAppDefaultToolkit: ${effectiveAllowedAppDefaultToolkit?.length ?? 0}, hasAttachmentContext: ${hasAttachmentContext}`,
        );
        if (useImageTool || useAutoImageTool) {
          logger.info(
            `binding tool count Image: ${imageTool?.model || "auto"}`,
          );
        } else {
          logger.info(
            `binding tool count APP_DEFAULT: ${Object.keys(filteredAppDefaultTools ?? {}).length}, MCP: ${Object.keys(MCP_TOOLS ?? {}).length}, Workflow: ${Object.keys(WORKFLOW_TOOLS ?? {}).length}`,
          );
        }
        logger.info(`model: ${chatModel?.provider}/${chatModel?.model}`);

        const nativeImageInputSupported = supportsNativeImageInput(model);
        const hasBoundTools =
          supportToolCall && Object.keys(sanitizedTools).length > 0;
        const sanitizedMessages = sanitizeMessagesForModel(messages);
        const modelMessages = await Promise.resolve(
          convertToModelMessages(sanitizedMessages, {
            tools: hasBoundTools ? sanitizedTools : undefined,
            ignoreIncompleteToolCalls: true,
          }),
        );
        const preparedModelMessages = modelMessages
          .filter((message) => {
            if (!hasBoundTools && message.role === "tool") return false;
            return true;
          })
          .map((message) => {
            // Filter out non-image file parts from ALL messages
            // Non-image files (PDFs, CSVs, etc.) have their content extracted
            // by the ingestion pipeline and injected as text parts.
            // Sending raw file parts to OpenAI-compatible providers causes errors.
            // Note: system messages have string content, skip them
            if (message.role !== "system" && Array.isArray(message.content)) {
              const filteredContent = message.content.flatMap((part) => {
                if (part.type === "file") {
                  const mediaType =
                    (part as any).mediaType?.toLowerCase() || "";
                  if (mediaType.startsWith("image/")) {
                    const imageUrl =
                      typeof (part as any).url === "string"
                        ? (part as any).url
                        : "";
                    const imageUrlContextPart =
                      message.role === "user" && imageUrl
                        ? [
                            {
                              type: "text",
                              text: `[Attached image URL: ${imageUrl}]`,
                            },
                          ]
                        : [];

                    if (!nativeImageInputSupported) {
                      return imageUrlContextPart.length
                        ? imageUrlContextPart
                        : [{ type: "text", text: "[Attached image]" }];
                    }
                    if (
                      message.role === "assistant" &&
                      mediaType !== "image/png"
                    ) {
                      return [];
                    }
                    return [part, ...imageUrlContextPart];
                  }
                  // Strip non-image file parts (PDF, CSV, etc.)
                  // Their content was already extracted as text by ingestion
                  return [];
                }
                return [part];
              });

              // Also strip tool-call parts from assistant messages if tools not supported
              const finalContent =
                !hasBoundTools && message.role === "assistant"
                  ? filteredContent.filter((part) => part.type !== "tool-call")
                  : filteredContent;

              if (finalContent.length !== message.content.length) {
                return normalizeModelMessageContent({
                  ...message,
                  content: finalContent as any,
                });
              }
            }
            return normalizeModelMessageContent(message);
          })
          .filter((message) => {
            if (
              !hasBoundTools &&
              message.role === "assistant" &&
              Array.isArray(message.content) &&
              message.content.length === 0
            ) {
              return false;
            }
            return true;
          });
        const result = streamText({
          model: runtimeModel,
          system: systemPrompt,
          messages: preparedModelMessages,
          experimental_transform: smoothStream({
            chunking: "word",
            delayInMs: 0,
          }),
          maxRetries: 2,
          tools: hasBoundTools ? sanitizedTools : undefined,
          stopWhen: stepCountIs(10),
          toolChoice: hasBoundTools ? "auto" : undefined,
          abortSignal: request.signal,
        });
        result.consumeStream();
        // Any tool output the server streams was executed server-side (either
        // by streamText's step loop or by manualToolExecuteByLastMessage).
        // Marking those outputs providerExecuted: true is what keeps the
        // client's sendAutomaticallyWhen predicate
        // (lastAssistantMessageIsCompleteWithToolCalls) from auto-resending
        // the conversation: it ignores provider-executed parts, so without
        // this the SDK would re-submit the same assistant tool-call message,
        // the server would re-execute the tools and save a duplicate message
        // (and re-run sandbox commands) on every tool-calling turn.
        const uiMessageStream = result.toUIMessageStream({
          messageMetadata: ({ part }) => {
            if (part.type == "finish") {
              metadata.usage = part.totalUsage;
              if (!isEmbedMode && isCurrentUserFree) {
                const totalTokens = extractTotalTokens(part.totalUsage);
                if (totalTokens > 0) {
                  recordFreeTierTokenUsage(effectiveUserId, totalTokens);
                }
              }
              return metadata;
            }
          },
        });
        dataStream.merge(
          uiMessageStream.pipeThrough(
            new TransformStream({
              transform(chunk, controller) {
                if (
                  (chunk.type === "tool-output-available" ||
                    chunk.type === "tool-output-error") &&
                  !chunk.providerExecuted
                ) {
                  controller.enqueue({ ...chunk, providerExecuted: true });
                } else {
                  controller.enqueue(chunk);
                }
              },
            }),
          ),
        );
      },

      generateId: generateUUID,
      onFinish: async ({ responseMessage }) => {
        if (responseMessage.id == message.id) {
          await chatRepository.upsertMessage({
            threadId: thread!.id,
            ...responseMessage,
            id: generateUUID(),
            parts: responseMessage.parts.map(convertToSavePart),
            metadata,
          });
        } else {
          await chatRepository.upsertMessage({
            threadId: thread!.id,
            role: message.role,
            parts: message.parts.map(convertToSavePart),
            id: message.id,
          });
          await chatRepository.upsertMessage({
            threadId: thread!.id,
            role: responseMessage.role,
            id: responseMessage.id,
            parts: responseMessage.parts.map(convertToSavePart),
            metadata,
          });
        }

        if (agent) {
          agentRepository.updateAgent(agent.id, effectiveUserId, {
            updatedAt: new Date(),
          } as any);
        }

        // Phase 1+#1 — fire-and-forget memory extraction. The chat response
        // has already been streamed back to the user by the time we reach
        // this point, so any latency from the extraction is not on the
        // critical path of the visible response. We deliberately do NOT
        // await — onFinish must return promptly so the stream can close.
        // The orchestrator logs and swallows its own errors; this call site
        // is defensive only.
        void runMemoryExtraction({
          userId: effectiveUserId,
          userTier: userTier,
          threadId: thread!.id,
          agentId: agent?.id,
          agentName: agent?.name,
          threadTitle: thread!.title || undefined,
          userMessage: message,
          assistantMessage: responseMessage,
        }).catch((err) => {
          logger.error("Background memory extraction failed", err);
        });
      },
      onError: handleError,
      originalMessages: messages,
    });

    return createUIMessageStreamResponse({
      stream,
    });
  } catch (error: any) {
    logger.error(error);
    return Response.json(
      { message: "An internal error occurred. Please try again." },
      { status: 500 },
    );
  }
}
