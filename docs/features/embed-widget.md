# Embeddable widget

The embeddable widget lets a published Flare agent run inside another site as
an anonymous iframe chat. The host page loads `/embed.js`, the script mints a
short-lived embed session through `/api/embed/session`, and the iframe renders
`/embed/[agentId]` without requiring the visitor to sign in to Flare.

This is the Phase 5 external-support surface for public agents: support bots,
lead-capture assistants, documentation helpers, and partner pages where the
visitor should not get a full Flare account session.

## Setup snippet

Add the script once on the host page where the chat should appear:

```html
<div id="flare-chat"></div>
<script
  async
  src="https://app.flare.ai/embed.js"
  data-agent="agent_123"
  data-container="#flare-chat"
  data-width="100%"
  data-height="640px"
  data-radius="16px"
  data-title="Flare support chat"
></script>
```

The current script renders an iframe into `data-container` when provided, or
next to the script tag when no container is provided.

| Attribute | Required | Meaning |
| --- | --- | --- |
| `data-agent` | Yes | Published agent id to expose through the widget. |
| `data-container` | No | CSS selector for the element that should receive the iframe. Defaults to the script tag's parent. |
| `data-width` | No | iframe width. Defaults to `100%`. |
| `data-height` | No | iframe height. Defaults to `640px`. |
| `data-radius` | No | iframe border radius. Defaults to `16px`. |
| `data-title` | No | iframe title for accessibility. Defaults to `Flare chat`. |

The script should never include a Flare secret. It is safe to place in public
HTML because the server decides whether the agent is published before returning
an embed token.

