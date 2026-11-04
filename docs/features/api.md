# REST API and API keys

Flare exposes a versioned REST surface under `/api/v1/...` so external
systems — dashboards, scripts, server-to-server automations — can read and
write threads, messages, and agents without a Better Auth session. Access
is gated by per-user API keys, issued from `/api/api-key`, presented as
`Authorization: Bearer <key>` on every v1 call.

## How to issue a key

```
POST /api/api-key
Cookie: <signed-in Better Auth session>
Content-Type: application/json

{
  "name": "ci-deploy-bot",
  "scopes": ["threads:read", "messages:write"],
  "expiresAt": "2027-01-01T00:00:00.000Z"  // optional
}

201 Created
{
  "id": "ck_live_…",
  "fullKey": "ck_live_<43-char-base64url>",   // SHOWN EXACTLY ONCE
  "prefix": "ck_live_…",                       // 8 chars + ellipsis
  "scopes": ["threads:read", "messages:write"],
  "expiresAt": "2027-01-01T00:00:00.000Z",
  "createdAt": "2026-06-01T14:00:00.000Z"
}
```

The plaintext `fullKey` is the only thing the caller ever sees. The server
keeps a sha-256 hex hash (`keyHash`) and an 8-char display prefix. There
is no "show me my key" endpoint by design — losing the plaintext means
revoking and re-issuing.

`GET /api/api-key` lists the caller's active (non-revoked) keys. The
response never contains the plaintext or the hash, only `id`, `name`,
`prefix`, `scopes`, `lastUsedAt`, `expiresAt`, `createdAt`.

## Bearer-auth on the v1 surface

Every `/api/v1/...` request must carry:

```
Authorization: Bearer ck_live_<43-char-base64url>
```

The auth helper (`authenticateApiKey` in `src/lib/auth/api-key.ts`) reads
the header, hashes the key with sha-256, looks the hash up in the
`api_key` table, and returns an `ApiKeyContext = { userId, keyId, scopes }`
on success. A revoked key (`revokedAt != null`) or an expired key
(`expiresAt <= now`) returns null, and the route emits 401.

On a successful auth the helper bumps `last_used_at` fire-and-forget
— the response is not delayed by the write.

## Scopes

Scopes are strings the route author declares and the key-holder opts into
at issue time. Three match patterns are supported.

| Pattern       | Authorises                                  |
| ------------- | ------------------------------------------- |
| `*`           | Every scope                                 |
| `messages:read` (exact)   | Only that one scope                    |
| `messages:*` (prefix)     | Every scope that starts with `messages:` |

Empty scope lists are rejected at issue time. The wildcard `*` is the
escape hatch for "I want to use this key for everything" — be deliberate
when granting it.

## Endpoints

All endpoints are owned by the API key's user. Cross-user access returns
404 (not 403) so a caller cannot probe for the existence of resources
they do not own.

| Method | Path                              | Scope           | Returns                     |
| ------ | --------------------------------- | --------------- | --------------------------- |
| GET    | `/api/v1/threads`                 | `threads:read`  | The user's threads          |
| POST   | `/api/v1/threads`                 | `threads:write` | A new thread (`{title}`)    |
| GET    | `/api/v1/threads/[id]`            | `threads:read`  | One thread (no messages)    |
| PATCH  | `/api/v1/threads/[id]`            | `threads:write` | Renamed thread (`{title}`)  |
| DELETE | `/api/v1/threads/[id]`            | `threads:write` | 204 on success              |
| GET    | `/api/v1/threads/[id]/messages`   | `threads:read`  | The thread's messages       |
| POST   | `/api/v1/threads/[id]/messages`   | `messages:write`| A new message (`{content}`) |
| GET    | `/api/v1/agents`                  | `agents:read`   | The user's agents           |

`POST /api/v1/threads/[id]/messages` accepts `{content: string}` and
wraps it as a single `[{ type: "text", text }]` UI part. It is a
synchronous insert — no LLM turn is fired. For a streaming LLM reply, the
internal `/api/chat` route (session-auth) is the path; a future
`POST /api/v1/threads/[id]/turn` is a Phase 5 follow-up.

`POST /api/v1/threads` accepts `{title, agentId?}`; `agentId` is passed
through but not yet stored on the `chat_thread` row (the column does not
exist today). When the schema gains it, the create path is a one-liner
extension.

## Storage and rotation

Keys are stored in the `api_key` table (migration 0023). The
`key_hash` column holds the sha-256 hex of the plaintext; the `prefix`
column holds the first 8 characters (plus the `ck_live_` namespace) for
display in lists. Plaintext is never persisted, never logged, never sent
back through any endpoint other than the create response.

Rotation today is a two-step dance: issue a new key, revoke the old one.
There is no overlap window — the new key works immediately and the old
key stops working as soon as `DELETE /api/api-key/[id]` is called. A
"rotate with grace period" feature (where both keys work for N hours) is
on the Phase 5 hardening list.

`PATCH /api/api-key/[id]` renames a key and / or changes its scope list
without rotating the token. Useful for tightening scopes after the
caller realises they over-provisioned.

## Limits and risks

- **51-char keys (`ck_live_` + 43-char base64url).** The plan called for
  "≈40"; we ship 256-bit entropy so the security margin is unambiguous.
  The `ck_live_` prefix makes log greppability easy.
- **No per-key rate limits yet.** All API keys share the same global
  rate-limit budget as signed-in users. Per-key quotas are a Phase 5
  follow-up.
- **No streaming on `POST /api/v1/threads/[id]/messages`.** The endpoint
  inserts the message; it does not trigger an LLM turn.
- **`last_used_at` is fire-and-forget.** A slow DB write will not stall
  the request, but a failed bump is silent — debug stale `last_used_at`
  via the request logger, not by reading the row.
- **404 hides cross-user resources.** A thread owned by another user
  returns the same 404 as a thread that does not exist, so the API does
  not leak the existence of foreign resources.

## See also

- `src/lib/auth/api-key.ts` — `generateApiKey`, `hashApiKey`,
  `verifyApiKeyScopes`, `authenticateApiKey`, `requireApiKeyScope`
- `src/app/api/api-key/route.ts` — `GET` (list) and `POST` (issue)
- `src/app/api/api-key/[id]/route.ts` — `GET` / `PATCH` / `DELETE`
- `src/app/api/v1/threads/route.ts` — list / create threads
- `src/app/api/v1/threads/[id]/route.ts` — get / patch / delete one thread
- `src/app/api/v1/threads/[id]/messages/route.ts` — list / create messages
- `src/app/api/v1/agents/route.ts` — list agents
- `src/lib/db/pg/repositories/api-key-repository.pg.ts` — data layer
