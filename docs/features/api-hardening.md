# API hardening

API hardening is the Phase 5 layer around Flare's public REST and webhook
surface. Phase 3 shipped API keys and signed webhook delivery primitives; Phase
5 adds operational controls: per-key/IP rate limits, usage accounting, key
rotation, safe key display metadata, webhook subscription management, delivery
visibility, and health stats.

The goal is simple: external callers can integrate with Flare without sharing a
browser session, while users can see which keys and webhooks are active, how much
they are used, when they fail, and how to rotate or shut them down without
surprise downtime.

## What is hardened

| Surface | Baseline | Phase 5 hardening |
| --- | --- | --- |
| API keys | Issue/list/patch/revoke, sha-256 hashed at rest | `lastFour`, rotation metadata, grace windows, usage endpoint. |
| REST calls | Scope checks on `/api/v1/...` | `withApiKeyUsage` wrapper records usage and enforces per-key plus per-IP buckets. |
| Webhooks | Signed delivery and outbox worker | Session-authenticated subscription CRUD plus delivery list and health fields. |
| Dashboard data | Minimal key/subscription metadata | Usage summaries, quota state source data, failure counts/reasons, recent deliveries. |

## Public REST surface

External callers authenticate with `Authorization: Bearer ck_live_...` and call
routes under `/api/v1`.

| Method | Route | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/threads` | `threads:read` | List caller-owned threads. |
| `POST` | `/api/v1/threads` | `threads:write` | Create a thread. |
| `GET` | `/api/v1/threads/[id]` | `threads:read` | Fetch one owned thread. |
| `PATCH` | `/api/v1/threads/[id]` | `threads:write` | Rename one owned thread. |
| `DELETE` | `/api/v1/threads/[id]` | `threads:write` | Delete one owned thread. |
| `GET` | `/api/v1/threads/[id]/messages` | `threads:read` | List messages for an owned thread. |
| `POST` | `/api/v1/threads/[id]/messages` | `messages:write` | Insert a user message into an owned thread. |
| `GET` | `/api/v1/agents` | `agents:read` | List caller-owned agents. |

Example request:

```bash
curl https://app.flare.ai/api/v1/threads   -H "Authorization: Bearer ck_live_..."
```

Scope matching supports exact scopes, prefix wildcards like `threads:*`, and the
global `*` scope. Missing or malformed keys return `401`; valid keys without the
required scope return `403`.

## API key management routes

API key management is session-authenticated through Better Auth, not bearer-key
auth. Plaintext keys are only returned at creation or rotation time.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/api-key` | List the signed-in user's keys. Hashes are never returned. |
| `POST` | `/api/api-key` | Create a key and return `fullKey` once. |
| `GET` | `/api/api-key/[id]` | Fetch safe metadata for one owned key. |
| `PATCH` | `/api/api-key/[id]` | Rename a key or replace its scopes. |
| `DELETE` | `/api/api-key/[id]` | Soft-revoke a key by setting `revokedAt`. |
| `POST` | `/api/api-key/[id]/rotate` | Create a replacement key and mark the old key with a grace window. |
| `GET` | `/api/api-key/[id]/usage?days=30` | Return grouped usage rows and totals for one owned key. |

Create request:

```http
POST /api/api-key
Cookie: <Better Auth session>
Content-Type: application/json

{
  "name": "Production sync",
  "scopes": ["threads:read", "messages:write"],
  "expiresAt": "2026-12-31T23:59:59.000Z"
}
```

Create response:

```json
{
  "id": "key_123",
  "fullKey": "ck_live_<shown-once>",
  "prefix": "ck_live_…",
  "scopes": ["threads:read", "messages:write"],
  "lastFour": "Ab9z",
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "createdAt": "2026-06-01T12:00:00.000Z"
}
```

Dashboard lists should show `prefix`, `lastFour`, scopes, `lastUsedAt`,
`expiresAt`, `revokedAt`, and `createdAt`. They must never show `keyHash` or
recover old plaintext keys.

## API rate limits

Every `/api/v1` route should use `withApiKeyUsage(...)` from
`src/lib/auth/api-key.ts`. The wrapper performs authentication, scope checks,
key/IP rate limiting, handler execution, and usage recording.

Current defaults:

| Bucket | Default |
| --- | ---: |
| Per API key | 120 requests / minute |
| Per IP | 300 requests / minute |
| Window | 60 seconds |

Rate-limit buckets are stored in `api_rate_limit_bucket` through
`apiUsageRepository.incrementRateLimitBucket(...)`. Bucket keys are shaped like:

```text
api:<kind>:<id>:<windowMs>:<windowStart>
```

For example:

```text
api:key:key_123:60000:1780310400000
api:ip:203.0.113.10:60000:1780310400000
```

