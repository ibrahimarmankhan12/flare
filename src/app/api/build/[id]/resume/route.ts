import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import { buildJobRepository } from "lib/db/repository";
import { resumeBuild } from "lib/sandbox/runner";

// POST /api/build/[id]/resume — reconnect to the sandbox, or replay the stored
// files into a fresh one if it has been reclaimed.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  try {
    const job = await buildJobRepository.getById(id, session.user.id);
    if (!job) return new Response("Not found", { status: 404 });
    // Resume can exceed Cloudflare's ~100s origin timeout when the original
    // sandbox is gone and the stored files have to be replayed into a fresh
    // one — the same 524 that broke POST /api/build. Return immediately and
    // let the detail page poll, consistent with how a build is started.
    void resumeBuild(job).catch(() => {
      // resumeBuild records failure on the row; this only prevents an
      // unhandled rejection.
    });
    return Response.json(
      { buildId: job.id, status: "resuming" },
      { status: 202 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("no stored files")) {
      return Response.json({ error: message }, { status: 409 });
    }
    return new Response(handleError(err), { status: 500 });
  }
}
