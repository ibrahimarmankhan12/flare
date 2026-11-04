import "server-only";

import { Sandbox } from "e2b";
import logger from "logger";

import { SANDBOX_LEASE_MS, isE2BConfigured } from "./client";
import { getEnvironment } from "./templates";

// ---------------------------------------------------------------------------
// Sandbox inventory — what backs the /sandboxes page.
// ---------------------------------------------------------------------------
// E2B is the source of truth, not a local table. A sandbox outlives any
// request and can be paused, resumed or reaped by E2B itself, so a mirrored DB
// row would drift the moment the app restarted. Listing by metadata keeps the
// page honest at the cost of one API call.
//
// Ownership is enforced on every single operation by re-reading the sandbox's
// `userId` metadata. Sandbox ids are guessable enough that trusting a path
// parameter would let any signed-in user resume — and read the filesystem of —
// somebody else's box.
// ---------------------------------------------------------------------------

export type SandboxState = "running" | "paused";

export interface SandboxSummary {
  sandboxId: string;
  state: SandboxState;
  /** "tool" (chat sandbox) or "build" (app builder). */
  feature: string | null;
  /** Environment id, when the sandbox was created with one. */
  env: string | null;
  envLabel: string | null;
  threadId: string | null;
  buildId: string | null;
  startedAt: string | null;
  /** When E2B will auto-pause it. Paused sandboxes are free. */
  expiresAt: string | null;
}

interface RawSandbox {
  sandboxId: string;
  startedAt?: string | Date;
  endAt?: string | Date;
  metadata?: Record<string, string>;
}

const iso = (v: string | Date | undefined): string | null =>
  v ? new Date(v).toISOString() : null;

const toSummary = (raw: RawSandbox, state: SandboxState): SandboxSummary => {
  const md = raw.metadata ?? {};
  const env = md.env ?? null;
  return {
    sandboxId: raw.sandboxId,
    state,
    feature: md.feature ?? null,
    env,
    envLabel: env ? (getEnvironment(env)?.label ?? env) : null,
    threadId: md.threadId ?? null,
    buildId: md.buildId ?? null,
    startedAt: iso(raw.startedAt),
    // Only meaningful while running: a paused sandbox is not counting down.
    expiresAt: state === "running" ? iso(raw.endAt) : null,
  };
};

/** Every sandbox this user owns, newest first. */
export const listUserSandboxes = async (
  userId: string,
): Promise<SandboxSummary[]> => {
  if (!isE2BConfigured()) return [];

  // Queried per state because the list API filters by state rather than
  // reporting it, so this is the only way to know which is which.
  const states: SandboxState[] = ["running", "paused"];
  const results = await Promise.all(
    states.map(async (state) => {
      try {
        const items = await Sandbox.list({
          query: { metadata: { app: "flare", userId }, state: [state] },
        }).nextItems();
        return (items as RawSandbox[]).map((raw) => toSummary(raw, state));
      } catch (err) {
        logger.warn(
          `[sandbox-inventory] list ${state} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return [];
      }
    }),
  );

  return results
    .flat()
    .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
};

/**
 * Confirm this user owns this sandbox.
 *
 * Checks both states because a paused sandbox is exactly the one a user is
 * most likely to be acting on from this page.
 */
export const assertSandboxOwned = async (
  sandboxId: string,
  userId: string,
): Promise<SandboxSummary | null> => {
  const all = await listUserSandboxes(userId);
  return all.find((s) => s.sandboxId === sandboxId) ?? null;
};

/**
 * Resume a paused sandbox and hand it a fresh lease.
 *
 * `Sandbox.connect` resumes as a side effect — verified: a paused sandbox
 * reconnects in ~400ms with its filesystem intact. Running sandboxes are
 * connected to as well, which just renews the lease.
 */
export const resumeSandbox = async (
  sandboxId: string,
): Promise<{ expiresAt: string }> => {
  await Sandbox.connect(sandboxId, { timeoutMs: SANDBOX_LEASE_MS });
  logger.info(`[sandbox-inventory] resumed sandbox=${sandboxId}`);
  return { expiresAt: new Date(Date.now() + SANDBOX_LEASE_MS).toISOString() };
};

/** Pause a running sandbox: billing stops, the filesystem is kept. */
export const pauseSandboxById = async (sandboxId: string): Promise<void> => {
  const sbx = await Sandbox.connect(sandboxId);
  await sbx.pause();
  logger.info(`[sandbox-inventory] paused sandbox=${sandboxId}`);
};

/** Terminal: the sandbox and everything in it is gone. */
export const killSandboxById = async (sandboxId: string): Promise<void> => {
  await Sandbox.kill(sandboxId);
  logger.info(`[sandbox-inventory] killed sandbox=${sandboxId}`);
};
