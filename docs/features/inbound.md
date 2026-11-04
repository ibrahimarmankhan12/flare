# Inbound triggers

An inbound trigger is a public URL that lets an external system start a Flare
chat. You point SendGrid, Mailgun, AWS SES, Slack, or any HTTP client at it;
the request lands on `/api/inbound/[token]`, gets normalised into a chat
message, and is enqueued for the outbox worker to run on the agent you
configured.

## The three kinds

Every inbound endpoint has a `kind` that controls how the request is parsed
and what headers / signatures are required.

| Kind     | Source                                            | Auth                                  |
| -------- | ------------------------------------------------- | ------------------------------------- |
| `webhook`| Any HTTP POST with a JSON body                    | `x-inbound-secret` header, HMAC-compared |
| `email`  | SendGrid Inbound Parse / SES / Mailgun            | `x-email-provider` header selects the parser; signature is the `secretHash` on the endpoint |
| `slack`  | Slack Events API (`app_mention`, `message`, etc.) | Slack signing secret on the connector; 5-min replay window |

You create one endpoint per `(user, agent)`. The token in the URL is
auto-generated and unique; the secret is hashed at rest. The same flow
applies to all three kinds once the request is past auth.

## How to create an endpoint

Programmatic only in Phase 3 — there is no UI yet. Call
`inboundRepository.createInboundEndpoint(input, userId)` with
`{ agentId, kind, threadTemplate?, enabled? }`. The repository mints a
random token (a URL-safe random string) and hashes the secret you pass in.
You receive `{ id, token, secretHash }` back; the route handler does not
return the plaintext token (the caller stores it in their own config).

A future UI will surface the token + secret once and let you copy them into
your provider's webhook config.

## The request flow

Every inbound request follows the same shape, regardless of `kind`.

1. **Resolve the endpoint.** `/api/inbound/[token]` looks up
   `inboundRepository.getInboundEndpointByToken(token)`. Unknown token →
   404. Disabled endpoint → 404 (we do not distinguish "deleted" from
   "disabled" externally).
2. **Validate the secret.** `validateInboundRequest` does a
   `sha256(provided) === secretHash` compare in constant time. Mismatch
   → 401.
3. **Normalise the payload.** The `kind`-specific normalizer converts the
   raw body into a uniform `NormalizedInbound`
   `{ source, externalId, from, text, threadTitle, raw, meta }`. Email
   uses `parseEmailPayload` + `normalizeEmail`; Slack uses
   `parseSlackEvent` (which also verifies the Slack signature on the
   workspace's stored signing secret) + `normalizeSlack`; webhook is the
   simple `normalizeWebhook` path.
4. **Persist the delivery.** A row is inserted into `inbound_delivery`
   with `status='received'`. Failures here flip the row to `failed` and
   return 500.
5. **Enqueue an outbox event.** The route writes a `webhook_event_outbox`
   row of `kind:'inbound'`, `eventType:'inbound.received'`, payload
   `{endpointId, userId, agentId, deliveryId, normalized}`. The outbox
   worker drains it asynchronously.
6. **Worker runs the agent.** `runOutboxTick` reads the event, materialises
   a new chat thread using the endpoint's `threadTemplate` + the normalised
   `threadTitle`, feeds `normalized.text` as the user message into the
   configured agent, and streams the response into the thread. On success
   the delivery is marked `replayed`.

The route returns 200/202 once the event is enqueued — we do not wait for
the worker to drain it.

## Per-kind payload format

**Webhook (`kind: 'webhook'`).** Any JSON body. Auth is the
`x-inbound-secret` header — it must equal the secret whose sha-256 hash
is stored in `secretHash`. The whole JSON body becomes the user message
verbatim. Useful for ad-hoc integrations: a CI system, a deploy hook, a
cron job that posts a status update.

**Email.** Three parsers live in `src/lib/inbound/email.ts`. The
`x-email-provider` header picks one (`sendgrid` is the default).

- `sendgrid` — `parseEmailPayload("sendgrid", body, contentType)`. The
  Inbound Parse webhook posts `application/x-www-form-urlencoded` with
  `from`, `to`, `subject`, `text`, `html`, `envelope` (a JSON-encoded
  string), and a few SPF / spam-score fields. The `text` field becomes
  the user message; `subject` is prepended to `threadTitle`.
- `ses` — the same fields, but a different wire format (SES posts
  `mail.commonHeaders.subject` and friends inside a JSON envelope). The
  parser walks the `commonHeaders` map by path.
- `mailgun` — form-encoded like SendGrid but with different field names
  (`sender`, `recipient`, `subject`, `body-plain`, `stripped-text`).

**Slack.** The route handler reads the raw body once, parses it as JSON
to discover `team_id`, looks up the matching `user_connector` row (its
`metadata.signingSecret` is the workspace's signing secret), then
re-validates the request against Slack's signing convention
(`v0:{ts}:{body}` HMAC, 5-minute skew, `timingSafeEqual`). `url_verification`
challenges are echoed back as `text/plain` per Slack's protocol. Slack's
endpoint secret is **not** used for Slack — the workspace signing secret
is the only thing that authenticates the request.

## Limits and risks

- **One endpoint per `(user, agent)`.** The `inbound_endpoint` table
  has a uniqueness constraint that enforces this. Create + delete is the
  only way to "rotate" the secret today — there is no rotate endpoint.
- **No retry from the public route.** The 200 you get from
  `POST /api/inbound/[token]` only means the event is enqueued. If the
  worker fails to process it (agent error, DB hiccup), retries happen
  inside the outbox worker using the standard webhook backoff schedule.
- **Email provider auto-detection is conservative.** Without the
  `x-email-provider` header the parser assumes SendGrid. SES / Mailgun
  callers should set it at the edge.
- **The endpoint's `secretHash` is not used for Slack.** Slack's signing
  flow needs the plaintext workspace secret, which lives on the
  `user_connector` row. Other agents touching this route should not
  "tidy" the Slack branch back into the inbound validator.
- **No UI for creating endpoints yet.** A dashboard route that wraps
  `createInboundEndpoint` is a Phase 5 follow-up.

## See also

- `src/lib/inbound/email.ts` — `parseEmailPayload` (SendGrid / SES / Mailgun)
- `src/lib/inbound/slack.ts` — `parseSlackEvent` + `computeSlackSignature`
- `src/lib/inbound/normalize.ts` — three pure normalizers
- `src/lib/inbound/validate.ts` — `validateInboundRequest` (404 / 401 dispatch)
- `src/lib/inbound/index.ts` — public surface (re-exports)
- `src/app/api/inbound/[token]/route.ts` — the public POST handler
- `src/lib/db/pg/repositories/inbound-repository.pg.ts` — data layer
- `src/lib/scheduler/outbox-worker.ts` — drains `kind:'inbound'` events
