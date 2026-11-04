# Public agent gallery

The public agent gallery is a browsable list of agents that other users
have chosen to share. Anyone — signed in or not — can open the gallery,
read the agent's description, see how many people installed it, and
click Install to add it to their own account. The gallery is the
distribution channel for community-built agents; the schema mirrors
the MCP marketplace so the two features feel like siblings.

## What the gallery is

The gallery is a public read surface over a subset of the existing
`agent` table. An agent appears in the gallery when its
`published_at` column is set. The list is sorted by
`published_at DESC` so the most recently shared agents surface first.
The optional `gallery_metadata` jsonb column carries
publisher-controlled display fields (tagline, sample prompts,
screenshots), and `cover_image_url` is the banner image on the
detail card.

A separate **`agent_view`** table records one row per page view so
the agent's owner can see "how popular is my agent?" later. The view
counter is denormalized for the card's headline number; the
authoritative count lives in the analytics table.

## How to publish an agent

Publishing is a single write: set `agent.published_at` and
(optionally) `agent.gallery_metadata` / `cover_image_url`. There is no
publisher UI in Phase 4 — the canonical paths are:

- A direct SQL update: `UPDATE agent SET published_at = now(),
  gallery_metadata = '{"tagline": "..."}'::jsonb WHERE id = '<id>'
  AND user_id = '<owner>';`
- A future "Publish" button on the agent editor that wraps the same
  call. The hook on the `webhook_event_outbox` for `agent.published`
  (from Phase 3) is already wired and will fire from the future
  button.

Un-publishing is the same update with `published_at = NULL` — the
row drops out of every gallery query because the
`agent_published_idx` partial index only covers non-null values.

## How to discover

Two entry points, both public:

- **`/gallery/agents`** — the UI. A grid of cards, one per published
  agent. Each card shows the agent's name, the gallery tagline from
  `gallery_metadata`, the cover image (or a placeholder), and the
  install count.
- **`GET /api/agent/published`** — the raw API. Returns the same
  catalogue shape as the page: `{ agents: [...] }`, with public fields
  (`id`, `name`, `description`, `icon`, `installCount`, `coverImageUrl`,
  `galleryMetadata`, `publishedAt`). It currently serves the first 50
  published rows; no query params are wired yet.

Both paths are server-rendered with a 5-minute ISR cache. The
underlying query uses
`agentInstallRepository.listPublishedAgents` in
`src/lib/db/pg/repositories/agent-install-repository.pg.ts`, which
hits the partial `agent_published_idx` index (only published rows
are in the index, so the gallery page stays fast as the agent
table grows).

## How to install

Every card has an "Install" button. The flow is:

1. The user clicks "Install". If they are not signed in, the client
   redirects to `/sign-in` and bounces back to the gallery on
   success.
2. The client posts to **`POST /api/agent/[id]/install`** with no
   body (the user id is the session, the agent id is the URL
   parameter). The route requires a valid Better Auth session;
   missing session returns 401.
3. The route calls
   `agentInstallRepository.installAgent({ agentId, config: {} }, userId, activeOrgId)`
   and then fire-and-forget calls
   `agentInstallRepository.incrementInstallCount(agentId)`. The install
   is idempotent on the `UNIQUE (user_id, agent_id)` constraint.
4. On 201, the response includes `{ installId, agent }`. The installed
   agents API (`GET /api/agent/installed`) can then show it in the
   user's private installed list.

The current install route reads `activeOrgId` from the Better Auth
session when present, otherwise falls back to personal scope (`null`).

## View analytics: the `agent_view` table

Every page view of a gallery card can insert one row into
`agent_view` through `agentViewRepository.recordAgentView`. The table
accepts `userId` as nullable — anonymous views are allowed — and an
optional upstream `referrer`. The Phase 4 public page and install route
currently do not call the analytics repository yet; the table and
repository are ready for the owner-dashboard follow-up. The design is
append-only, with no unique constraint and no upsert:

