import { getSession } from "auth/server";
import { chatRepository } from "lib/db/repository";
import { generateThreadInsights } from "lib/ai/memory/insights";
import { handleError } from "../../../chat/shared.chat";
import globalLogger from "logger";
import { colorize } from "consola/utils";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Insights API: `),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * P2.4 — POST /api/thread/[id]/insights
 *
 * Generates structured insights (summary + decisions + action items) for
 * a thread the caller owns, then persists them to the thread row. The
 * generation step is the only expensive part — it calls an LLM with the
 * full message transcript.
 *
 * The endpoint takes no body. The thread id comes from the URL.
 *
 * Auth: caller must own the thread (verified via checkAccess before
 * generateThreadInsights runs, and again in the repository's update).
 *
 * Response: 200 with the updated ChatThread JSON, 401 if unauthenticated,
 * 404 if the user does not own the thread, 500 if the LLM call or the
 * persistence fails.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;
  const { id: threadId } = await params;

  if (!threadId) {
    return new Response("Missing thread id", { status: 400 });
  }

  try {
    // Authorisation check: confirm the user owns the thread before
    // doing any LLM work. checkAccess returns false for threads the
    // user has never seen, so this also surfaces a 404 for unknown
    // ids rather than a 500 from a downstream FK error.
    const hasAccess = await chatRepository.checkAccess(threadId, userId);
    if (!hasAccess) {
      return new Response("Thread not found", { status: 404 });
    }

    // Load the transcript. We use the same selector the chat UI uses
    // so the LLM sees the same messages the user sees.
    const messages = await chatRepository.selectMessagesByThreadId(threadId);

    // Empty threads get an empty insights record — no LLM call. This
    // keeps the endpoint cheap for newly-created conversations.
    if (messages.length === 0) {
      const updated = await chatRepository.updateThreadInsights(
        threadId,
        userId,
        { summary: "", decisions: [], actionItems: [] },
      );
      if (!updated) {
        // The thread was deleted between checkAccess and the update.
        return new Response("Thread not found", { status: 404 });
      }
      return Response.json(updated);
    }

    // Run the LLM pass. The helper returns an empty sentinel on any
    // error, so we still persist *something* (an empty record) so the
    // caller can distinguish "insights not yet generated" from
    // "insights generated but empty". If the helper itself errored,
    // we surface a 500 so the client knows to retry.
    let insights;
    try {
      insights = await generateThreadInsights({ messages });
    } catch (err) {
      logger.error("insights generation threw", err);
      return new Response(handleError(err), { status: 500 });
    }

    const updated = await chatRepository.updateThreadInsights(
      threadId,
      userId,
      insights,
    );
    if (!updated) {
      return new Response("Thread not found", { status: 404 });
    }

    logger.info(
      `generated insights for thread ${threadId} (${messages.length} messages, ${insights.decisions.length} decisions, ${insights.actionItems.length} action items)`,
    );

    return Response.json(updated);
  } catch (err) {
    logger.error("insights generation failed", err);
    return new Response(handleError(err), { status: 500 });
  }
}
