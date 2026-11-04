// ---------------------------------------------------------------------------
// P3.2 — Inbound payload normalizers (pure)
// ---------------------------------------------------------------------------
// Each `normalize*` function takes a raw inbound payload (from one of
// the three supported sources) and returns a `NormalizedInbound`
// shape that the agent / scheduler can consume uniformly. The
// normalizers are pure (no I/O); the route handler is responsible for
// the surrounding DB and outbox work.
//
// The `raw` field is preserved so the agent run has the original
// payload for context — the worker can decide what to summarize and
// what to drop. We also keep `externalId` so the outbox worker can
// dedupe re-deliveries (SendGrid, Mailgun, and Slack all retry on
// non-2xx responses).
// ---------------------------------------------------------------------------

import type { UserConnectorEntity } from "lib/db/pg/schema.pg";
import type { EmailPayload, EmailProvider } from "./email";
import type {
  SlackEventPayload,
  SlackInnerEvent,
  SlackMessageEvent,
} from "./slack";

export type NormalizedInbound = {
  source: "webhook" | "email" | "slack";
  /** Provider message id, used for dedupe. Optional — webhooks may not have one. */
  externalId?: string;
  /** Human-readable sender ("Alice <alice@example.com>" / "channel-name" / etc.). */
  from?: string;
  /** Body to feed into the agent. Always non-empty after normalization. */
  text: string;
  /** Suggested thread title, e.g. "Inbound from Slack: #ops". */
  threadTitle: string;
  /** Original payload — for debugging and the agent's full context. */
  raw: unknown;
  /** Optional per-source metadata to give the agent richer context. */
  meta?: Record<string, unknown>;
};

/**
 * Typed error thrown by the normalizers when the payload can't be
 * coerced into the expected shape. The route handler catches this
 * and stores the message on the `inbound_delivery` row.
 */
export class NormalizeError extends Error {
  public readonly code = "NORMALIZE_ERROR";
  constructor(
    message: string,
    public readonly source: NormalizedInbound["source"],
  ) {
    super(message);
    this.name = "NormalizeError";
  }
}

// ---------------------------------------------------------------------------
// Webhook — generic JSON or text body
// ---------------------------------------------------------------------------

/**
 * Normalize a generic webhook payload. The body should be a JSON
 * object; if it's not, the function either coerces it (for a string
 * body) or uses a placeholder for empty / malformed bodies.
 *
 * Accepted shapes (in priority order):
 *  1. `{ "text": "...", "from": "..." }` — Slack-style simple shape.
 *  2. `{ "message": "...", "sender": "..." }` — generic.
 *  3. `{ "body": "...", "author": "..." }` — generic.
 *  4. A bare string → uses the string as `text`.
 *  5. Anything else → uses the JSON.stringify'd shape as text.
 */
export const normalizeWebhook = (
  payload: unknown,
  headers: Record<string, string> = {},
): NormalizedInbound => {
  const raw = payload;
  if (payload == null) {
    return {
      source: "webhook",
      text: "(empty webhook payload)",
      threadTitle: "Inbound webhook",
      raw,
    };
  }
  if (typeof payload === "string") {
    if (payload.length === 0) {
      return {
        source: "webhook",
        text: "(empty webhook body)",
        threadTitle: "Inbound webhook",
        raw,
      };
    }
    return {
      source: "webhook",
      text: payload,
      threadTitle: webhookTitle(headers, payload),
      raw,
    };
  }
  if (isObject(payload)) {
    const text = pickString(payload, ["text", "message", "body", "content"]);
    const from = pickString(payload, [
      "from",
      "sender",
      "author",
      "user",
      "user_id",
    ]);
    const externalId = pickString(payload, [
      "id",
      "event_id",
      "message_id",
      "delivery_id",
    ]);
    const subject = pickString(payload, ["subject", "title"]);
    const finalText = text && text.length > 0 ? text : "(empty webhook body)";
    return {
      source: "webhook",
      externalId: externalId ?? undefined,
      from: from ?? undefined,
      text: finalText,
      threadTitle: webhookTitle(headers, subject || finalText),
      raw,
      meta: pickMetaKeys(payload),
    };
  }
  throw new NormalizeError(
    `Cannot normalize webhook payload of type ${typeof payload}`,
    "webhook",
  );
};

const webhookTitle = (
  headers: Record<string, string>,
  fallback: string,
): string => {
  const explicit = pickString(headers, [
    "x-inbound-title",
    "x-webhook-title",
    "x-title",
  ]);
  if (explicit) return `Inbound webhook: ${truncate(explicit, 60)}`;
  return `Inbound webhook: ${truncate(fallback, 60)}`;
};

// ---------------------------------------------------------------------------
// Email — SendGrid / SES / Mailgun
// ---------------------------------------------------------------------------

