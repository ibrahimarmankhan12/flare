// ---------------------------------------------------------------------------
// P3.2 — Slack event payload parser and signing verification (pure)
// ---------------------------------------------------------------------------
// Slack's Events API requires each POST to be HMAC-SHA-256 signed with
// the app's "Signing Secret". The signed string is:
//
//     v0:{x-slack-request-timestamp}:{rawBody}
//
// and the header `x-slack-signature` carries the result as
// `v0=<hex>`. We re-compute the HMAC and compare using
// `node:crypto.timingSafeEqual` so the route can't be used as a
// timing oracle. We also reject requests whose timestamp is more than
// 5 minutes in the past or future — Slack's own docs recommend this
// to prevent replay.
//
// Slack also sends a `url_verification` challenge event during the
// app install handshake. The endpoint must echo the `challenge`
// field back as plain text. We surface that as a `kind: "challenge"`
// result so the route handler can return the right response without
// learning Slack's protocol.
//
// The parser is format-level only: the route handler is responsible
// for looking up the `user_connector` row that owns the workspace
// (via `team_id` from the event) and resolving the user id.
// ---------------------------------------------------------------------------

import { createHmac, timingSafeEqual } from "node:crypto";

// Slack's docs allow up to 5 minutes clock skew.
const SLACK_MAX_SKEW_MS = 5 * 60 * 1000;

export interface SlackRequestHeaders {
  "x-slack-signature"?: string;
  "x-slack-request-timestamp"?: string;
  [key: string]: string | undefined;
}

export type SlackMessageSubtype =
  | "bot_message"
  | "thread_broadcast"
  | (string & {}); // any other subtype Slack adds in future

export interface SlackMessageEvent {
  type: "message";
  /** Slack user id of the author (may be undefined for bot messages). */
  user?: string;
  /** Plain-text body of the message. */
  text?: string;
  /** Slack channel id (e.g. `C0123`). */
  channel?: string;
  /** Channel display name (best-effort, often absent). */
  channel_name?: string;
  /** ISO-8601 timestamp Slack assigns to every event. */
  ts?: string;
  /** Slack thread parent ts (set for replies). */
  thread_ts?: string;
  /** Message subtype (bot_message, thread_broadcast, etc.). */
  subtype?: SlackMessageSubtype;
  /** Bot id for `bot_message` subtype. */
  bot_id?: string;
}

export interface SlackAppMentionEvent {
  type: "app_mention";
  user?: string;
  text?: string;
  channel?: string;
  channel_name?: string;
  ts?: string;
  thread_ts?: string;
}

export type SlackInnerEvent = SlackMessageEvent | SlackAppMentionEvent;

export interface SlackEventCallback {
  type: "event_callback";
  token?: string;
  team_id?: string;
  api_app_id?: string;
  event_id?: string;
  event_time?: number;
  event: SlackInnerEvent;
}

export interface SlackUrlVerification {
  type: "url_verification";
  token?: string;
  challenge: string;
}

export interface SlackEventPayload {
  type: "event_callback";
  teamId: string;
  eventId: string;
  event: SlackInnerEvent;
}

export type SlackParseResult =
  | { ok: true; kind: "event"; payload: SlackEventPayload }
  | { ok: true; kind: "challenge"; challenge: string }
  | { ok: false; status: 400 | 401; error: string };

/**
 * Compute the Slack signing header value for a given body. Exposed
 * (and tested) so future cron / replay tooling can re-sign payloads
 * without re-importing the route handler.
 */
export const computeSlackSignature = (
  signingSecret: string,
  timestamp: string,
  rawBody: string,
): string => {
  const base = `v0:${timestamp}:${rawBody}`;
  const hex = createHmac("sha256", signingSecret).update(base).digest("hex");
  return `v0=${hex}`;
};

/**
 * Parse + verify a Slack Events API request. The function is pure:
 * it does not fetch from Slack, it does not look up the team owner, it
 * only validates the request *format*. Caller must supply the signing
 * secret (looked up from the inbound endpoint's `secret_hash` after
 * the team_id → user_id resolution).
 */
export const parseSlackEvent = (
  rawBody: string,
  headers: SlackRequestHeaders,
  signingSecret: string,
  now: number = Date.now(),
): SlackParseResult => {
  if (!rawBody) {
    return { ok: false, status: 400, error: "Empty Slack payload" };
  }
  const signature = headers["x-slack-signature"];
  const timestamp = headers["x-slack-request-timestamp"];
  if (!signature || !timestamp) {
    return {
      ok: false,
      status: 401,
      error: "Missing Slack signature or timestamp header",
    };
  }
  if (!signingSecret) {
    return {
      ok: false,
      status: 401,
      error: "Slack signing secret is not configured",
    };
  }
  const tsNum = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(tsNum)) {
    return { ok: false, status: 401, error: "Invalid Slack timestamp" };
  }
  const skew = Math.abs(now - tsNum * 1000);
  if (skew > SLACK_MAX_SKEW_MS) {
    return { ok: false, status: 401, error: "Stale timestamp" };
  }
  if (!verifySignature(signingSecret, timestamp, rawBody, signature)) {
    return { ok: false, status: 401, error: "Invalid signature" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: "Malformed Slack JSON body" };
  }
  if (!isObject(parsed)) {
    return { ok: false, status: 400, error: "Slack payload is not an object" };
  }
  const type = parsed.type;
  if (type === "url_verification") {
    const challenge = parsed.challenge;
    if (typeof challenge !== "string" || challenge.length === 0) {
      return {
        ok: false,
        status: 400,
        error: "url_verification missing challenge",
      };
    }
    return { ok: true, kind: "challenge", challenge };
  }
  if (type !== "event_callback") {
    return {
      ok: false,
      status: 400,
      error: `Unsupported Slack event type: ${String(type)}`,
    };
  }
  const ec = parsed as unknown as SlackEventCallback;
  if (!isObject(ec.event) || typeof ec.event.type !== "string") {
    return { ok: false, status: 400, error: "event_callback missing event" };
  }
  return {
    ok: true,
    kind: "event",
    payload: {
      type: "event_callback",
      teamId: stringOrEmpty(ec.team_id),
      eventId: stringOrEmpty(ec.event_id),
      event: ec.event as SlackInnerEvent,
    },
  };
};

const verifySignature = (
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  providedSignature: string,
): boolean => {
  // Slack's signature is "v0=<hex>". Strip the prefix and compare the
  // hex digest against our locally-computed one with a constant-time
  // compare.
  if (!providedSignature.startsWith("v0=")) return false;
  const providedHex = providedSignature.slice(3);
  const expectedHex = createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex");
  return safeEqualHex(expectedHex, providedHex);
};

const safeEqualHex = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const stringOrEmpty = (v: unknown): string => (typeof v === "string" ? v : "");
