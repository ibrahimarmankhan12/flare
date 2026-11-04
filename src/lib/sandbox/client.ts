import "server-only";

import { Sandbox } from "e2b";
import logger from "logger";

// ---------------------------------------------------------------------------
// E2B sandbox client for the Build feature.
// ---------------------------------------------------------------------------
// Cost model (verified against e2b.dev/docs/billing and the shipped 2.36.1
// types) drives most of the choices here:
//
//   * Running sandboxes bill per second. Paused sandboxes are FREE and do not
//     count toward the concurrent-sandbox limit.
//   * So every sandbox is created with `onTimeout: 'pause'` + `autoResume`.
//     That is a server-side guarantee: even if this app crashes mid-request or
//     a user abandons a tab, E2B pauses the sandbox itself and billing stops.
//     Traffic to the preview URL wakes it transparently.
//   * `kill` is reserved for "done with this build" — it is terminal and the
//     filesystem is lost.
//
// Lease is 2h rather than the 24h maximum: long enough that a full-stack app
// stays up across a working session, short enough that a leaked sandbox is
// bounded. Idle sandboxes auto-pause anyway (free, and auto-resume restores
// the memory snapshot in place), so the lease mainly caps the worst case.
// ---------------------------------------------------------------------------

/** How long a sandbox stays live before auto-pausing. Override via env. */
export const SANDBOX_LEASE_MS =
  Number.parseInt(process.env.E2B_SANDBOX_LEASE_MS || "", 10) ||
  2 * 60 * 60_000;

/** Port the generated app's dev server listens on inside the sandbox. */
export const DEV_SERVER_PORT = 3000;

export const isE2BConfigured = (): boolean =>
  Boolean(process.env.E2B_API_KEY?.trim());

const assertConfigured = () => {
  if (!isE2BConfigured()) {
    throw new Error(
      "E2B_API_KEY is not configured — the Build feature is unavailable.",
    );
  }
};

export interface SandboxLease {
  sandboxId: string;
  /** When E2B will auto-pause it if untouched. */
  expiresAt: Date;
}

/**
 * Create a sandbox for a build.
 *
 * `metadata` is what makes orphan reconciliation possible: E2B can be listed
 * by metadata, so a sweep can find sandboxes this app created even if the
 * corresponding DB row was lost.
 */
export const createBuildSandbox = async (params: {
  buildId: string;
  userId: string;
  template?: string;
  leaseMs?: number;
  /** Extra env for the sandbox (e.g. a coding agent's vendor API key). */
  envs?: Record<string, string>;
}): Promise<{ sandbox: Sandbox; lease: SandboxLease }> => {
  assertConfigured();
  const leaseMs = params.leaseMs ?? SANDBOX_LEASE_MS;

  const sandbox = await Sandbox.create({
    ...(params.template ? { template: params.template } : {}),
    ...(params.envs && Object.keys(params.envs).length
      ? { envs: params.envs }
      : {}),
    timeoutMs: leaseMs,
    metadata: {
      app: "flare",
      feature: "build",
      buildId: params.buildId,
      userId: params.userId,
    },
    lifecycle: {
      onTimeout: "pause",
      autoResume: true,
    },
  });

  logger.info(
    `[e2b] created sandbox=${sandbox.sandboxId} build=${params.buildId} lease=${leaseMs}ms`,
  );
  return {
    sandbox,
    lease: {
      sandboxId: sandbox.sandboxId,
      expiresAt: new Date(Date.now() + leaseMs),
    },
  };
};

/**
 * Reconnect to an existing sandbox. Returns null when it is gone (killed or
 * reclaimed) so callers can fall back to rebuilding instead of throwing.
 */
