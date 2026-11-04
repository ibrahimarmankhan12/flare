import "server-only";

import { colorize } from "consola/utils";
import { and, eq } from "drizzle-orm";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { inboundRepository, webhookRepository } from "lib/db/repository";
import {
  type EmailProvider,
  type NormalizedInbound,
  normalizeEmail,
  normalizeSlack,
  normalizeWebhook,
  parseEmailPayload,
  parseSlackEvent,
  validateInboundRequest,
} from "lib/inbound";
import logger from "logger";
import { handleError } from "../../chat/shared.chat";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const routeLogger = logger.withDefaults({
  message: colorize("magenta", `Inbound API: `),
});

type RouteParams = { params: Promise<{ token: string }> };

/**
 * Phase 3+#12 — POST /api/inbound/[token]
 *
 * Public, unauthenticated endpoint that receives webhooks, email
 * inbound parse, and Slack Events API POSTs. The token in the URL
 * resolves to an `inbound_endpoint` row; the endpoint's `secretHash`
 * (if any) is verified before normalization runs.
 *
 * Successful requests are 202 Accepted — the normalized payload is
 * persisted to `inbound_delivery` and an outbox event is enqueued.
 * The actual agent run is performed asynchronously by the outbox
 * worker (P3.4) which calls into the scheduler (P3.1) to claim the
 * event and execute the agent. Returning 202 keeps the latency tight
 * for providers that have a strict timeout (Mailgun: 10s, Slack:
 * 3s).
 *
 * Status codes:
 *   200 — url_verification challenge echoed back (Slack handshake).
 *   202 — accepted, agent run enqueued.
 *   400 — malformed payload (after auth) or unsupported event.
 *   401 — provided secret did not match the endpoint's hash.
 *   404 — endpoint token unknown or endpoint disabled.
 *   500 — normalization or DB failure after the request was accepted.
 */
