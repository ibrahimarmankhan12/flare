import "server-only";

import { getSession } from "auth/server";
import { isE2BConfigured } from "lib/sandbox/client";
import { listUserSandboxes } from "lib/sandbox/inventory";

// GET /api/sandbox — every sandbox the signed-in user owns.
//
// Scoped by `userId` metadata inside `listUserSandboxes`, so this cannot leak
// another user's sandboxes even though E2B itself is per-team.

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isE2BConfigured()) {
    return Response.json({ sandboxes: [], configured: false });
  }

  try {
    const sandboxes = await listUserSandboxes(session.user.id);
    return Response.json({ sandboxes, configured: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
