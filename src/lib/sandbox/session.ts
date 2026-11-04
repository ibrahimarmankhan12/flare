import "server-only";

import { Sandbox } from "e2b";
import logger from "logger";

import { SANDBOX_LEASE_MS, isE2BConfigured, reconnectSandbox } from "./client";
import {
  DEFAULT_ENV_ID,
  type ResolvedEnvironment,
  WORK_DIR,
  resolveEnvironment,
} from "./templates";

// ---------------------------------------------------------------------------
// Per-conversation sandbox, for the general-purpose agent tool.
// ---------------------------------------------------------------------------
// One sandbox per (thread, environment), reused across tool calls. Persistence
// is the whole point: the agent can install a package in one turn, write a
// file in the next, and run it in a third — state accumulates like a real
// shell session instead of every call starting from an empty box.
//
// Keyed by environment as well as thread because the environments are
// different images: a conversation that does data analysis and then builds an
// Android APK needs both, and neither can be retrofitted into the other at
// runtime. Switching env in the same thread
// therefore opens a second sandbox rather than replacing the first, so the
// earlier work is still there when the agent switches back.
//
// Discovery goes through E2B metadata rather than a local map, so a session
// survives a Flare restart: the sandbox is still running and still tagged with
// its threadId, so the next call reconnects instead of orphaning it and
// starting a second one.
// ---------------------------------------------------------------------------

export const SANDBOX_TOOL_FEATURE = "tool";

export { WORK_DIR };

const cache = new Map<string, string>(); // `${threadId}:${envId}` -> sandboxId

const cacheKey = (threadId: string, envId: string) => `${threadId}:${envId}`;

const listByMetadata = async (metadata: Record<string, string>) => {
  try {
    const items = await Sandbox.list({
      query: { metadata, state: ["running", "paused"] },
    }).nextItems();
    return items as { sandboxId: string; metadata?: Record<string, string> }[];
  } catch {
    return [];
  }
};

const findExisting = async (
  threadId: string,
  envId: string,
): Promise<string | null> => {
  const base = { app: "flare", feature: SANDBOX_TOOL_FEATURE, threadId };

  const exact = await listByMetadata({ ...base, env: envId });
  if (exact[0]) return exact[0].sandboxId;

  // Sandboxes created before environments existed carry no `env` in their
  // metadata, so the query above cannot match them. Without this fallback the
  // first tool call after deploying would silently abandon a live sandbox and
  // start a second one — indistinguishable, from the user's side, from "it
  // didn't resume", and their work would appear to have vanished.
  //
  // Only adopt them for the default environment: an untagged sandbox is by
  // definition the stock image, so handing it to a request for `android`
  // would be worse than starting fresh.
  if (envId !== DEFAULT_ENV_ID) return null;
  const legacy = await listByMetadata(base);
  return legacy.find((s) => !s.metadata?.env)?.sandboxId ?? null;
};

export interface ThreadSandbox {
  sandbox: Sandbox;
  resolved: ResolvedEnvironment;
  /** True when this call created it, so the caller can brief the model once. */
  created: boolean;
}

/**
 * Get the sandbox for this thread and environment, creating one on first use.
 *
 * Returns the live handle; callers should not cache it across requests because
 * a paused sandbox needs reconnecting (which `reconnectSandbox` does).
 */
export const getThreadSandbox = async (params: {
  threadId: string;
  userId: string;
  /** Environment id from `templates.ts`; falls back to "base". */
  env?: string;
}): Promise<ThreadSandbox> => {
  if (!isE2BConfigured()) {
    throw new Error(
      "E2B_API_KEY is not configured — the sandbox is unavailable.",
    );
  }

  const resolved = resolveEnvironment(params.env);
  const key = cacheKey(params.threadId, resolved.id);

  const cached = cache.get(key);
  if (cached) {
    const sbx = await reconnectSandbox(cached);
    if (sbx) return { sandbox: sbx, resolved, created: false };
    cache.delete(key); // stale
  }

  const existingId = await findExisting(params.threadId, resolved.id);
  if (existingId) {
    const sbx = await reconnectSandbox(existingId);
    if (sbx) {
      cache.set(key, existingId);
      return { sandbox: sbx, resolved, created: false };
    }
  }

  const sbx = await Sandbox.create({
    ...(resolved.template ? { template: resolved.template } : {}),
    // The template's own `setEnvs` does not reach the runtime shell, so a
    // template that needs JAVA_HOME / GOPATH / ANDROID_HOME declares them in
    // the registry and they are applied here instead.
    ...(resolved.environment?.envs ? { envs: resolved.environment.envs } : {}),
    timeoutMs: SANDBOX_LEASE_MS,
    metadata: {
      app: "flare",
      feature: SANDBOX_TOOL_FEATURE,
      threadId: params.threadId,
      userId: params.userId,
      env: resolved.id,
    },
    lifecycle: { onTimeout: "pause", autoResume: true },
  });
  // Templates already create and own WORK_DIR; this only matters on the stock
  // image, where nothing has prepared it.
  await sbx.commands.run(`mkdir -p ${WORK_DIR}`).catch(() => undefined);
  cache.set(key, sbx.sandboxId);
  logger.info(
    `[sandbox-tool] created sandbox=${sbx.sandboxId} thread=${params.threadId} env=${resolved.id} template=${resolved.template ?? "stock"}`,
  );
  return { sandbox: sbx, resolved, created: true };
};

/**
 * Destroy this thread's sandboxes.
 *
 * With no `env`, every environment opened in the thread is destroyed — "reset"
 * should mean a clean slate, not "clean slate except the environment I'm not
 * currently looking at".
 */
export const resetThreadSandbox = async (
  threadId: string,
  env?: string,
): Promise<number> => {
  const ids = new Set<string>();

  if (env) {
    const resolved = resolveEnvironment(env);
    const id =
      cache.get(cacheKey(threadId, resolved.id)) ??
      (await findExisting(threadId, resolved.id));
    if (id) ids.add(id);
  } else {
    try {
      const items = await Sandbox.list({
        query: {
          metadata: {
            app: "flare",
            feature: SANDBOX_TOOL_FEATURE,
            threadId,
          },
          state: ["running", "paused"],
        },
      }).nextItems();
      for (const item of items as { sandboxId: string }[]) {
        ids.add(item.sandboxId);
      }
    } catch {
      // Fall through to whatever the local cache knows.
    }
    for (const [key, id] of cache) {
      if (key.startsWith(`${threadId}:`)) ids.add(id);
    }
  }

  for (const id of ids) {
    await Sandbox.kill(id).catch(() => undefined);
  }
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${threadId}:`)) cache.delete(key);
  }

  if (ids.size) {
    logger.info(
      `[sandbox-tool] reset thread=${threadId} killed=${[...ids].join(",")}`,
    );
  }
  return ids.size;
};
