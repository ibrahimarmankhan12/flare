# MCP server marketplace

The MCP marketplace is a curated, public list of Model Context Protocol
servers that any signed-in user can browse and install. It is the
distribution channel for community MCP servers: the curator picks which
servers belong in the list, but every user gets to install whatever the
curator surfaces. A marketplace install is always a copy — the new
owner's row is decoupled from the original, so customizations do not
leak across users.

## What the marketplace is

The marketplace is a public read surface over a subset of the existing
`mcp_server` table. A server appears in the marketplace when its row
has `curated = true`. The list is sorted by `install_count` descending
so the most-installed servers surface first. A short category label
(`category varchar(64)`) is displayed next to the name so the page can
later be split into buckets (search, productivity, dev-tools, etc).

The page is server-rendered with ISR (revalidate every 5 minutes) and
the underlying data is queried by `mcpInstallRepository.listCuratedMcpServers`
in `src/lib/db/pg/repositories/mcp-install-repository.pg.ts`. There is
no login wall — anonymous visitors can see the list. Installing is the
only step that requires a session.

## How to discover

Two entry points, both public:

- **`/marketplace/mcp`** — the UI. A grid of cards, one per curated
  server. Each card shows the server's name, a short description, its
  category, and the live install count. A search box at the top
  filters by name or description substring.
- **`GET /api/mcp/curated`** — the raw API. Returns the same curated
  catalogue shape as the page: `{ servers: [...] }`, with public fields
  only (`id`, `name`, `description`, `category`, `installCount`,
  `homepageUrl`, `createdAt`). It currently serves the first 50 curated
  rows; no query params are wired yet.

Both paths serve the same rows. The page reads the repository directly
for server-rendering; the API exposes the same public catalogue to
non-Next.js clients.

## How to install

Every card has an "Install" button. The flow is:

1. The user clicks "Install". If they are not signed in, the client
   redirects to `/sign-in` and bounces back to the marketplace on
   success.
2. The client posts to **`POST /api/mcp/[id]/install`** with no body
   (the user id is the session, the server id is the URL parameter).
   The route requires a valid Better Auth session; missing session
   returns 401.
3. The route calls
   `mcpInstallRepository.installMcpServer({ mcpServerId: id, config: {} }, userId)`
   and then fire-and-forget calls
   `mcpInstallRepository.incrementInstallCount(mcpServerId)`. The install
   is idempotent on the `UNIQUE (user_id, mcp_server_id)` constraint —
   re-installing the same server is a no-op (the row's `config` is
   upserted to `{}`).
4. On 201, the response includes `{ installId, server }`. The UI can then
   refresh the user's installed list or send the user to their MCP
   dashboard.

The marketplace install is *not* the same thing as a "share with my
team" install. A personal install writes `org_id = NULL` on the
`mcp_server_install` row; a team install writes the team's id. The
button on a marketplace card always installs to the active personal
scope.

## The security model: copy-on-install

The marketplace is public and the install is one click, so the most
important property is that **a marketplace install does not inherit
the original owner's customizations.** The `mcp_server_install` row
references the shared `mcp_server` row by id, but the install
configurables — the `config` jsonb column on the install row, the
`mcpServerCustomization` and `mcpToolCustomization` rows that hang
off a user's MCP setup — all start empty for the new owner. The
installer can later override prompts, default tool visibility, or
auth settings on their own copy without affecting anyone else.

This is enforced at the route layer, not at the schema layer. The
`installMcpServer` repository method does not copy anything; the
customization repositories (mcp-server-customization-repository.pg.ts
and mcp-tool-customization-repository.pg.ts) have no awareness that
an install just happened. The "fork on install" property is a
property of the install endpoint, not a hidden side effect.

If you want to read customizations from a curated server to learn
what the curator has tuned, the underlying `mcp_server` row has
public defaults (description, homepage, category) that the route
exposes; the per-user customization tables are never read by the
marketplace code.

