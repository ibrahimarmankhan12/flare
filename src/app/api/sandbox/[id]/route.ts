import "server-only";

import { getSession } from "auth/server";
import {
  assertSandboxOwned,
  killSandboxById,
  pauseSandboxById,
  resumeSandbox,
} from "lib/sandbox/inventory";
import { z } from "zod";

// POST   /api/sandbox/[id]  { action: "resume" | "pause" }
// DELETE /api/sandbox/[id]                     — terminal
//
// Every handler re-checks ownership against E2B metadata before acting. A
// sandbox id in the URL is not proof of anything: without this, any signed-in
// user could resume someone else's box and read its filesystem.

export const dynamic = "force-dynamic";

const bodySchema = z.object({ action: z.enum(["resume", "pause"]) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const owned = await assertSandboxOwned(id, session.user.id);
  // 404 rather than 403: a user who does not own it should not learn it exists.
  if (!owned) return new Response("Not found", { status: 404 });

  try {
    if (parsed.data.action === "resume") {
      const { expiresAt } = await resumeSandbox(id);
      return Response.json({ ok: true, state: "running", expiresAt });
    }
    if (owned.state === "paused") {
      return Response.json({ ok: true, state: "paused" });
    }
    await pauseSandboxById(id);
    return Response.json({ ok: true, state: "paused", expiresAt: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const owned = await assertSandboxOwned(id, session.user.id);
  if (!owned) return new Response("Not found", { status: 404 });

  try {
    await killSandboxById(id);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
