import { getSession } from "auth/server";
import { chatRepository } from "lib/db/repository";
import { handleError } from "../../../chat/shared.chat";
import globalLogger from "logger";
import { colorize } from "consola/utils";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Fork API: `),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Phase 1+#7 — POST /api/thread/[id]/fork
 *
 * Forks a thread at a specific message. The source thread is identified
 * by `params.id`; the body specifies which message to fork from and an
 * optional branch label for the new thread's title.
 *
 * Body:
 *   - `forkFromMessageId` (required): the id of the assistant message
 *     the user clicked "Fork from here" on. Must belong to the source
 *     thread.
 *   - `branchLabel` (optional, max 100 chars): a short label appended
 *     to the new thread's title, e.g. "shorter" or "v2".
 *
 * Auth: caller must own the source thread (verified via checkAccess
 * before forkThread runs).
 *
 * Response: 200 with the new ChatThread JSON, 400 on validation error,
 * 401 if unauthenticated, 403 if the user does not own the source
 * thread, 404 if the source thread or fork message is missing.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;
  const { id: sourceThreadId } = await params;

  if (!sourceThreadId) {
    return new Response("Missing thread id", { status: 400 });
  }

  let body: { forkFromMessageId?: string; branchLabel?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const forkFromMessageId = body?.forkFromMessageId;
  if (typeof forkFromMessageId !== "string" || forkFromMessageId.length === 0) {
    return new Response("forkFromMessageId is required", { status: 400 });
  }

  const branchLabel = body?.branchLabel;
  if (branchLabel !== undefined) {
    if (typeof branchLabel !== "string" || branchLabel.length === 0) {
      return new Response("branchLabel must be a non-empty string", {
        status: 400,
      });
    }
    if (branchLabel.length > 100) {
      return new Response("branchLabel must be at most 100 characters", {
        status: 400,
      });
    }
  }

  try {
    // Authorization check: confirm the user owns the source thread
    // before attempting the fork. This also surfaces a 404 (because
    // checkAccess returns false) for source threads the user has
    // never seen — we want a 403/404 here rather than a 500 from
    // the repository's "access denied" error.
    const hasAccess = await chatRepository.checkAccess(
      sourceThreadId,
      userId,
    );
    if (!hasAccess) {
      return new Response("Source thread not found", { status: 404 });
    }

    const forked = await chatRepository.forkThread(
      { sourceThreadId, forkFromMessageId, ...(branchLabel ? { branchLabel } : {}) },
      userId,
    );

    logger.info(
      `forked thread ${sourceThreadId} @ ${forkFromMessageId} -> ${forked.id}`,
    );

    return Response.json(forked);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Source thread not found or access denied") {
      return new Response("Source thread not found", { status: 404 });
    }
    if (message === "Fork message not found in source thread") {
      return new Response("Fork message not found in source thread", {
        status: 404,
      });
    }
    if (message === "No messages found at or before the fork point") {
      return new Response("No messages found at or before the fork point", {
        status: 404,
      });
    }
    logger.error("fork failed", err);
    return new Response(handleError(err), { status: 500 });
  }
}