- `recordAgentView` is fire-and-forget — the gallery page does not
  await the insert, so a slow DB write does not delay the render.
- `countAgentViews(agentId)` is a cheap aggregate scan over the
  `(agent_id, viewed_at)` index for a lifetime count.
- `countAgentViewsByDay(agentId, days = 14)` is a per-day
  sparkline, suitable for a future agent-owner dashboard. It
  back-fills zero-count days so the sparkline is contiguous.

The gallery card's headline "X installs" number is the
denormalized `agent.install_count` cache; the
`agentViewRepository.countAgentViews` aggregate is the source of
truth for analytics and would surface on the agent owner's
detail page in a future iteration.

## The pipeline at a glance

1. **Publish** — the agent owner writes `published_at` and
   (optionally) `gallery_metadata` on the row. The
   `webhook_event_outbox` (Phase 3) fires an `agent.published`
   event for any subscriber that has opted in.
2. **Discover** — anonymous user lands on `/gallery/agents`. The
   Next.js page calls
   `agentInstallRepository.listPublishedAgents(50, 0)`. The page is
   ISR-cached for 5 minutes.
3. **Install** — signed-in user clicks Install. The client posts
   to `POST /api/agent/[id]/install`. The route requires a
   session, inserts (or upserts) the `agent_install` row, and bumps
   `install_count` by one.
4. **Use** — the user opens a chat with the installed agent. The
   agent is now a regular first-class agent in the user's
   account — they can edit it, share it, or un-publish (if they
   are the original author) at will.

## Limits and risks

- **50 agents per gallery page.** `listPublishedAgents` defaults
  to `limit = 50`. The query supports `limit` / `offset` and
  the `agent_published_idx` partial index makes it cheap, so
  infinite scroll is a one-screen follow-up. The public API route
  also currently fixes the limit at 50 and does not parse query params.
- **5 minute ISR cache.** The gallery page revalidates every
  5 minutes. A newly published agent can take up to 5 minutes
  to appear; install counts are stale for the same window. This
  is the "eventually consistent" install count mentioned in
  the plan.
- **Install count is best-effort and one-way.**
  `incrementInstallCount` is `install_count + 1`; uninstalls do
  not decrement. The source of truth is the row count in
  `agent_install`; the cache is for sort order.
- **`agent_view.recordAgentView` does not de-dupe.** High-volume
  inserts are expected once analytics recording is wired into the page
  or detail route. The caller should invoke it at most once per page
  render; spamming the route will multiply rows but does not corrupt
  the count.
- **Anonymous views are allowed and intentional.** The
  `agent_view.user_id` column is nullable and uses
  `ON DELETE SET NULL`. Anonymous browsing is a feature: the
  analytics still tell the owner "how many humans saw this
  card", without forcing a sign-in.
- **No publisher UI yet.** Publishing is a direct DB write. A
  future "Publish" button on the agent editor is on the
  follow-up list.
- **No moderation tools yet.** Anything an owner publishes
  appears immediately on the next ISR revalidation. A
  take-down / report flow is a Phase 5 hardening item.

## See also

- `src/lib/db/pg/repositories/agent-install-repository.pg.ts` —
  the install + published-list data layer
- `src/lib/db/pg/repositories/agent-view-repository.pg.ts` —
  the analytics data layer (`recordAgentView`,
  `countAgentViews`, `countAgentViewsByDay`)
- `src/app/api/agent/published/route.ts` — the public list
  endpoint
- `src/app/api/agent/[id]/install/route.ts` — the install route
- `src/app/gallery/agents/page.tsx` — the public gallery page
- `src/components/agent-gallery.tsx` — the card grid/card component
- `src/components/gallery/my-installed-agents.tsx` — the installed
  agents panel
- `src/lib/db/migrations/pg/0025_amber_assembly.sql` — the
  schema migration that adds `published_at`, `install_count`,
  `gallery_metadata`, `cover_image_url`, the `agent_install`
  table, and the `agent_view` analytics table