Current `429` response:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 42

Too many requests
```

The helper returns a precise `Retry-After`. It does not currently emit
`X-RateLimit-*` headers, so clients should rely on `Retry-After` for backoff.

## Usage tracking

Every authenticated `/api/v1` request handled by `withApiKeyUsage` writes an
`api_key_usage` row after auth.

Recorded fields:

| Field | Meaning |
| --- | --- |
| `apiKeyId` | Authenticated API key id. |
| `userId` | Owner of the key. |
| `route` | Logical route group passed to `withApiKeyUsage`. |
| `method` | Uppercase HTTP method. |
| `status` | Final response status. |
| `costUnits` | Optional cost accounting value; defaults to `1` on handler success and `0` for authz/rate-limit failures. |
| `createdAt` | Timestamp used for charts and summaries. |

Usage endpoint:

```http
GET /api/api-key/key_123/usage?days=30
Cookie: <Better Auth session>
```

Response shape:

```json
{
  "key": {
    "id": "key_123",
    "name": "Production sync",
    "prefix": "ck_live_…",
    "lastFour": "Ab9z",
    "scopes": ["threads:read"],
    "lastUsedAt": "2026-06-01T12:05:00.000Z",
    "expiresAt": null,
    "revokedAt": null,
    "rotatedFromKeyId": null,
    "rotationGraceEndsAt": null,
    "createdAt": "2026-06-01T12:00:00.000Z"
  },
  "days": 30,
  "totals": { "requests": 42, "costUnits": 42 },
  "usage": [
    {
      "day": "2026-06-01",
      "route": "/api/v1/threads",
      "method": "GET",
      "status": 200,
      "requests": 20,
      "costUnits": 20
    }
  ]
}
```

Usage recording happens for successful handler responses, missing-scope `403`,
and rate-limited `429` responses. Missing or malformed credentials return `401`
without a key id, so there is no key-specific usage row to write.

## Key rotation

Rotation is first-class on `/api/api-key/[id]/rotate`. It creates a replacement
key, carries forward the old key's name/scopes/expiry, records `lastFour`, and
sets a grace window on the old key.

Request:

```http
POST /api/api-key/key_old/rotate
Cookie: <Better Auth session>
Content-Type: application/json

{ "graceHours": 24 }
```

Response:

```json
{
  "id": "key_new",
  "fullKey": "ck_live_<shown-once>",
  "prefix": "ck_live_…",
  "scopes": ["threads:read", "messages:write"],
  "expiresAt": null,
  "rotatedFromKeyId": "key_old",
  "rotationGraceEndsAt": "2026-06-02T12:00:00.000Z",
  "createdAt": "2026-06-01T12:00:00.000Z"
}
```

Rules:

- **Owner-scoped** — users can rotate only keys they own.
- **Plaintext shown once** — `fullKey` is returned only in the rotation response.
- **Grace window bounded** — `graceHours` is optional and must be between `1`
  and `168`; default is `24`.
- **Scopes carry forward** — rotation does not silently widen scopes.
- **Old key is marked** — `rotationGraceEndsAt` is set on the old key; the new
  key stores `rotatedFromKeyId`.

Operational caveat: `authenticateApiKey(...)` currently rejects only revoked and
expired keys. If strict grace-window enforcement is required, verify that the
repository/auth path rejects old rotated keys after `rotationGraceEndsAt` before
relying on automatic cutoff.

## Webhook management routes

Webhook subscription management is session-authenticated. The route stores a
`secretHash` plus the current plaintext `signingSecret` needed by the worker to
sign outgoing deliveries. The plaintext secret is returned at create time and can
be replaced by PATCH.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/webhook-subscription` | List the signed-in user's subscriptions. |
| `POST` | `/api/webhook-subscription` | Create a subscription and reveal the signing secret once. |
| `GET` | `/api/webhook-subscription/[id]` | Fetch safe metadata for one owned subscription. |
| `PATCH` | `/api/webhook-subscription/[id]` | Edit URL, event types, description, or signing secret. |
| `DELETE` | `/api/webhook-subscription/[id]` | Delete the owned subscription. |
| `GET` | `/api/webhook-subscription/[id]/deliveries` | List recent delivery attempts for one owned subscription. |

Supported event types:

| Event type |
| --- |
| `thread.created` |
| `message.created` |
| `scheduled_run.completed` |
| `agent.published` |
| `inbound.received` |

Create request:

```http
POST /api/webhook-subscription
Cookie: <Better Auth session>
Content-Type: application/json

{
  "url": "https://example.com/hooks/flare",
  "eventTypes": ["thread.created", "message.created"],
  "description": "Production webhook"
}
```

Create response:

