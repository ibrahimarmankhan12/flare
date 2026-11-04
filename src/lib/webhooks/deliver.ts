// ---------------------------------------------------------------------------
// P3.4 — Webhook delivery + exponential backoff (Node 20 native fetch)
// ---------------------------------------------------------------------------
// `deliverWebhook` performs a single HTTP POST to a subscriber URL with
// the signed headers in the Stripe / GitHub convention. The caller
// (the outbox worker in P3.4) is responsible for retry semantics —
// this function does NOT throw on non-2xx responses; it returns a
// structured `DeliveryResult` that the worker can inspect.
//
// `computeBackoffMs` returns an exponentially-spaced delay with ±20%
// jitter to avoid the thundering-herd problem when a flaky subscriber
// recovers and the worker tries to deliver a burst of events at once.
// ---------------------------------------------------------------------------

import { formatSignatureHeader } from "./sign";
import { UrlBlockedError, assertPublicWebhookUrl } from "./url-guard";

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = "flare-webhooks/1";
const SIGNATURE_HEADER = "X-Webhook-Signature";
const MAX_BACKOFF_MS = 60 * 60 * 1000; // 1 hour
const BASE_BACKOFF_MS = 1000; // attempt 0 → 1s base
const JITTER_RATIO = 0.2;

export type DeliveryResult =
  | { ok: true; status: number }
  | { ok: false; status?: number; error: string };

export interface DeliverWebhookInput {
  url: string;
  payload: string;
  signature: string;
  timestamp: string;
  timeoutMs?: number;
}

export const deliverWebhook = async (
  input: DeliverWebhookInput,
): Promise<DeliveryResult> => {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // SSRF guard at delivery time (not just registration): the host must
  // currently resolve to a public address, blocking DNS rebinding and
  // stale records that pointed somewhere safe at signup.
  try {
    await assertPublicWebhookUrl(input.url);
  } catch (err) {
    const reason =
      err instanceof UrlBlockedError
        ? err.message
        : "webhook URL failed safety checks";
    return { ok: false, error: `blocked: ${reason}` };
  }

  try {
    const response = await fetch(input.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SIGNATURE_HEADER]: formatSignatureHeader(
          input.signature,
          input.timestamp,
        ),
        "User-Agent": USER_AGENT,
      },
      body: input.payload,
      signal: controller.signal,
    });

    if (response.ok) {
      return { ok: true, status: response.status };
    }
    return { ok: false, status: response.status, error: response.statusText };
  } catch (err) {
    if (controller.signal.aborted) {
      return { ok: false, error: "timeout" };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeoutId);
  }
};

export const computeBackoffMs = (attempt: number): number => {
  // `attempt` is the number of failures so far. attempt 0 → 1s, 1 → 2s,
  // 2 → 4s, ..., capped at 1 hour. We then add ±20% jitter.
  //
  // The cap (1 hour = 3,600,000 ms) is reached when 2^attempt * 1000ms
  // exceeds it, i.e. at attempt 12 (2^12 = 4096). So attempts 0..11
  // double each time and attempt 12+ stay at 1h ± jitter.
  const base = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  const jitter = base * JITTER_RATIO * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
};
