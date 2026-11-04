import "server-only";
import { memoryRepository } from "lib/db/repository";
import { isFreeTier } from "app-types/subscription";
import { serverCache } from "lib/cache";
import logger from "logger";
import { embedBatch, embedText } from "./embed";
import { extractMemoryCandidates, ExtractionInput } from "./extract-memories";
import type { UIMessage } from "ai";

/**
 * Orchestrates the end-to-end memory extraction pipeline:
 *   1. Call the LLM to extract memory candidates from the latest turn.
 *   2. Embed each candidate in a single batch call.
 *   3. Persist each one to user_memory with the extracted metadata.
 *
 * Designed to be called fire-and-forget from the chat route's onFinish.
 * Any error is logged and swallowed — extraction must never break the chat.
 *
 * Cost control: free-tier users are debounced to roughly one extraction per
 * 10 messages via a Redis counter with a 24h TTL. Paid users extract on
 * every assistant message.
 */

const FREE_TIER_DEBOUNCE_EVERY_N = 10;
const FREE_TIER_DEBOUNCE_WINDOW_SECONDS = 24 * 60 * 60;

const debounceKey = (userId: string) => `mem:extract:counter:${userId}`;

const shouldRunForUser = async (
  userId: string,
  isFree: boolean,
): Promise<boolean> => {
  if (!isFree) return true;
  const key = debounceKey(userId);
  const current = (await serverCache.get<number>(key)) ?? 0;
  const next = current + 1;
  await serverCache.set(key, next, FREE_TIER_DEBOUNCE_WINDOW_SECONDS * 1000);
  return next === 1 || next % FREE_TIER_DEBOUNCE_EVERY_N === 0;
};

const extractTextFromMessage = (message: UIMessage | undefined): string => {
  if (!message?.parts || !Array.isArray(message.parts)) return "";
  return message.parts
    .map((part: any) => {
      if (typeof part?.text === "string") return part.text;
      if (part?.type === "text" && typeof part?.text === "string") {
        return part.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
};

export interface RunExtractionInput {
  userId: string;
  userTier: string | null | undefined;
  threadId: string;
  agentId?: string;
  agentName?: string;
  threadTitle?: string;
  userMessage: UIMessage;
  assistantMessage: UIMessage;
}

export interface RunExtractionResult {
  ran: boolean;
  reason?: "debounced" | "no-candidates" | "error";
  extracted: number;
  embedded: number;
  persisted: number;
  errors: string[];
}

const empty: RunExtractionResult = {
  ran: false,
  reason: "debounced",
  extracted: 0,
  embedded: 0,
  persisted: 0,
  errors: [],
};

export const runMemoryExtraction = async (
  input: RunExtractionInput,
): Promise<RunExtractionResult> => {
  const isFree = isFreeTier(input.userTier);

  if (!(await shouldRunForUser(input.userId, isFree))) {
    return empty;
  }

  const userText = extractTextFromMessage(input.userMessage);
  const assistantText = extractTextFromMessage(input.assistantMessage);

  const extractionInput: ExtractionInput = {
    userMessage: userText,
    assistantMessage: assistantText,
    agentName: input.agentName,
    threadTitle: input.threadTitle,
  };

  try {
    const { candidates } = await extractMemoryCandidates(extractionInput);
    if (candidates.length === 0) {
      return { ...empty, ran: true, reason: "no-candidates" };
    }

    // Drop low-confidence candidates before paying for embeddings.
    const usable = candidates.filter((c) => c.confidence >= 0.5);
    if (usable.length === 0) {
      return { ...empty, ran: true, reason: "no-candidates" };
    }

    let embeddings: Awaited<ReturnType<typeof embedBatch>> = [];
    try {
      embeddings = await embedBatch(usable.map((c) => c.content));
    } catch (err) {
      logger.warn("Batch embed failed; falling back to one-by-one", err);
      embeddings = [];
      for (const c of usable) {
        try {
          embeddings.push(await embedText(c.content));
        } catch (e) {
          logger.error("Per-text embed failed", e);
        }
      }
      if (embeddings.length === 0) {
        return {
          ran: true,
          reason: "error",
          extracted: usable.length,
          embedded: 0,
          persisted: 0,
          errors: ["All embedding attempts failed"],
        };
      }
    }

    const minLen = Math.min(usable.length, embeddings.length);
    const errors: string[] = [];
    let persisted = 0;

    for (let i = 0; i < minLen; i++) {
      const candidate = usable[i]!;
      const { embedding } = embeddings[i]!;
      try {
        await memoryRepository.create({
          userId: input.userId,
          content: candidate.content,
          category: candidate.category,
          scope: candidate.scope,
          scopeId:
            candidate.scope === "agent"
              ? input.agentId ?? null
              : candidate.scope === "thread"
                ? input.threadId
                : null,
          sourceMessageId: input.assistantMessage.id ?? null,
          confidence: candidate.confidence,
          isPinned: false,
          embedding,
        });
        persisted += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`persist: ${msg}`);
        logger.error("Failed to persist memory", err);
      }
    }

    return {
      ran: true,
      extracted: usable.length,
      embedded: minLen,
      persisted,
      errors,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("runMemoryExtraction failed", error);
    return {
      ran: true,
      reason: "error",
      extracted: 0,
      embedded: 0,
      persisted: 0,
      errors: [msg],
    };
  }
};