```json
{
  "subscription": {
    "id": "whsub_123",
    "url": "https://example.com/hooks/flare",
    "eventTypes": ["thread.created", "message.created"],
    "description": "Production webhook",
    "enabled": true,
    "failureCount": 0,
    "lastSuccessAt": null,
    "lastFailureAt": null,
    "lastFailureReason": null,
    "createdAt": "2026-06-01T12:00:00.000Z"
  },
  "signingSecret": "whsec_<shown-once>"
}
```

`POST` can accept a caller-supplied `signingSecret`, but normal dashboard flows
should let the server generate `whsec_<base64url>`.

## Webhook secret rotation

There is no separate `/rotate-secret` route in the current implementation.
Rotate a webhook secret by PATCHing `signingSecret`:

```http
PATCH /api/webhook-subscription/whsub_123
Cookie: <Better Auth session>
Content-Type: application/json

{ "signingSecret": "whsec_new_secret_value" }
```

The route updates both `signingSecret` and `secretHash`. Receivers should support
a short dual-secret deploy window on their side because Flare stores one active
signing secret per subscription.

## Webhook failure stats and deliveries

Migration `0026_verdant_gatekeeper.sql` extends `webhook_subscription` with
health fields:

| Field | Meaning |
| --- | --- |
| `failureCount` | Current failure counter for the subscription. |
| `lastSuccessAt` | Latest successful delivery timestamp. |
| `lastFailureAt` | Latest failed delivery timestamp. |
| `lastFailureReason` | Short final error string from HTTP/network/signing failure. |

Delivery list route:

```http
GET /api/webhook-subscription/whsub_123/deliveries
Cookie: <Better Auth session>
```

Response items include delivery id/status/attempt counts, delivery timestamps,
last error, and the associated outbox event id/type/payload/status.

Dashboard status labels should be derived as:

| State | Condition |
| --- | --- |
| Healthy | `enabled = true`, recent success, and `failureCount = 0`. |
| Failing | `enabled = true` and `failureCount > 0`. |
| Disabled/deleted | Subscription no longer enabled or no longer returned. |
| Never delivered | No success and no failure timestamps. |

## CSP and browser exposure

API hardening routes are not frameable UI surfaces. They inherit the main app
security headers from `next.config.ts`:

```http
X-Frame-Options: SAMEORIGIN
Content-Security-Policy: frame-ancestors 'self';
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

Rules:

- **No CORS wildcard for key management.** Session-authenticated key/webhook
  management routes should be same-site dashboard calls.
- **Bearer REST is server-to-server.** `/api/v1` callers should send bearer keys
  from trusted backends, not from browser bundles.
- **Secrets stay out of dashboards after creation.** Show `lastFour`, not
  plaintext keys; show webhook secret only at create/rotation time.
- **Do not expose hashes.** Never return `keyHash`, `secretHash`, or database
  signing-secret columns in list/get responses.

## Security notes

- **Hash API keys.** API keys are stored by sha-256 hash. Lookup hashes the
  presented bearer token and compares to `api_key.keyHash`.
- **Treat webhook secrets as sensitive.** Current worker signing requires a
  plaintext `signingSecret` column. Prefer KMS/secret-manager encryption before
  regulated deployments.
- **Scope before work.** Scope checks and rate limits happen before route
  handlers perform DB writes.
- **Record after auth.** Usage rows are key-attributed telemetry; unauthenticated
  garbage requests should be handled by aggregate request logs instead.
- **Clean limiter buckets.** `apiUsageRepository.clearExpiredRateLimitBuckets`
  removes expired rows from `api_rate_limit_bucket`.
- **Use idempotency at receivers.** Webhook receivers should de-dupe by event id;
  retries may deliver the same outbox event more than once.

## See also

- `docs/features/api.md` — Phase 3 API-key and REST baseline.
- `docs/features/webhooks.md` — Phase 3 webhook signing and delivery baseline.
- `src/lib/auth/api-key.ts` — API key auth, scope, rate-limit, and usage wrapper.
- `src/lib/rate-limit/api-rate-limit.ts` — limiter key construction and bucket
  checks.
- `src/app/api/api-key/` — session-authenticated key CRUD, rotation, and usage.
- `src/app/api/v1/` — bearer-auth public REST routes.
- `src/app/api/webhook-subscription/` — webhook subscription and delivery routes.
- `src/lib/db/pg/repositories/api-usage-repository.pg.ts` — usage and limiter
  bucket data layer.
- `src/lib/db/pg/repositories/api-key-repository.pg.ts` — key metadata,
  rotation, and safe-field projection.
- `src/lib/db/pg/repositories/webhook-repository.pg.ts` — subscription,
  delivery, and health-stat data layer.
- `src/lib/db/migrations/pg/0026_verdant_gatekeeper.sql` — Phase 5 hardening
  schema.