/**
 * Normalize an inbound email payload. `provider` is also encoded in
 * the payload object but we accept it as a separate argument for
 * symmetry with the parser.
 */
export const normalizeEmail = (
  payload: EmailPayload,
  provider: EmailProvider,
): NormalizedInbound => {
  // Defensive: if the payload's provider doesn't match the argument,
  // we trust the payload's value (the parser is the source of truth).
  const actual = payload.provider ?? provider;
  const subject = (payload as { subject?: unknown }).subject;
  const subjectStr = typeof subject === "string" ? subject : "";
  const text =
    payload.text && payload.text.length > 0
      ? payload.text
      : (payload.html ?? "");
  const finalText = text && text.length > 0 ? text : "(empty email body)";
  return {
    source: "email",
    externalId:
      (payload as { messageId?: string | null }).messageId ?? undefined,
    from: payload.from || undefined,
    text: finalText,
    threadTitle: emailTitle(actual, subjectStr, payload.from),
    raw: payload,
    meta: {
      provider: actual,
      subject: subjectStr || null,
      to: "to" in payload ? payload.to : null,
      spamScore: "spamScore" in payload ? (payload.spamScore ?? null) : null,
    },
  };
};

const emailTitle = (
  provider: EmailProvider,
  subject: string,
  from: string,
): string => {
  const tag =
    provider === "sendgrid"
      ? "SendGrid"
      : provider === "ses"
        ? "AWS SES"
        : "Mailgun";
  const subj = subject ? `: ${truncate(subject, 60)}` : "";
  const fromTag = from ? ` from ${truncate(from, 30)}` : "";
  return `Inbound email (${tag})${subj}${fromTag}`;
};

// ---------------------------------------------------------------------------
// Slack — event_callback with message / app_mention
// ---------------------------------------------------------------------------

/**
 * Normalize a Slack event payload. The function expects:
 *   - `event` — already verified & parsed by `parseSlackEvent`.
 *   - `userConnector` — the `user_connector` row for the Slack
 *     workspace (the route handler resolves this from `team_id`).
 *     We accept the full row but only use a couple of fields.
 *
 * The function does not look up which agent to route to (that
 * decision lives in the route handler, which has access to the
 * inbound endpoint's `agentId`).
 */
export const normalizeSlack = (
  event: SlackEventPayload,
  userConnector: Pick<UserConnectorEntity, "userId" | "email" | "metadata">,
): NormalizedInbound => {
  const inner = event.event;
  const text = inner.text ?? "";
  if (text.length === 0) {
    throw new NormalizeError(
      "Slack event has no text payload (probably a non-message event)",
      "slack",
    );
  }
  if (!supportedSlackEventType(inner)) {
    throw new NormalizeError(
      `Unsupported Slack event type: ${inner.type}`,
      "slack",
    );
  }
  const from = slackFrom(inner, userConnector);
  const channel = inner.channel ?? "";
  const channelName = inner.channel_name;
  return {
    source: "slack",
    externalId: event.eventId || inner.ts || undefined,
    from,
    text,
    threadTitle: slackTitle(inner, channelName, channel),
    raw: event,
    meta: {
      teamId: event.teamId,
      userId: inner.user ?? null,
      channel,
      channelName: channelName ?? null,
      threadTs: inner.thread_ts ?? null,
      ts: inner.ts ?? null,
      ownerUserId: userConnector.userId,
    },
  };
};

const supportedSlackEventType = (inner: SlackInnerEvent): boolean =>
  inner.type === "message" || inner.type === "app_mention";

const slackFrom = (
  inner: SlackInnerEvent,
  userConnector: Pick<UserConnectorEntity, "userId" | "email">,
): string => {
  if (inner.type === "message") {
    const m = inner as SlackMessageEvent;
    if (m.subtype === "bot_message") {
      return `bot:${m.bot_id ?? "unknown"}`;
    }
  }
  if (inner.user) {
    return `slack:${inner.user}`;
  }
  return `slack:${userConnector.email ?? userConnector.userId}`;
};

const slackTitle = (
  inner: SlackInnerEvent,
  channelName: string | undefined,
  channel: string,
): string => {
  const label = channelName ? `#${channelName}` : channel;
  if (inner.type === "app_mention") {
    return `Inbound from Slack: ${label} (mention)`;
  }
  return `Inbound from Slack: ${label}`;
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const pickString = (
  obj: Record<string, unknown>,
  keys: string[],
): string | null => {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
};

const pickMetaKeys = (
  obj: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    // Don't bloat meta with the canonical text — the agent already
    // has `text` at the top level. Keep everything else for context.
    if (k === "text" || k === "message" || k === "body") continue;
    out[k] = v;
  }
  return out;
};

const truncate = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;
