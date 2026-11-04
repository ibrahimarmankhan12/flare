import type { LanguageModelUsage, UIMessage } from "ai";
import type { RetrievedChunk } from "lib/rag/format";
import { CHAT_REQUEST_GUARD_VERSION } from "lib/security/chat-request-guard.shared";
import { tag } from "lib/tag";
import { z } from "zod";
import { AllowedMCPServerZodSchema } from "./mcp";
import { UserPreferences } from "./user";

export type ChatMetadata = {
  usage?: LanguageModelUsage;
  chatModel?: ChatModel;
  toolChoice?: "auto" | "none" | "manual" | "codemode";
  toolCount?: number;
  agentId?: string;
  // P2.3 — RAG chunks the assistant grounded its answer in. Persisted
  // on the assistant message so the citation chip strip can re-render
  // on refresh. See `src/lib/rag/retrieve.ts` and the
  // `<CitationList />` component in `src/components/chat/citation.tsx`.
  retrievedChunks?: RetrievedChunk[];
};

export type ChatModel = {
  provider: string;
  model: string;
};

export const ChatAttachmentSchema = z.object({
  type: z.enum(["file", "source-url"]),
  url: z.string(),
  mediaType: z.string().optional(),
  filename: z.string().optional(),
});

export type ChatAttachment = z.infer<typeof ChatAttachmentSchema>;

export type ChatThread = {
  id: string;
  title: string;
  userId: string;
  createdAt: Date;
  // Phase 1+#7 — thread branching. A thread is a root when
  // `parentThreadId` is null. A fork copies the source thread's
  // messages up to and including `forkFromMessageId` into a new
  // thread, leaving the original untouched.
  parentThreadId?: string | null;
  forkFromMessageId?: string | null;
  branchLabel?: string | null;
  // P2.4 — thread insights (summary + decisions + action items +
  // timestamp of last generation). All nullable; threads start
  // without insights and only get them after the user runs the
  // generation step (or a future background job).
  summary?: string | null;
  decisions?: Array<{ text: string; done?: boolean }> | null;
  actionItems?: Array<{ text: string; done?: boolean }> | null;
  insightsGeneratedAt?: Date | string | null;
};

export type ForkThreadInput = {
  sourceThreadId: string;
  forkFromMessageId: string;
  branchLabel?: string;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  role: UIMessage["role"];
  parts: UIMessage["parts"];
  metadata?: ChatMetadata;
  createdAt: Date;
};

export const ChatMentionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mcpTool"),
    name: z.string(),
    description: z.string().optional(),
    serverName: z.string().optional(),
    serverId: z.string(),
  }),
  z.object({
    type: z.literal("defaultTool"),
    name: z.string(),
    label: z.string(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal("mcpServer"),
    name: z.string(),
    description: z.string().optional(),
    toolCount: z.number().optional(),
    serverId: z.string(),
  }),
  z.object({
    type: z.literal("workflow"),
    name: z.string(),
    description: z.string().nullish(),
    workflowId: z.string(),
    icon: z
      .object({
        type: z.literal("emoji"),
        value: z.string(),
        style: z.record(z.string(), z.string()).optional(),
      })
      .nullish(),
  }),
  z.object({
    type: z.literal("agent"),
    name: z.string(),
    description: z.string().nullish(),
    agentId: z.string(),
    icon: z
      .object({
        type: z.literal("emoji"),
        value: z.string(),
        style: z.record(z.string(), z.string()).optional(),
      })
      .nullish(),
  }),
]);

export type ChatMention = z.infer<typeof ChatMentionSchema>;

export const ChatRequestSecuritySchema = z.object({
  version: z.number().int().min(CHAT_REQUEST_GUARD_VERSION),
  challengeId: z.string().min(12),
  challengeToken: z.string().min(16),
  difficulty: z.number().int().min(1).max(32),
  powNonce: z.string().min(1),
  powHash: z.string().regex(/^[a-fA-F0-9]{64}$/),
  requestHash: z.string().regex(/^[a-fA-F0-9]{64}$/),
  requestMac: z.string().regex(/^[a-fA-F0-9]{64}$/),
  captchaToken: z.string(),
  clientId: z.string().regex(/^[a-zA-Z0-9_-]{16,128}$/),
  clientPublicKey: z.string().regex(/^[A-Za-z0-9_-]{80,600}$/),
  clientProof: z.string().regex(/^[A-Za-z0-9_-]{40,2048}$/),
  solvedAt: z.number().int().positive(),
});