export async function POST(req: Request, { params }: RouteParams) {
  const startedAt = Date.now();
  const { token } = await params;
  if (!token) {
    return new Response("Missing token", { status: 400 });
  }

  // Read the raw body once. Slack and SES signing need the raw bytes;
  // we JSON.parse for the webhook / JSON-email branches separately.
  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch (err) {
    return new Response(`Failed to read request body: ${errMessage(err)}`, {
      status: 400,
    });
  }

  // 1. Resolve endpoint by token. The repo also returns null for
  //    disabled endpoints — we treat that as 404 to avoid leaking
  //    token enumeration.
  const endpoint = await inboundRepository.getInboundEndpointByToken(token);
  if (!endpoint) {
    return new Response("Endpoint not found", { status: 404 });
  }

  // 2. Build a header map (case-insensitive) for both the validator
  //    and the parser. `Headers.entries()` yields lowercase names.
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  // 3. Validate the secret. Slack events take a different code path
  //    (their secret comes from the team lookup, not the endpoint),
  //    so we run the validator only for non-Slack kinds. Slack uses
  //    `computeSlackSignature` with the connector's stored secret
  //    later, in the slack branch.
  if (endpoint.kind !== "slack") {
    const validation = validateInboundRequest({
      token,
      providedSecret: headers["x-inbound-secret"] ?? null,
      endpoint: {
        secretHash: endpoint.secretHash,
        enabled: endpoint.enabled,
      },
      rawBody,
    });
    if (!validation.ok) {
      return new Response(validation.error, { status: validation.status });
    }
  }

  // 4. Dispatch by endpoint kind.
  try {
    if (endpoint.kind === "webhook") {
      return await handleWebhook(endpoint, rawBody, headers, startedAt);
    }
    if (endpoint.kind === "email") {
      return await handleEmail(endpoint, rawBody, headers, startedAt);
    }
    if (endpoint.kind === "slack") {
      return await handleSlack(endpoint, rawBody, headers, startedAt);
    }
    return new Response(`Unsupported endpoint kind: ${endpoint.kind}`, {
      status: 400,
    });
  } catch (err) {
    const message = errMessage(err);
    routeLogger.error("inbound failed", err);
    // Persist a failed delivery row for replay/inspection.
    try {
      await inboundRepository.createInboundDelivery({
        inboundEndpointId: endpoint.id,
        status: "failed",
        error: message,
        payload: {
          kind: endpoint.kind,
          error: message,
          receivedAt: new Date().toISOString(),
        },
      });
    } catch (innerErr) {
      routeLogger.error("failed to record inbound_delivery failure", innerErr);
    }
    return new Response(handleError(err), { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// webhook
// ---------------------------------------------------------------------------

async function handleWebhook(
  endpoint: NonNullable<
    Awaited<ReturnType<typeof inboundRepository.getInboundEndpointByToken>>
  >,
  rawBody: string,
  headers: Record<string, string>,
  startedAt: number,
): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = rawBody.length > 0 ? JSON.parse(rawBody) : null;
  } catch (err) {
    return await recordFailedDelivery(
      endpoint,
      `Invalid JSON body: ${errMessage(err)}`,
    );
  }
  const normalized = normalizeWebhook(parsed, headers);
  return await finalize(endpoint, normalized, startedAt);
}

// ---------------------------------------------------------------------------
// email
// ---------------------------------------------------------------------------

async function handleEmail(
  endpoint: NonNullable<
    Awaited<ReturnType<typeof inboundRepository.getInboundEndpointByToken>>
  >,
  rawBody: string,
  headers: Record<string, string>,
  startedAt: number,
): Promise<Response> {
  const provider = detectEmailProvider(headers);
  let parsed;
  try {
    parsed = parseEmailPayload(
      provider,
      rawBody,
      headers["content-type"] ?? "application/octet-stream",
    );
  } catch (err) {
    return await recordFailedDelivery(
      endpoint,
      `Email parse failed (${provider}): ${errMessage(err)}`,
    );
  }
  const normalized = normalizeEmail(parsed, provider);
  return await finalize(endpoint, normalized, startedAt);
}

const detectEmailProvider = (
  headers: Record<string, string>,
): EmailProvider => {
  const explicit = headers["x-email-provider"];
  if (explicit === "ses" || explicit === "mailgun" || explicit === "sendgrid") {
    return explicit;
  }
  // SES / SNS wraps its payload in `{ "Type": "Notification", ... }`
  // — we can detect that from the body shape.
  // For now we default to sendgrid (most common Inbound Parse
  // integration); the header override is the documented way to
  // route Mailgun / SES.
  return "sendgrid";
};

// ---------------------------------------------------------------------------
// slack
// ---------------------------------------------------------------------------

async function handleSlack(
  endpoint: NonNullable<
    Awaited<ReturnType<typeof inboundRepository.getInboundEndpointByToken>>
  >,
  rawBody: string,
  headers: Record<string, string>,
  startedAt: number,
): Promise<Response> {
  // The Slack signing secret isn't stored on the inbound endpoint
  // — it's on the user_connector row for the workspace. We first
  // parse the (untrusted) payload to discover the team_id, then look
  // up the matching connector, then verify the signature with the
  // connector's secret.
  let untrusted: unknown;
  try {
    untrusted = rawBody.length > 0 ? JSON.parse(rawBody) : null;
  } catch (err) {
    return await recordFailedDelivery(
      endpoint,
      `Invalid JSON body: ${errMessage(err)}`,
    );
  }
  if (!isObject(untrusted)) {
    return new Response("Invalid Slack payload", { status: 400 });
  }
  // url_verification has no team_id — handle it without auth (it's
  // the install handshake). Slack expects the `challenge` echoed back
  // as plain text with 200.
  if (untrusted.type === "url_verification") {
    const challenge = untrusted.challenge;
    if (typeof challenge !== "string" || challenge.length === 0) {
      return new Response("Missing challenge", { status: 400 });
    }
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }
  const teamId = typeof untrusted.team_id === "string" ? untrusted.team_id : "";
  if (!teamId) {
    return new Response("Missing team_id", { status: 400 });
  }

  // Look up the user_connector for this Slack team. We store the
  // workspace id in `metadata.workspaceId` (set during OAuth).
  const connectorRows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.provider, "slack"),
        eq(UserConnectorTable.isConnected, true),
      ),
    );
  const connector = connectorRows.find(
    (c) =>
      (c.metadata as Record<string, unknown> | null)?.workspaceId === teamId,
  );
  if (!connector) {
    routeLogger.warn(
      `No Slack connector found for team ${teamId} (endpoint ${endpoint.id})`,
    );
    return new Response("No Slack connector for this workspace", {
      status: 404,
    });
  }
  const signingSecret = extractSlackSigningSecret(connector.metadata);
  if (!signingSecret) {
    return new Response("Slack signing secret is not configured", {
      status: 401,
    });
  }

  const parsed = parseSlackEvent(rawBody, headers, signingSecret);
  if (!parsed.ok) {
    return new Response(parsed.error, { status: parsed.status });
  }
  if (parsed.kind === "challenge") {
    return new Response(parsed.challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }
  let normalized: NormalizedInbound;
  try {
    normalized = normalizeSlack(parsed.payload, connector);
  } catch (err) {
    return await recordFailedDelivery(
      endpoint,
      `Slack normalize failed: ${errMessage(err)}`,
    );
  }
  return await finalize(endpoint, normalized, startedAt, connector.userId);
}