## Current routes

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /embed.js` | Public | Dependency-free widget loader script. |
| `POST /api/embed/session` | Public, published-agent checked | Creates an anonymous embed session and returns `{ token, iframeUrl, expiresAt }`. |
| `GET /api/embed/session` | `Authorization: Bearer <embed-token>` | Returns public agent metadata and session expiry. |
| `POST /api/embed/session/chat` | `Authorization: Bearer <embed-token>` | Streams a chat response for the embedded agent. |
| `GET /embed/[agentId]?token=<embed-token>` | Embed token in URL | Renders the isolated iframe chat page. |

The normal signed-in app routes remain separate. Embed visitors should not be
sent to `/chat/[thread]`, and Better Auth cookies are not required for the
iframe route.

## Session and token flow

1. **Load script** — `/embed.js` reads `data-agent` from the current script tag.
2. **Create iframe shell** — the script creates an iframe with the configured
   dimensions and inserts it into the host page.
3. **Mint session** — the script calls `POST /api/embed/session` with
   `{ "agentId": "agent_123" }` and `credentials: "omit"`.
4. **Validate agent** — the server checks the agent is published through the
   gallery/install repository path.
5. **Persist session** — the server creates an `embed_session` row with a random
   anonymous token, a `free` rate-limit tier, and a 15-minute expiry.
6. **Sign token** — the server returns a signed embed JWT plus an iframe URL:
   `/embed/[agentId]?token=<jwt>`.
7. **Render iframe** — `/embed/[agentId]` verifies the token, session id,
   anonymous token, agent id, revocation state, and expiry before rendering
   `EmbedChat`.
8. **Chat** — `EmbedChat` posts user messages to `/api/embed/session/chat` with
   `Authorization: Bearer <jwt>`.

The embed token is a bearer capability. Anyone with the token can use that
session until it expires or the database row is revoked, so host pages should not
log or expose the iframe URL unnecessarily.

## Session persistence

The `embed_session` table is the durable anchor for anonymous usage.

| Field | Meaning |
| --- | --- |
| `agentId` | Published agent this session can access. |
| `userId` | Optional owner link used by the full chat route when embed mode proxies through `/api/chat`. |
| `anonymousToken` | Random session token stored in the DB and embedded in the signed JWT payload. |
| `rateLimitTier` | `free`, `pro`, `team`, or `business`. Defaults to `free`. |
| `dailyMessageCount` | Current accepted-message count for the daily quota window. |
| `dailyResetAt` | Start timestamp used to compute the next daily reset. |
| `firstMessageCaptchaAt` | Timestamp for the first-message captcha check when the full chat route is used in embed mode. |
| `expiresAt` | Hard session expiry. Current minted sessions last 15 minutes. |
| `revokedAt` | Manual kill switch for abuse or customer shutdown. |

Session reads and writes go through
`src/lib/db/pg/repositories/embed-session-repository.pg.ts`.

## Quotas and captcha

Embed abuse controls are enforced before model spend in the full embed-mode chat
path.

Current daily message quotas:

| Tier | Daily accepted messages |
| --- | ---: |
| `free` | 20 |
| `pro` | 100 |
| `team` | 500 |
| `business` | 2,000 |

Behavior:

- **Daily reset** — `dailyMessageCount` resets when `dailyResetAt + 24h` is in
  the past.
- **Quota exceeded** — the stricter `/api/chat` embed-mode path returns `429`
  with `code: "embed-quota-exceeded"`, the tier, limit, remaining count, and
  reset timestamp.
- **First-message captcha** — when embed mode is handled by `/api/chat`, the
  first message requires Turnstile verification before quota is consumed.
- **Expired/revoked session** — the server returns `403` or `404` depending on
  the route; no model call is made.

`/api/embed/session/chat` currently increments the message count after starting
the stream. The stricter quota helper lives in `src/lib/embed/quota.ts` and is
used by the main `/api/chat` embed-mode path.

## Tool and data restrictions

Embed visitors are anonymous and must not inherit the owner's private account
surface.

| Area | Embed behavior |
| --- | --- |
| Auth | Signed embed JWT plus `embed_session`; no Better Auth visitor session. |
| Agent access | One published agent per session. |
| Tools | Prompt input disables manual tools; embed policy helpers deny MCP, OAuth, workflow, browser, build/sandbox, admin, memory, API-key, webhook, scheduler, connector, image, and broad app toolkits. |
| Files | No arbitrary account file browser. Any future uploads need type and size caps. |
| Memory | No cross-user visitor memory. Owner/user memory is only available when a linked owner id is present in the server-side embed path. |
| MCP | Private user MCP servers are not exposed to anonymous visitors. |
| Admin/API | No access to admin, marketplace install, API-key, billing, team, or webhook management routes. |

The iframe should assume the parent page is untrusted. The parent can host or
remove the iframe, but chat messages still go through the iframe UI and
server-side token/session checks.

## CSP and frame restrictions

Flare keeps strict frame protections on the main app and only loosens embed
routes.

Main app default headers:

```http
X-Frame-Options: SAMEORIGIN
Content-Security-Policy: frame-ancestors 'self';
```

Current embed route headers:

```http
Content-Security-Policy: frame-ancestors *;
Permissions-Policy: camera=(), microphone=(), clipboard-read=(), clipboard-write=(self)
```

Rules for production hardening:

- **Keep the exception route-scoped.** Only `/embed/:path*` and `/embed.js`
  should be frameable.
- **Do not loosen the main app.** Signed-in Flare routes should keep
  `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`.
- **Prefer explicit origins.** The current implementation uses
  `frame-ancestors *` for broad compatibility. Customer deployments should move
  toward per-agent origin allowlists and emit only those origins.
- **Do not use `X-Frame-Options` on embed routes.** `SAMEORIGIN` blocks
  third-party embedding and `ALLOW-FROM` is obsolete; CSP is the control.
- **Validate runtime messages.** CSP controls framing. If postMessage events are
  added later, each event must validate `event.origin` and message shape.

## Rotation and revocation

Embed sessions are short-lived, so normal rotation means minting a new session:

1. Host page reloads or re-runs `/embed.js`.
2. Script calls `POST /api/embed/session` again.
3. Server creates a new `embed_session` row and signed JWT.
4. Old sessions naturally expire after 15 minutes or can be revoked by setting
   `revokedAt`.

For abuse response, revoke the row rather than trying to invalidate every copied
iframe URL at the CDN layer.

## Operational notes

- **`embed.js` is cacheable.** It returns `Cache-Control: public, max-age=300,
  stale-while-revalidate=3600`.
- **Widget script is dependency-free.** It uses browser APIs only and should stay
  small.
- **Provider details stay private.** The host page only receives an iframe URL
  and high-level browser errors; provider/model internals stay server-side.
- **Agent publication is the gate.** Only published agents are returned by the
  current session creation path.
- **Origin allowlists are not fully implemented yet.** Do not document
  `data-origin` as active enforcement until a server-side allowlist exists.

## See also

- `src/app/embed.js/route.ts` — public widget loader script.
- `src/app/api/embed/session/route.ts` — embed session creation, metadata, and
  chat stream route.
- `src/app/embed/[agentId]/page.tsx` — iframe page token/session validation.
- `src/components/embed-chat.tsx` — iframe chat UI.
- `src/lib/auth/embed-jwt.ts` — signed embed token helpers.
- `src/lib/embed/quota.ts` — daily quota helper.
- `src/lib/embed/tool-policy.ts` — anonymous tool restriction helpers.
- `src/lib/db/pg/repositories/embed-session-repository.pg.ts` — session data
  layer.
- `next.config.ts` — main-app and embed-specific security headers.
