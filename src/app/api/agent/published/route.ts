import "server-only";

import { colorize } from "consola/utils";
import { agentInstallRepository } from "lib/db/repository";
import globalLogger from "logger";

// ISR — 5min revalidation. The gallery catalogue rarely changes, so
// this trades a few minutes of staleness for a 99% reduction in
// origin hits from anonymous visitors. Pairs with the matching
// `revalidate = 300` on the public /gallery/agents page.
export const dynamic = "force-static";
export const revalidate = 300;

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Agent Published API: `),
});

// ---------------------------------------------------------------------------
// P4.D — GET /api/agent/published
//
// Public catalogue of every published agent, ordered by
// `published_at DESC` (most recently published first). Anonymous
// access is allowed — no session check. Powers the
// /gallery/agents landing page and is also the read-side backing
// for the shared-agents strip in the in-app agents list.
//
// Output shape:
//   {
//     agents: [
//       {
//         id:               string
//         name:             string
//         description:      string | null
//         icon:             AgentIcon | null
//         installCount:     number
//         coverImageUrl:    string | null
//         galleryMetadata:  Record<string, unknown> | null
//         publishedAt:      string | null — ISO 8601
//       },
//       ...
//     ]
//   }
//
// Cache: Next.js ISR — the route is statically generated and
// revalidated every 5 minutes (revalidate = 300). A CDN can serve
// the same HTML/JSON to every visitor without hitting the DB.
// ---------------------------------------------------------------------------

const toIso = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value as unknown as string).toISOString();
};

export async function GET() {
  try {
    const rows = await agentInstallRepository.listPublishedAgents(50, 0);

    const agents = rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      icon: row.icon ?? null,
      installCount: row.installCount ?? 0,
      coverImageUrl: row.coverImageUrl ?? null,
      galleryMetadata: row.galleryMetadata ?? null,
      publishedAt: toIso(row.publishedAt as Date | string | null),
    }));

    return Response.json({ agents });
  } catch (err) {
    logger.error("Failed to list published agents", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
