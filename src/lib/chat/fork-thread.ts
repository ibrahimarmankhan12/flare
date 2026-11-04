/**
 * Phase 1+#8 — client-side helpers for the thread fork UI affordance.
 *
 * The `POST /api/thread/[id]/fork` route was added in P1.7. The UI in
 * `src/components/message-parts.tsx` (the "Fork from here" action on
 * assistant messages) calls into this module so that the request shape
 * is testable in isolation, and the response parsing is consistent
 * across the app.
 *
 * Everything in here is pure-JS or fetch-based, so it can be unit
 * tested with vitest (no DOM, no React).
 */

import type { ChatThread } from "app-types/chat";

export type ForkThreadRequest = {
  /** The id of the message to fork from. Required by the API. */
  forkFromMessageId: string;
  /** Optional short label (max 100 chars) appended to the new title. */
  branchLabel?: string;
};

export type ForkThreadResult = ChatThread;

/**
 * Build the absolute URL for the fork API. Exposed so tests can assert
 * the route shape without needing to stub `fetch`.
 */
export function buildForkUrl(sourceThreadId: string): string {
  return `/api/thread/${encodeURIComponent(sourceThreadId)}/fork`;
}

/**
 * Build the JSON body the API expects. Kept as a tiny pure function so
 * the request shape is testable without hitting `fetch` — the route
 * rejects anything that doesn't match this exact shape (see
 * `src/app/api/thread/[id]/fork/route.ts`).
 */
export function buildForkBody(input: ForkThreadRequest): string {
  if (!input || typeof input.forkFromMessageId !== "string") {
    throw new Error("forkFromMessageId is required");
  }
  if (input.forkFromMessageId.length === 0) {
    throw new Error("forkFromMessageId is required");
  }
  if (input.branchLabel !== undefined) {
    if (typeof input.branchLabel !== "string" || input.branchLabel.length === 0) {
      throw new Error("branchLabel must be a non-empty string");
    }
    if (input.branchLabel.length > 100) {
      throw new Error("branchLabel must be at most 100 characters");
    }
  }
  const body: ForkThreadRequest = { forkFromMessageId: input.forkFromMessageId };
  if (input.branchLabel) {
    body.branchLabel = input.branchLabel;
  }
  return JSON.stringify(body);
}

/**
 * Send a fork request to the backend. Throws an `Error` with the
 * server-provided message on non-2xx responses, so callers can surface
 * it via toast.
 */
export async function forkThread(
  sourceThreadId: string,
  input: ForkThreadRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<ForkThreadResult> {
  const res = await fetchImpl(buildForkUrl(sourceThreadId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: buildForkBody(input),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Fork failed with status ${res.status}`);
  }
  return (await res.json()) as ForkThreadResult;
}
