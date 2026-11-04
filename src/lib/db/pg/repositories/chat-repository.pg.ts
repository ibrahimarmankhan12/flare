import { ChatMessage, ChatRepository, ChatThread } from "app-types/chat";

import { pgDb as db } from "../db.pg";
import {
  ChatMessageTable,
  ChatThreadTable,
  UserTable,
  ArchiveItemTable,
} from "../schema.pg";

import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export const pgChatRepository: ChatRepository = {
  insertThread: async (
    thread: Omit<ChatThread, "createdAt">,
  ): Promise<ChatThread> => {
    const [result] = (await db
      .insert(ChatThreadTable)
      .values({
        title: thread.title,
        userId: thread.userId,
        id: thread.id,
      })
      .returning()) as ChatThread[];
    return result;
  },

  deleteChatMessage: async (id: string): Promise<void> => {
    await db.delete(ChatMessageTable).where(eq(ChatMessageTable.id, id));
  },

  selectMessage: async (id: string): Promise<ChatMessage | null> => {
    const [result] = await db
      .select()
      .from(ChatMessageTable)
      .where(eq(ChatMessageTable.id, id));
    if (!result) return null;

    return {
      ...result,
      parts: result.parts ?? [],
      metadata: result.metadata ?? undefined,
    } as ChatMessage;
  },

  selectThread: async (id: string): Promise<ChatThread | null> => {
    const [result] = (await db
      .select()
      .from(ChatThreadTable)
      .where(eq(ChatThreadTable.id, id))) as ChatThread[];
    return result ?? null;
  },

  selectThreadDetails: async (id: string) => {
    if (!id) {
      return null;
    }
    const [thread] = await db
      .select()
      .from(ChatThreadTable)
      .leftJoin(UserTable, eq(ChatThreadTable.userId, UserTable.id))
      .where(eq(ChatThreadTable.id, id));

    if (!thread) {
      return null;
    }

    const messages = await pgChatRepository.selectMessagesByThreadId(id);
    return {
      id: thread.chat_thread.id,
      title: thread.chat_thread.title,
      userId: thread.chat_thread.userId,
      createdAt: thread.chat_thread.createdAt,
      userPreferences: thread.user?.preferences ?? undefined,
      messages,
    };
  },

  selectMessagesByThreadId: async (
    threadId: string,
  ): Promise<ChatMessage[]> => {
    const result = await db
      .select()
      .from(ChatMessageTable)
      .where(eq(ChatMessageTable.threadId, threadId))
      .orderBy(ChatMessageTable.createdAt);
    return result as ChatMessage[];
  },

  // Most recent chatModel used by the user (from the last message that
  // carries one), so the scheduler worker can trigger runs with the same
  // model the user chats with instead of the generic fallback.
  selectLatestChatModelByUserId: async (
    userId: string,
  ): Promise<{ provider: string; model: string } | null> => {
    const result = await db
      .select({
        metadata: ChatMessageTable.metadata,
      })
      .from(ChatMessageTable)
      .innerJoin(
        ChatThreadTable,
        eq(ChatThreadTable.id, ChatMessageTable.threadId),
      )
      .where(eq(ChatThreadTable.userId, userId))
      .orderBy(desc(ChatMessageTable.createdAt))
      .limit(30);
    for (const row of result) {
      const model = (
        row.metadata as {
          chatModel?: { provider?: string; model?: string };
        } | null
      )?.chatModel;
      if (model?.provider && model?.model) {
        return { provider: model.provider, model: model.model };
      }
    }
    return null;
  },

  selectThreadsByUserId: async (
    userId: string,
  ): Promise<
    (ChatThread & {
      lastMessageAt: number;
    })[]
  > => {
    const threadWithLatestMessage = await db
      .select({
        threadId: ChatThreadTable.id,
        title: ChatThreadTable.title,
        createdAt: ChatThreadTable.createdAt,
        userId: ChatThreadTable.userId,
        lastMessageAt: sql<string>`MAX(${ChatMessageTable.createdAt})`.as(
          "last_message_at",
        ),
      })
      .from(ChatThreadTable)
      .leftJoin(
        ChatMessageTable,
        eq(ChatThreadTable.id, ChatMessageTable.threadId),
      )
      .where(eq(ChatThreadTable.userId, userId))
      .groupBy(ChatThreadTable.id)
      .orderBy(desc(sql`last_message_at`));

    return threadWithLatestMessage.map((row) => {
      return {
        id: row.threadId,
        title: row.title,
        userId: row.userId,
        createdAt: row.createdAt,
        lastMessageAt: row.lastMessageAt
          ? new Date(row.lastMessageAt).getTime()
          : 0,
      };
    });
  },

  updateThread: async (
    id: string,
    thread: Partial<Omit<ChatThread, "id" | "createdAt">>,
  ): Promise<ChatThread> => {
    const [result] = (await db
      .update(ChatThreadTable)
      .set({
        title: thread.title,
      })
      .where(eq(ChatThreadTable.id, id))
      .returning()) as ChatThread[];
    return result;
  },
  upsertThread: async (
    thread: Omit<ChatThread, "createdAt">,
  ): Promise<ChatThread> => {
    const [result] = (await db
      .insert(ChatThreadTable)
      .values(thread)
      .onConflictDoUpdate({
        target: [ChatThreadTable.id],
        set: {
          title: thread.title,
        },
        // Multi-tenant guard: never let a conflicting id overwrite another
        // user's thread title. Without this predicate the PK-only conflict
        // target made the UPDATE fire regardless of ownership (IDOR write).
        setWhere: eq(ChatThreadTable.userId, thread.userId),
      })
      .returning()) as ChatThread[];
    if (!result) {
      throw new Error("Thread not found or not owned by caller");
    }
    return result;
  },

  deleteThread: async (id: string): Promise<void> => {
    // 1. Delete all messages in the thread
    await db.delete(ChatMessageTable).where(eq(ChatMessageTable.threadId, id));

    // 2. Remove thread from all archives
    await db.delete(ArchiveItemTable).where(eq(ArchiveItemTable.itemId, id));

    // 3. Delete the thread itself
    await db.delete(ChatThreadTable).where(eq(ChatThreadTable.id, id));
  },

  insertMessage: async (
    message: Omit<ChatMessage, "createdAt">,
  ): Promise<ChatMessage> => {
    const entity = {
      ...message,
      id: message.id,
    };
    const [result] = await db
      .insert(ChatMessageTable)
      .values(entity)
      .returning();
    return result as ChatMessage;
  },

  upsertMessage: async (
    message: Omit<ChatMessage, "createdAt">,
  ): Promise<ChatMessage> => {
    const result = await db
      .insert(ChatMessageTable)
      .values(message)
      .onConflictDoUpdate({
        target: [ChatMessageTable.id],
        set: {
          parts: message.parts,
          metadata: message.metadata,
        },
      })
      .returning();
    return result[0] as ChatMessage;
  },

  deleteMessagesByChatIdAfterTimestamp: async (
    messageId: string,
  ): Promise<void> => {
    const [message] = await db
      .select()
      .from(ChatMessageTable)
      .where(eq(ChatMessageTable.id, messageId));
    if (!message) {
      return;
    }
    // Delete messages that are in the same thread AND created before or at the same time as the target message
    await db
      .delete(ChatMessageTable)
      .where(
        and(
          eq(ChatMessageTable.threadId, message.threadId),
          gte(ChatMessageTable.createdAt, message.createdAt),
        ),
      );
  },

  deleteAllThreads: async (userId: string): Promise<void> => {
    const threadIds = await db
      .select({ id: ChatThreadTable.id })
      .from(ChatThreadTable)
      .where(eq(ChatThreadTable.userId, userId));
    await Promise.all(
      threadIds.map((threadId) => pgChatRepository.deleteThread(threadId.id)),
    );
  },

  deleteUnarchivedThreads: async (userId: string): Promise<void> => {
    const unarchivedThreadIds = await db
      .select({ id: ChatThreadTable.id })
      .from(ChatThreadTable)
      .leftJoin(
        ArchiveItemTable,
        eq(ChatThreadTable.id, ArchiveItemTable.itemId),
      )
      .where(
        and(
          eq(ChatThreadTable.userId, userId),
          sql`${ArchiveItemTable.id} IS NULL`,
        ),
      );

    await Promise.all(
      unarchivedThreadIds.map((threadId) =>
        pgChatRepository.deleteThread(threadId.id),
      ),
    );
  },

  insertMessages: async (
    messages: PartialBy<ChatMessage, "createdAt">[],
  ): Promise<ChatMessage[]> => {
    const result = await db
      .insert(ChatMessageTable)
      .values(messages)
      .returning();
    return result as ChatMessage[];
  },

  checkAccess: async (id: string, userId: string): Promise<boolean> => {
    const [result] = await db
      .select({
        userId: ChatThreadTable.userId,
      })
      .from(ChatThreadTable)
      .where(
        and(eq(ChatThreadTable.id, id), eq(ChatThreadTable.userId, userId)),
      );
    return Boolean(result);
  },

  forkThread: async (
    { sourceThreadId, forkFromMessageId, branchLabel },
    userId,
  ): Promise<ChatThread> => {
    // 1. Load the source thread (and its title for the new thread).
    const [sourceThread] = (await db
      .select()
      .from(ChatThreadTable)
      .where(
        and(
          eq(ChatThreadTable.id, sourceThreadId),
          eq(ChatThreadTable.userId, userId),
        ),
      )) as ChatThread[];

    if (!sourceThread) {
      throw new Error("Source thread not found or access denied");
    }

    // 2. Pull the whole source thread in a deterministic order, then find
    //    the fork point inside it.
    //
    //    Anchoring on the message id rather than on its timestamp is
    //    deliberate. Postgres stores `timestamp` with microsecond
    //    precision, while a JS Date carries only milliseconds — so a
    //    `createdAt` that has been round-tripped through the driver is
    //    almost always a few hundred microseconds OLDER than the row it
    //    came from. The previous `lte(createdAt, forkPoint.createdAt)`
    //    therefore excluded the fork point itself: every fork silently
    //    dropped the assistant message the user clicked "fork from here"
    //    on, which on a two-message thread produced a fork containing
    //    only the original question.
    //
    //    The secondary sort on id keeps the order stable if two messages
    //    ever share a timestamp.
    const threadMessages = (await db
      .select()
      .from(ChatMessageTable)
      .where(eq(ChatMessageTable.threadId, sourceThreadId))
      .orderBy(
        asc(ChatMessageTable.createdAt),
        asc(ChatMessageTable.id),
      )) as ChatMessage[];

    const forkIndex = threadMessages.findIndex(
      (msg) => msg.id === forkFromMessageId,
    );
    if (forkIndex === -1) {
      // Covers both "no such message" and "message belongs to another
      // thread", since we only ever searched this thread's messages.
      throw new Error("Fork message not found in source thread");
    }

    // 3. Everything up to and including the fork point. This is the
    //    "snapshot" the new thread starts from.
    const sourceMessages = threadMessages.slice(0, forkIndex + 1);

    // 4. Create the new thread. Title inherits from source with an
    //    optional " (branch)" suffix so the user can see at a glance
    //    which conversations are forks vs originals.
    const newThreadId = randomUUID();
    const newTitle = branchLabel
      ? `${sourceThread.title} (${branchLabel})`
      : `${sourceThread.title} (branch)`;

    const [createdThread] = (await db
      .insert(ChatThreadTable)
      .values({
        id: newThreadId,
        title: newTitle,
        userId,
        parentThreadId: sourceThreadId,
        forkFromMessageId,
        branchLabel: branchLabel ?? null,
      })
      .returning()) as ChatThread[];

    if (!createdThread) {
      throw new Error("Failed to create forked thread");
    }

    // 5. Copy each source message into the new thread, with a fresh
    //    id so the lineage is independent. `parts` and `metadata` are
    //    preserved verbatim — the user is forking the conversation
    //    *content*, not creating a new semantic thread.
    //
    //    We do NOT carry the `usage` token count, since the assistant
    //    hasn't been re-run on the fork yet and we don't want stale
    //    billing data attributed to a conversation that hasn't
    //    happened.
    const clonedMessages: Omit<ChatMessage, "createdAt">[] = sourceMessages.map(
      (msg) => ({
        id: randomUUID(),
        threadId: newThreadId,
        role: msg.role,
        parts: msg.parts,
        ...(msg.metadata
          ? {
              metadata: {
                ...msg.metadata,
                usage: undefined,
              },
            }
          : {}),
      }),
    );

    // Skip the per-row insert path and use bulk insertMessages for
    // a single round trip. (insertMessages lets Drizzle assign
    // createdAt via the column default.)
    await pgChatRepository.insertMessages(clonedMessages);

    return createdThread;
  },

  updateThreadInsights: async (
    threadId,
    userId,
    insights,
  ): Promise<ChatThread | null> => {
    // 1. Verify ownership. We re-check here as defence in depth — the
    //    route also calls `checkAccess` first, but the repository is
    //    the only place that can guarantee we never write insights to
    //    a thread the caller doesn't own.
    const [owner] = await db
      .select({ userId: ChatThreadTable.userId })
      .from(ChatThreadTable)
      .where(
        and(
          eq(ChatThreadTable.id, threadId),
          eq(ChatThreadTable.userId, userId),
        ),
      );
    if (!owner) {
      return null;
    }

    // 2. Map the LLM-friendly string lists into the schema's richer
    //    row shape. `at` is the persistence time so the UI can sort
    //    decisions chronologically. `done` defaults to false — the
    //    UI can mark items complete later.
    const now = new Date();
    const decisions = insights.decisions.map((text) => ({
      text,
      at: now.toISOString(),
    }));
    const actionItems = insights.actionItems.map((text) => ({
      text,
      done: false,
    }));

    // 3. Persist. We always overwrite the previous insights so a
    //    re-generation gives the user the freshest view.
    const [updated] = (await db
      .update(ChatThreadTable)
      .set({
        summary: insights.summary,
        decisions,
        actionItems,
        insightsGeneratedAt: now,
      })
      .where(
        and(
          eq(ChatThreadTable.id, threadId),
          eq(ChatThreadTable.userId, userId),
        ),
      )
      .returning()) as ChatThread[];

    return updated ?? null;
  },
};