export const reconnectSandbox = async (
  sandboxId: string,
  leaseMs: number = SANDBOX_LEASE_MS,
): Promise<Sandbox | null> => {
  assertConfigured();
  try {
    // connect() also auto-resumes a paused sandbox.
    const sandbox = await Sandbox.connect(sandboxId, { timeoutMs: leaseMs });
    return sandbox;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[e2b] reconnect failed sandbox=${sandboxId}: ${message}`);
    return null;
  }
};

/** Extend a live sandbox's lease (e.g. the user is actively working). */
export const renewLease = async (
  sandbox: Sandbox,
  leaseMs: number = SANDBOX_LEASE_MS,
): Promise<Date> => {
  await sandbox.setTimeout(leaseMs);
  return new Date(Date.now() + leaseMs);
};

export interface WriteFile {
  path: string;
  content: string;
}

/** Write generated project files in one batch. */
export const writeFiles = async (sandbox: Sandbox, files: WriteFile[]) => {
  if (files.length === 0) return;
  await sandbox.files.write(
    files.map((f) => ({ path: f.path, data: f.content })),
  );
};

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a command to completion. `onOutput` streams combined output so the UI
 * can show progress rather than hanging on a long install.
 */
export const runCommand = async (
  sandbox: Sandbox,
  cmd: string,
  opts: {
    cwd?: string;
    timeoutMs?: number;
    onOutput?: (chunk: string) => void;
  } = {},
): Promise<RunResult> => {
  const res = await sandbox.commands.run(cmd, {
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
    ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
    onStdout: opts.onOutput ? (d: string) => opts.onOutput!(d) : undefined,
    onStderr: opts.onOutput ? (d: string) => opts.onOutput!(d) : undefined,
  });
  return {
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    exitCode: res.exitCode ?? 0,
  };
};

/**
 * Start a long-lived dev server in the background and return its public URL.
 *
 * The server must bind 0.0.0.0 — a process listening only on localhost is not
 * reachable through E2B's public host.
 */
export const startDevServer = async (
  sandbox: Sandbox,
  params: {
    cmd: string;
    cwd?: string;
    port?: number;
    onOutput?: (c: string) => void;
  },
): Promise<{ previewUrl: string; kill: () => Promise<void> }> => {
  const port = params.port ?? DEV_SERVER_PORT;
  const handle = await sandbox.commands.run(params.cmd, {
    ...(params.cwd ? { cwd: params.cwd } : {}),
    background: true,
    onStdout: params.onOutput ? (d: string) => params.onOutput!(d) : undefined,
    onStderr: params.onOutput ? (d: string) => params.onOutput!(d) : undefined,
  });
  return {
    previewUrl: getPreviewUrl(sandbox, port),
    kill: async () => {
      await handle.kill();
    },
  };
};

/** `https://<port>-<sandboxId>.e2b.app` — synchronous, no network call. */
export const getPreviewUrl = (
  sandbox: Sandbox,
  port = DEV_SERVER_PORT,
): string => `https://${sandbox.getHost(port)}`;

/** Stop billing but keep the filesystem + memory so work can resume. */
export const pauseSandbox = async (sandbox: Sandbox): Promise<void> => {
  await sandbox.pause();
};

/** Terminal — the sandbox and its filesystem are gone. */
export const killSandbox = async (sandboxId: string): Promise<void> => {
  assertConfigured();
  try {
    await Sandbox.kill(sandboxId);
    logger.info(`[e2b] killed sandbox=${sandboxId}`);
  } catch (err) {
    // Already gone is a success for our purposes.
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      `[e2b] kill sandbox=${sandboxId} failed (may already be gone): ${message}`,
    );
  }
};

export interface FlareTemplate {
  name: string;
  templateId: string;
  cpuCount: number;
  memoryMB: number;
}

interface E2BTemplateV2 {
  templateID: string;
  aliases: string[];
  names: string[];
  cpuCount: number;
  memoryMB: number;
  public: boolean;
}

const FLARE_TEMPLATES_TTL_MS = 5 * 60_000;

let flareTemplatesCache: { at: number; data: FlareTemplate[] } | null = null;

/**
 * The team's own custom sandbox templates (those whose first alias/name starts
 * with "flare-"), built by the flare template build pipeline.
 *
 * Results are cached in-module for 5 minutes so the Build feature does not
 * hammer E2B's templates API on every session. Never throws: any failure
 * (network, non-200, parse) degrades to an empty list.
 */
export const listFlareTemplates = async (): Promise<FlareTemplate[]> => {
  if (!isE2BConfigured()) {
    logger.warn("[e2b] listFlareTemplates skipped: E2B_API_KEY not configured");
    return [];
  }
  if (
    flareTemplatesCache &&
    Date.now() - flareTemplatesCache.at < FLARE_TEMPLATES_TTL_MS
  ) {
    return flareTemplatesCache.data;
  }
  try {
    const res = await fetch("https://api.e2b.dev/v2/templates?limit=100", {
      headers: { "X-API-Key": process.env.E2B_API_KEY as string },
    });
    if (!res.ok) {
      throw new Error(`E2B templates API responded with ${res.status}`);
    }
    const templates = (await res.json()) as E2BTemplateV2[];
    const flare = templates
      .filter((t) => {
        const first = t.aliases?.[0] || t.names?.[0];
        return first?.startsWith("flare-");
      })
      .map((t) => ({
        name: t.aliases?.[0] || t.names?.[0],
        templateId: t.templateID,
        cpuCount: t.cpuCount,
        memoryMB: t.memoryMB,
      }));
    flareTemplatesCache = { at: Date.now(), data: flare };
    return flare;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[e2b] listFlareTemplates failed: ${message}`);
    return [];
  }
};

/**
 * All sandboxes this app owns, by metadata. Used to reconcile against the DB
 * and find orphans — sandboxes that are running with no build row pointing at
 * them (which would otherwise bill unnoticed).
 */
export const listOwnedSandboxes = async (
  state?: ("running" | "paused")[],
  /** Narrow to one feature ("build" | "tool"); omit for everything Flare owns. */
  feature?: string,
) => {
  assertConfigured();
  const paginator = Sandbox.list({
    query: {
      metadata: { app: "flare", ...(feature ? { feature } : {}) },
      ...(state ? { state } : {}),
    },
  });
  return paginator.nextItems();
};
