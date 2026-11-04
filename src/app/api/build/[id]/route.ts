import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import { buildJobRepository } from "lib/db/repository";
import { teardownBuild } from "lib/sandbox/runner";

// GET    /api/build/[id]   build status + files
// DELETE /api/build/[id]   kill the sandbox and delete the build

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  try {
    const job = await buildJobRepository.getById(id, session.user.id);
    // Same 404 for missing and not-owned so ids cannot be probed.
    if (!job) return new Response("Not found", { status: 404 });
    return Response.json({ build: job });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  try {
    const job = await buildJobRepository.getById(id, session.user.id);
    if (!job) return new Response("Not found", { status: 404 });
    // Kill the sandbox first — deleting the row without killing would orphan
    // a billing sandbox that nothing references.
    await teardownBuild(job);
    await buildJobRepository.delete(id, session.user.id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}
