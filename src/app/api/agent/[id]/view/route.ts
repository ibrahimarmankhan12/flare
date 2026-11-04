import "server-only";

import { getSession } from "auth/server";
import { colorize } from "consola/utils";
import { agentViewRepository } from "lib/db/repository";
import globalLogger from "logger";

export const dynamic = "force-dynamic";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Agent View API: `),
});

type RouteParams = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// P4.D — POST /api/agent/[id]/view
//
// Records one gallery page view. Auth is OPTIONAL — anonymous
// visitors are tracked with `user_id = null` so the agent's
// owner dashboard can show "X people have viewed this" without
// requiring sign-in. `referrer` is the upstream URL the visitor
// came from, sourced from the standard `Referer` header.
//
// Response: 204 No Content on success (or attempt — view rows are
// best-effort and we never want to block page render with an
// analytics failure). 400 for a missing id, 500 for unexpected
// repository errors.
//
// This route is fire-and-forget on the client side; see
// `<GalleryAgentCard />` in `src/components/agent-gallery.tsx`.
// ---------------------------------------------------------------------------

export async function POST(request: Request, { params }: RouteParams) {
  const { id: agentId } = await params;
  if (!agentId) {
    return new Response("Missing agent id", { status: 400 });
  }

  let userId: string | null = null;
  try {
    const session = await getSession();
    if (session?.user?.id) {
      userId = session.user.id;
    }
  } catch {
    // Session lookup is best-effort — anonymous views are the
    // default. Swallow any auth error.
  }

  const referrer = request.headers.get("referer") ?? null;

  try {
    await agentViewRepository.recordAgentView(agentId, userId, referrer);
  } catch (err) {
    // Never block the page on an analytics failure. Log and
    // still return 204.
    logger.warn(`recordAgentView failed for ${agentId} (non-fatal)`, err);
  }

  return new Response(null, { status: 204 });
}
