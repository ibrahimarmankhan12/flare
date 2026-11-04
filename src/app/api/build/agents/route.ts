import "server-only";

import { getSession } from "auth/server";
import { listAgentsForClient } from "lib/sandbox/agents";

// GET /api/build/agents — catalogue of coding agents for the mode picker.
// Reports which are usable on this deployment WITHOUT ever returning key
// values; only whether the required env var is set.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  // `?fresh=1` bypasses the 5-minute server cache. The picker polls with it
  // so a model added to the gateway shows up while the dropdown is open,
  // rather than up to five minutes later.
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  return Response.json(
    {
      agents: await listAgentsForClient(fresh),
      fetchedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