## Curator path (admin, out of scope for the Phase 4 UI)

A server is "curated" simply by setting
`mcp_server.curated = true` and `mcp_server.category = '<bucket>'`.
There is no admin UI for this in Phase 4. A curator does one of:

- A direct SQL update: `UPDATE mcp_server SET curated = true, category =
  'search' WHERE id = '<server-id>';`
- A future admin tool that wraps the same call.

The marketplace page is a pure read; nothing about it requires an
admin session.

## The pipeline at a glance

1. **Discover** — anonymous user lands on `/marketplace/mcp`. The
   Next.js page calls `mcpInstallRepository.listCuratedMcpServers(50, 0)`
   on the server, renders the cards, and ISR-caches the result for 5
   minutes. The install count comes from the denormalized
   `mcp_server.install_count` column.
2. **Install** — signed-in user clicks Install. The client posts to
   `POST /api/mcp/[id]/install`. The route requires a session,
   inserts (or upserts) the `mcp_server_install` row, and bumps
   `install_count` by one.
3. **Use** — the user opens a chat. The `mcp_server_install` row is
   resolved to the underlying `mcp_server` and the server's tools
   are made available to the LLM, subject to the user's own
   `mcpServerCustomization` and `mcpToolCustomization` overrides
   (both empty by default).
4. **Uninstall** — the installed-list UI posts `DELETE /api/mcp/[id]/install`,
   which deletes the caller's `mcp_server_install` row. The shared
   `mcp_server` row is untouched. The install-count cache is not decremented
   by the route today (see limits below).

## Limits and risks

- **50 servers per curated page.** `listCuratedMcpServers` defaults
  to `limit = 50` and the marketplace page does not paginate. The
  underlying query supports `limit` / `offset` (the partial
  `mcp_server_curated_idx` index makes it cheap), so infinite scroll
  is a one-screen follow-up. The API route also currently fixes the
  limit at 50 and does not parse query params.
- **5 minute ISR cache.** The marketplace page revalidates every
  5 minutes. A newly curated server can take up to 5 minutes to
  appear; an install click that just happened may show a stale count
  for the same window. This is the "eventually consistent" mentioned
  in the plan.
- **Install count is best-effort.** `incrementInstallCount` is
  `install_count + 1` and is called fire-and-forget after a successful
  install, so concurrent installs accumulate correctly without delaying
  the user response. The current uninstall route does not decrement the
  counter. The source of truth is the row count in `mcp_server_install`;
  the cache is for sort order.
- **No category taxonomy yet.** `category` is a free-text `varchar(64)`
  in the schema. The marketplace UI renders whatever string is set
  on the row. A controlled vocabulary is a Phase 5 follow-up.
- **No rate limit on the install endpoint.** A malicious signed-in
  user could spam-click Install (each click upserts the same row, so
  the worst case is a hot row, not unbounded data). A rate-limit
  guard is on the Phase 5 list.
- **Copy-on-install is enforced at the route layer.** Anyone
  refactoring the install path in the future must remember the
  fork-on-install rule: never read the curator's `mcpServerCustomization`
  or `mcpToolCustomization` rows. The shared `mcp_server` row's
  public fields (name, description, category, homepage_url) are the
  only inputs to the new install.

## See also

- `src/lib/db/pg/repositories/mcp-install-repository.pg.ts` — the
  install + curated-list data layer
- `src/app/api/mcp/curated/route.ts` — the public list endpoint
- `src/app/api/mcp/[id]/install/route.ts` — the install route
- `src/app/marketplace/mcp/page.tsx` — the public marketplace page
- `src/components/mcp-marketplace.tsx` — the card grid component
- `src/components/marketplace/my-installs-panel.tsx` — the installed
  MCP servers panel
- `src/lib/db/migrations/pg/0025_amber_assembly.sql` — the schema
  migration that adds `curated`, `category`, `install_count`,
  `description`, `homepage_url`, and the `mcp_server_install` table