const extractSlackSigningSecret = (metadata: unknown): string | null => {
  if (!isObject(metadata)) return null;
  const v = metadata.signingSecret ?? metadata.signing_secret;
  return typeof v === "string" && v.length > 0 ? v : null;
};

// ---------------------------------------------------------------------------
// shared: persist delivery + enqueue outbox
// ---------------------------------------------------------------------------

async function finalize(
  endpoint: NonNullable<
    Awaited<ReturnType<typeof inboundRepository.getInboundEndpointByToken>>
  >,
  normalized: NormalizedInbound,
  startedAt: number,
  /** Override userId — used for slack (connector's user). Defaults to endpoint owner. */
  userIdOverride?: string,
): Promise<Response> {
  const userId = userIdOverride ?? endpoint.userId;
  const delivery = await inboundRepository.createInboundDelivery({
    inboundEndpointId: endpoint.id,
    status: "normalized",
    payload: normalized as unknown as Record<string, unknown>,
  });
  const event = await webhookRepository.enqueueOutboxEvent({
    kind: "inbound",
    eventType: "inbound.received",
    payload: {
      endpointId: endpoint.id,
      userId,
      agentId: endpoint.agentId,
      deliveryId: delivery.id,
      normalized,
    },
  });
  routeLogger.info(
    `accepted inbound ${endpoint.kind} for endpoint ${endpoint.id} -> delivery ${delivery.id} event ${event.id} (${Date.now() - startedAt}ms)`,
  );
  return Response.json(
    { deliveryId: delivery.id, eventId: event.id },
    { status: 202 },
  );
}

async function recordFailedDelivery(
  endpoint: NonNullable<
    Awaited<ReturnType<typeof inboundRepository.getInboundEndpointByToken>>
  >,
  errorMessage: string,
): Promise<Response> {
  const delivery = await inboundRepository.createInboundDelivery({
    inboundEndpointId: endpoint.id,
    status: "failed",
    error: errorMessage,
    payload: {
      kind: endpoint.kind,
      error: errorMessage,
      receivedAt: new Date().toISOString(),
    },
  });
  return Response.json(
    { deliveryId: delivery.id, error: errorMessage },
    { status: 500 },
  );
}

// ---------------------------------------------------------------------------
// utils
// ---------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const errMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);