export type ChatRequestSecurity = z.infer<typeof ChatRequestSecuritySchema>;

export const chatApiSchemaRequestBodySchema = z.object({
  id: z.string(),
  message: z.any() as z.ZodType<UIMessage>,
  chatModel: z
    .object({
      provider: z.string(),
      model: z.string(),
    })
    .optional(),
  toolChoice: z.enum(["auto", "none", "manual", "codemode"]),
  mentions: z.array(ChatMentionSchema).optional(),
  imageTool: z
    .object({
      model: z.string().optional(),
      size: z.string().optional(),
    })
    .optional(),
  allowedMcpServers: z.record(z.string(), AllowedMCPServerZodSchema).optional(),
  allowedAppDefaultToolkit: z.array(z.string()).optional(),
  attachments: z.array(ChatAttachmentSchema).optional(),
  security: ChatRequestSecuritySchema.optional(),
  embed: z
    .object({
      mode: z.literal("embed"),
      token: z.string().min(16),
      captchaToken: z.string().optional(),
    })
    .optional(),
});

export type ChatApiSchemaRequestBody = z.infer<
  typeof chatApiSchemaRequestBodySchema
>;

export type ChatRepository = {
  insertThread(thread: Omit<ChatThread, "createdAt">): Promise<ChatThread>;

  selectThread(id: string): Promise<ChatThread | null>;

  deleteChatMessage(id: string): Promise<void>;

  selectMessage(id: string): Promise<ChatMessage | null>;

  selectThreadDetails(id: string): Promise<
    | (ChatThread & {
        messages: ChatMessage[];
        userPreferences?: UserPreferences;
      })
    | null
  >;

  selectMessagesByThreadId(threadId: string): Promise<ChatMessage[]>;

  selectLatestChatModelByUserId(
    userId: string,
  ): Promise<{ provider: string; model: string } | null>;

  selectThreadsByUserId(userId: string): Promise<
    (ChatThread & {
      lastMessageAt: number;
    })[]
  >;

  updateThread(
    id: string,
    thread: Partial<Omit<ChatThread, "id" | "createdAt">>,
  ): Promise<ChatThread>;

  deleteThread(id: string): Promise<void>;

  upsertThread(
    thread: PartialBy<Omit<ChatThread, "createdAt">, "userId">,
  ): Promise<ChatThread>;

  insertMessage(message: Omit<ChatMessage, "createdAt">): Promise<ChatMessage>;
  upsertMessage(message: Omit<ChatMessage, "createdAt">): Promise<ChatMessage>;

  deleteMessagesByChatIdAfterTimestamp(messageId: string): Promise<void>;

  deleteAllThreads(userId: string): Promise<void>;

  deleteUnarchivedThreads(userId: string): Promise<void>;

  checkAccess(id: string, userId: string): Promise<boolean>;

  /**
   * Phase 1+#7 — clone `sourceThreadId` up to and including the message
   * identified by `forkFromMessageId`. The new thread inherits the
   * source's title (suffixed with a branch label if provided), is
   * owned by the same user, and has `parentThreadId` / `forkFromMessageId`
   * set for navigation back to the source. Returns the newly created
   * thread.
   *
   * The caller is responsible for verifying the user owns the source
   * thread (typically via `checkAccess`) before calling this method.
   * Throws if the source thread is missing, the fork message is missing
   * or not part of the source thread, or the new thread cannot be created.
   */
  forkThread(input: ForkThreadInput, userId: string): Promise<ChatThread>;

  /**
   * P2.4 — persist a freshly generated insights record (summary, decisions,
   * action items) on a thread. The caller is responsible for verifying the
   * user owns the thread (typically via `checkAccess`) before calling this
   * method, but the implementation also re-checks ownership as defence in
   * depth and returns null if the thread is missing or owned by someone
   * else.
   *
   * `insightsGeneratedAt` is set to the current time.
   */
  updateThreadInsights(
    threadId: string,
    userId: string,
    insights: {
      summary: string;
      decisions: string[];
      actionItems: string[];
    },
  ): Promise<ChatThread | null>;

  insertMessages(
    messages: PartialBy<ChatMessage, "createdAt">[],
  ): Promise<ChatMessage[]>;
};

export const ManualToolConfirmTag = tag<{
  confirm: boolean;
}>("manual-tool-confirm");
