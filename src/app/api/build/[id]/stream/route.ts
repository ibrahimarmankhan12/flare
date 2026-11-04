import "server-only";

import { getSession } from "auth/server";
import { buildJobRepository } from "lib/db/repository";
import { subscribeToBuild, type BuildEvent } from "lib/sandbox/build-events";

// ---------------------------------------------------------------------------
// GET /api/build/[id]/stream — live build output over SSE.
// ---------------------------------------------------------------------------
// Emits stage changes, raw model/agent output, file writes, and a terminal
// `done`. Buffered history replays on connect, so opening the page late (or
// reconnecting) still shows everything from the start.
//
// SSE rather than a websocket: it is one-way, survives proxies, and the
// browser reconnects on its own. A comment heartbeat every 15s keeps
// Cloudflare from closing an idle connection.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";
// Long-lived by design; the client closes it when the build settles.
export const maxDuration = 3600;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;

  // Ownership check before opening the stream — otherwise anyone with a build
  // id could watch someone else's output.
  const job = await buildJobRepository.getById(id, session.user.id);
  if (!job) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: BuildEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          // Client went away mid-write; cleanup happens in cancel().
        }
      };

      unsubscribe = subscribeToBuild(id, (event) => {
        send(event);
        if (event.type === "done") {
          // Give the last frame a moment to flush before closing.
          setTimeout(() => {
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }, 250);
        }
      });

      // If the build already finished before this connection, the replay above
      // included its `done` and the stream closes on its own.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          /* closed */
        }
      }, 15_000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stops nginx/Cloudflare buffering the stream into uselessness.
      "X-Accel-Buffering": "no",
    },
  });
}
