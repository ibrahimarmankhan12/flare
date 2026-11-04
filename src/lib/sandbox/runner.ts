import "server-only";

import type { Sandbox } from "e2b";
import { streamText } from "ai";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { customModelProvider } from "lib/ai/models";
import { buildJobRepository } from "lib/db/repository";
import type { BuildJobEntity } from "lib/db/pg/schema.pg";
import logger from "logger";

import { agentEnvs, getAgent, isAgentAvailable } from "./agents";
import { publishBuildEvent } from "./build-events";
import { buildWithVibeSdk, type VibeBehavior } from "./vibesdk";
import {
  createBuildSandbox,
  DEV_SERVER_PORT,
  getPreviewUrl,
  killSandbox,
  listOwnedSandboxes,
  reconnectSandbox,
  runCommand,
  SANDBOX_LEASE_MS,
  startDevServer,
  writeFiles,
  type WriteFile,
} from "./client";

// ---------------------------------------------------------------------------
// Build runner: prompt -> generated files -> live sandbox -> preview URL.
// ---------------------------------------------------------------------------
// The generated app is intentionally a plain static/Node app rather than a
// framework scaffold: `npm create vite` + `npm install` costs tens of seconds
// of *billed* sandbox time on every build. Writing files directly and serving
// them means a preview in seconds. A custom E2B template is the documented way
// to get a framework preset with dependencies pre-installed (see
// e2b.dev/docs/template/examples/nextjs) — worth doing if React/Next output
// becomes the norm.
// ---------------------------------------------------------------------------

const APP_DIR = "/home/user/app";

/**
 * Map a model/DB-supplied relative path to an absolute path inside the
 * sandbox app dir, or return null when the path is unsafe. Rejects
 * absolute paths and any path containing ".." segments so stored or
 * generated file lists can never escape APP_DIR inside the sandbox VM.
 */
const toSandboxPath = (relPath: string): string | null => {
  const cleaned = relPath.replace(/^\/+/, "").replace(/\\/g, "/");
  if (!cleaned) return null;
  const segments = cleaned.split("/");
  if (segments.some((s) => s === "..")) return null;
  const joined = segments.filter((s) => s.length > 0 && s !== ".").join("/");
  if (!joined) return null;
  return `${APP_DIR}/${joined}`;
};

// Model-emitted paths are untrusted: without this check a plan containing
// "../../etc/cron.d/x" would escape the app dir inside the sandbox VM.
const SAFE_RELATIVE_PATH = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith("/") && !p.includes(".."), {
    message:
      "Path must be relative to the app root and must not contain '..' segments",
  });

const FileSchema = z.object({
  path: SAFE_RELATIVE_PATH.describe(
    "Path relative to the app root, e.g. 'index.html' or 'styles/main.css'. No leading slash.",
  ),
  content: z.string().describe("Full file contents."),
});

const PlanSchema = z.object({
  title: z.string().describe("Short title for this app, 2-5 words."),
  summary: z
    .string()
    .describe("One or two sentences describing what was built."),
  files: z
    .array(FileSchema)
    .min(1)
    .max(20)
    .describe(
      "All files for the app. MUST include an index.html at the root that is the entry point.",
    ),
});

export type BuildPlan = z.infer<typeof PlanSchema>;

const PLANNER_SYSTEM = `You generate working web applications that run in a Linux sandbox with Node.js available.

Choose the simplest stack that genuinely satisfies the request:

STATIC — plain HTML/CSS/JS (Tailwind via CDN is fine).
  Use this when no server, database, or build step is needed.
  Emit "index.html" at the root as the entry point. Do NOT emit package.json.

FULL-STACK — Node.js server, API routes, persistence, auth, real dependencies.
  Use this whenever the request needs a backend, data that outlives a page
  reload, server-side logic, or a framework.
  You MUST emit a package.json with:
    - all dependencies you import (they will be installed with npm)
    - a "dev" script that starts the server listening on 0.0.0.0 PORT 3000
  Examples of a correct dev script:
    "dev": "node server.js"            (server binds 0.0.0.0:3000)
    "dev": "vite --host 0.0.0.0 --port 3000"
    "dev": "next dev -H 0.0.0.0 -p 3000"
  The server MUST listen on 0.0.0.0:3000 — not localhost, not another port,
  or the preview will be unreachable.
  Prefer SQLite (better-sqlite3) or a JSON file for persistence; no external
  database is reachable from the sandbox.

Rules for both:
- Every file you reference must be a file you also emit.
- Make it genuinely functional and visually polished, not a placeholder.
- Keep it under 20 files.

Respond with ONLY a JSON object in this exact shape, inside a \`\`\`json fence:
{"title": "...", "summary": "...", "files": [{"path": "index.html", "content": "..."}]}
No prose before or after.`;

/**
 * LLM pass: prompt -> a set of files that can be served as-is.
 *
 * Uses generateText + explicit JSON parsing rather than generateObject: the
 * free opencode-zen models routed through Bifrost do not support JSON-schema
 * (structured output) mode and fail with "Upstream request failed". The Canvas
 * tool hit the same wall and was converted the same way (see context.md,
 * 2026-07-27 Canvas fixes). The schema is still enforced — just after parsing.
 */
export const generateAppFiles = async (
  prompt: string,
  /** Receives raw model output as it arrives, for live streaming to the UI. */
  onDelta?: (chunk: string) => void,
): Promise<BuildPlan> => {
  // streamText (not generateText) so the caller can forward tokens to the
  // browser while the model is still writing.
  const result = streamText({
    model: customModelProvider.getModel({
      provider: "flare",
      model: "deepseek/v3.2",
    }),
    system: PLANNER_SYSTEM,
    prompt,
  });

  let text = "";
  for await (const delta of result.textStream) {
    text += delta;
    onDelta?.(delta);
  }

  const parsed = PlanSchema.safeParse(extractJson(text));
  if (!parsed.success) {
    throw new Error(
      `The model did not return a usable app plan: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .slice(0, 3)
        .join("; ")}`,
    );
  }
  return parsed.data;
};

/**
 * Pull a JSON object out of a model response. Models routinely wrap JSON in a
 * ```json fence or add prose around it, so anchoring on the outermost braces is
 * more reliable than trusting the whole string to parse.
 */
const extractJson = (raw: string): unknown => {
  const text = (raw ?? "").trim();
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first !== -1 && last > first) {
      try {
        return JSON.parse(candidate.slice(first, last + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error("The model response was not valid JSON.");
  }
};

/**
 * Start the preview server for whatever the model produced.
 *
 * A package.json is the signal that this is a full-stack app: install its
 * dependencies and run its `dev` script. Otherwise serve the files statically
 * with python3's http.server, which is already on the image and needs no
 * install — that keeps trivial static builds fast and cheap.
 *
 * Readiness is polled rather than assumed: `npm install` plus framework
 * startup can take a while, and returning a preview URL before the server
 * accepts connections looks like a broken build to the user.
 */
const startPreviewServer = async (
  sandbox: Sandbox,
  opts: {
    hasPackageJson: boolean;
    buildId: string;
    emit: (stage: string, detail?: string) => void;
  },
): Promise<void> => {
  const stream = (chunk: string) =>
    publishBuildEvent(opts.buildId, { type: "output", chunk, at: Date.now() });

  if (!opts.hasPackageJson) {
    await startDevServer(sandbox, {
      cmd: "python3 -m http.server 3000 --bind 0.0.0.0",
      cwd: APP_DIR,
      port: DEV_SERVER_PORT,
    });
    return;
  }

  opts.emit("installing", "Installing dependencies");
  const install = await runCommand(
    sandbox,
    "npm install --no-audit --no-fund",
    {
      cwd: APP_DIR,
      timeoutMs: 8 * 60_000,
      onOutput: stream,
    },
  );
  if (install.exitCode !== 0) {
    throw new Error(
      `npm install failed (exit ${install.exitCode}): ${install.stderr.slice(-400)}`,
    );
  }

  opts.emit("starting", "Starting the dev server");
  await startDevServer(sandbox, {
    cmd: "npm run dev",
    cwd: APP_DIR,
    port: DEV_SERVER_PORT,
    onOutput: stream,
  });

  // Wait until something is actually listening on 3000.
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 1500));
    const probe = await runCommand(
      sandbox,
      `curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:${DEV_SERVER_PORT} || true`,
      { timeoutMs: 15_000 },
    );
    const code = probe.stdout.trim();
    if (code && code !== "000") {
      opts.emit("starting", `Dev server responded (HTTP ${code})`);
      return;
    }
  }
  throw new Error(
    "The dev server never started listening on port 3000. Its `dev` script must bind 0.0.0.0:3000.",
  );
};

// ---------------------------------------------------------------------------
// Clarification pass
// ---------------------------------------------------------------------------
// A vague prompt produces a confidently wrong app, and the user only finds out
// after paying for a sandbox and waiting. Cheaper to ask first. This is a
// text-only call — no sandbox is created — so asking costs almost nothing.
// ---------------------------------------------------------------------------

const CLARIFY_SYSTEM = `You decide whether a request to build a web app is specific enough to build.

Answer with JSON only, inside a \`\`\`json fence:
{"readyToBuild": true|false, "questions": ["..."], "assumptions": ["..."]}

Set readyToBuild=false and ask 2-4 SHORT questions ONLY when a genuinely
different app would result depending on the answer — for example unclear data
persistence, authentication, multi-user behaviour, or a core feature that was
not described.

Do NOT ask about styling preferences, colours, or anything you can reasonably
decide yourself. If the request is clear enough to build something useful, set
readyToBuild=true, leave questions empty, and list the assumptions you would
make.`;

export interface ClarifyResult {
  readyToBuild: boolean;
  questions: string[];
  assumptions: string[];
}

export const clarifyPrompt = async (prompt: string): Promise<ClarifyResult> => {
  const result = streamText({
    model: customModelProvider.getModel({
      provider: "flare",
      model: "deepseek/v3.2",
    }),
    system: CLARIFY_SYSTEM,
    prompt,
  });
  let text = "";
  for await (const delta of result.textStream) text += delta;

  try {
    const parsed = extractJson(text) as Partial<ClarifyResult>;
    return {
      readyToBuild: parsed.readyToBuild !== false,
      questions: Array.isArray(parsed.questions)
        ? parsed.questions.slice(0, 4)
        : [],
      assumptions: Array.isArray(parsed.assumptions)
        ? parsed.assumptions.slice(0, 6)
        : [],
    };
  } catch {
    // If the clarifier misbehaves, never block the build on it.
    return { readyToBuild: true, questions: [], assumptions: [] };
  }
};

export interface ProvisionResult {
  buildId: string;
  previewUrl: string;
  sandboxId: string;
  expiresAt: Date;
  title: string;
  summary: string;
  files: { path: string; content: string }[];
}

/**
 * Full build: generate files, provision a sandbox, serve them, persist state.
 *
 * The build row is written BEFORE the sandbox is created and updated with the
 * sandbox id immediately after, so a crash between the two can never orphan a
 * billing sandbox that nothing points at.
 */
export const runBuild = async (params: {
  userId: string;
  threadId: string;
  prompt: string;
  buildId?: string;
  toolCallId?: string;
  onProgress?: (stage: string, detail?: string) => void;
}): Promise<ProvisionResult> => {
  const buildId = params.buildId ?? `build_${randomUUID()}`;
  const emit = (stage: string, detail?: string) => {
    params.onProgress?.(stage, detail);
    publishBuildEvent(buildId, {
      type: "stage",
      stage,
      detail,
      at: Date.now(),
    });
  };
  const progress = emit;

  await buildJobRepository.create(
    {
      id: buildId,
      threadId: params.threadId,
      prompt: params.prompt,
      toolCallId: params.toolCallId ?? null,
      framework: "static",
    },
    params.userId,
  );

  try {
    progress("planning", "Generating application files");
    await buildJobRepository.setStatusUnscoped(buildId, { status: "planning" });
    const plan = await generateAppFiles(params.prompt, (chunk) =>
      publishBuildEvent(buildId, { type: "output", chunk, at: Date.now() }),
    );

    progress("provisioning", "Starting sandbox");
    await buildJobRepository.setStatusUnscoped(buildId, {
      status: "generating",
      title: plan.title,
      summary: plan.summary,
      files: plan.files,
    });

    const { sandbox, lease } = await createBuildSandbox({
      buildId,
      userId: params.userId,
    });

    // Record the handle immediately — before any further work can fail.
    await buildJobRepository.setStatusUnscoped(buildId, {
      sandboxId: lease.sandboxId,
      sandboxExpiresAt: lease.expiresAt,
    });

    try {
      progress("writing", `Writing ${plan.files.length} files`);
      const files: WriteFile[] = plan.files.flatMap((f) => {
        const sandboxPath = toSandboxPath(f.path);
        return sandboxPath ? [{ path: sandboxPath, content: f.content }] : [];
      });
      await writeFiles(sandbox, files);
      for (const f of plan.files) {
        publishBuildEvent(buildId, {
          type: "file",
          path: f.path,
          at: Date.now(),
        });
      }

      await buildJobRepository.setStatusUnscoped(buildId, {
        status: "running",
      });
      await startPreviewServer(sandbox, {
        hasPackageJson: plan.files.some(
          (f) => f.path.replace(/^\/+/, "") === "package.json",
        ),
        buildId,
        emit: progress,
      });

      const previewUrl = getPreviewUrl(sandbox, 3000);
      await buildJobRepository.setStatusUnscoped(buildId, {
        status: "ready",
        previewUrl,
      });
      progress("ready", previewUrl);
      publishBuildEvent(buildId, {
        type: "done",
        status: "ready",
        previewUrl,
        at: Date.now(),
      });

      logger.info(`[build] ${buildId} ready sandbox=${lease.sandboxId}`);
      return {
        buildId,
        previewUrl,
        sandboxId: lease.sandboxId,
        expiresAt: lease.expiresAt,
        title: plan.title,
        summary: plan.summary,
        files: plan.files,
      };
    } catch (err) {
      // Sandbox exists but the build failed — kill it rather than leaving it
      // to bill for the rest of its lease.
      await killSandbox(lease.sandboxId);
      await buildJobRepository.releaseSandbox(buildId);
      throw err;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await buildJobRepository.setStatusUnscoped(buildId, {
      status: "failed",
      error: message,
    });
    publishBuildEvent(buildId, {
      type: "done",
      status: "failed",
      error: message,
      at: Date.now(),
    });
    logger.error(`[build] ${buildId} failed: ${message}`);
    throw err;
  }
};

// ---------------------------------------------------------------------------
// Cloud Agent mode
// ---------------------------------------------------------------------------
// Instead of "LLM emits files, we serve them", this runs a real coding agent
// (OpenCode) INSIDE the sandbox with terminal, filesystem and git. E2B ships a
// prebuilt `opencode` template with the agent already installed.
//
// Provider: OpenCode's own Zen free models need NO credentials — verified in a
// sandbox (`opencode auth list` -> 0 credentials, task still completed). That
// matters because every provider key in this deployment's .env is a `****`
// placeholder. Routing OpenCode at the Bifrost gateway instead does NOT work:
// it defaults to a model Bifrost cannot resolve, and a nested
// `openai/opencode-zen/...` id makes OpenCode itself throw.
// ---------------------------------------------------------------------------

/** Prebuilt E2B template with the OpenCode agent installed. */
export const AGENT_TEMPLATE = process.env.E2B_AGENT_TEMPLATE || "opencode";

/** Free OpenCode Zen model — no API key required. */
export const AGENT_MODEL =
  process.env.E2B_AGENT_MODEL || "opencode/deepseek-v4-flash-free";

export interface AgentBuildResult extends ProvisionResult {
  agentLog: string;
}

/**
 * Build by delegating to a coding agent running inside the sandbox.
 *
 * The agent writes files itself, so afterwards we read the workdir back out to
 * persist them — that is what makes the build resumable without re-running
 * (and re-paying for) the agent.
 */
export const runAgentBuild = async (params: {
  userId: string;
  threadId: string;
  prompt: string;
  buildId?: string;
  toolCallId?: string;
  /** Which coding agent to run. Defaults to OpenCode (needs no API key). */
  agent?: string;
  model?: string;
  onProgress?: (stage: string, detail?: string) => void;
}): Promise<AgentBuildResult> => {
  const buildId = params.buildId ?? `build_${randomUUID()}`;
  const progress = (stage: string, detail?: string) => {
    params.onProgress?.(stage, detail);
    publishBuildEvent(buildId, {
      type: "stage",
      stage,
      detail,
      at: Date.now(),
    });
  };
  const agent = getAgent(params.agent);
  if (!isAgentAvailable(agent)) {
    throw new Error(
      `${agent.label} needs ${agent.requiredEnv} to be configured on this deployment.`,
    );
  }
  // Client-supplied model id: enforce a strict identifier shape before it can
  // reach a shell command line (defense-in-depth on top of shell quoting).
  if (
    params.model !== undefined &&
    !/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,79}$/.test(params.model)
  ) {
    throw new Error("Invalid model id.");
  }
  const model = params.model || agent.defaultModel;

  await buildJobRepository.create(
    {
      id: buildId,
      threadId: params.threadId,
      prompt: params.prompt,
      toolCallId: params.toolCallId ?? null,
      framework: "agent",
    },
    params.userId,
  );

  let sandboxId: string | null = null;
  try {
    progress("provisioning", "Starting agent sandbox");
    await buildJobRepository.setStatusUnscoped(buildId, { status: "planning" });

    const { sandbox, lease } = await createBuildSandbox({
      buildId,
      userId: params.userId,
      template: agent.template,
      leaseMs: 15 * 60_000, // agents take longer than a file dump
      envs: agentEnvs(agent, model),
    });
    sandboxId = lease.sandboxId;
    await buildJobRepository.setStatusUnscoped(buildId, {
      sandboxId: lease.sandboxId,
      sandboxExpiresAt: lease.expiresAt,
    });

    await runCommand(sandbox, `mkdir -p ${APP_DIR}`);

    progress("generating", "Agent is working");
    await buildJobRepository.setStatusUnscoped(buildId, {
      status: "generating",
    });

    const task = [
      params.prompt,
      "",
      "Build this in the current directory. Node.js and npm are available.",
      "Choose the simplest stack that actually satisfies the request:",
      "  - Static site: emit index.html as the entry point, no package.json.",
      '  - Full-stack: emit a package.json whose "dev" script starts a server',
      "    LISTENING ON 0.0.0.0 PORT 3000 (not localhost, not another port),",
      "    and install what you need with npm.",
      "Use SQLite or a JSON file if you need persistence; no external database",
      "is reachable from this sandbox.",
    ].join("\n");

    let agentLog = "";
    const agentRun = await runCommand(
      sandbox,
      `cd ${APP_DIR} && ${agent.command(task, model)}`,
      {
        timeoutMs: 10 * 60_000,
        onOutput: (chunk) => {
          agentLog += chunk;
          // Raw agent output is the live "code streaming" for agent mode —
          // the agent narrates and writes files as it goes.
          publishBuildEvent(buildId, { type: "output", chunk, at: Date.now() });
        },
      },
    );
    agentLog += agentRun.stdout + agentRun.stderr;

    progress("collecting", "Reading files the agent wrote");
    const listing = await runCommand(
      sandbox,
      `cd ${APP_DIR} && find . -type f -not -path './.git/*' -size -256k | head -40`,
    );
    const paths = listing.stdout
      .split("\n")
      .map((l) => l.trim().replace(/^\.\//, ""))
      .filter(Boolean);

    if (paths.length === 0) {
      throw new Error("The agent finished without creating any files.");
    }

    const files: { path: string; content: string }[] = [];
    for (const rel of paths) {
      try {
        const content = await sandbox.files.read(`${APP_DIR}/${rel}`);
        files.push({ path: rel, content: String(content) });
        publishBuildEvent(buildId, { type: "file", path: rel, at: Date.now() });
      } catch {
        // Unreadable (binary/oversized) — skip rather than fail the build.
      }
    }

    await buildJobRepository.setStatusUnscoped(buildId, {
      status: "running",
      files,
    });
    await startPreviewServer(sandbox, {
      hasPackageJson: files.some((f) => f.path === "package.json"),
      buildId,
      emit: progress,
    });

    const previewUrl = getPreviewUrl(sandbox, 3000);
    const title = params.prompt.slice(0, 60);
    const summary = `Built by ${agent.label}${model ? ` (${model})` : ""} — ${files.length} file(s).`;
    await buildJobRepository.setStatusUnscoped(buildId, {
      status: "ready",
      previewUrl,
      title,
      summary,
    });
    progress("ready", previewUrl);
    publishBuildEvent(buildId, {
      type: "done",
      status: "ready",
      previewUrl,
      at: Date.now(),
    });

    logger.info(
      `[build/agent] ${buildId} ready sandbox=${lease.sandboxId} files=${files.length}`,
    );
    return {
      buildId,
      previewUrl,
      sandboxId: lease.sandboxId,
      expiresAt: lease.expiresAt,
      title,
      summary,
      files,
      agentLog: agentLog.slice(-4000),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (sandboxId) {
      await killSandbox(sandboxId);
      await buildJobRepository.releaseSandbox(buildId);
    }
    await buildJobRepository.setStatusUnscoped(buildId, {
      status: "failed",
      error: message,
    });
    publishBuildEvent(buildId, {
      type: "done",
      status: "failed",
      error: message,
      at: Date.now(),
    });
    logger.error(`[build/agent] ${buildId} failed: ${message}`);
    throw err;
  }
};

// ---------------------------------------------------------------------------
// VibeSDK-backed build
// ---------------------------------------------------------------------------
// Same build_job lifecycle as the E2B paths, so the UI, list, resume and delete
// all work unchanged. The difference is who owns the runtime: here Cloudflare
// generates, builds and deploys, and we store the resulting preview URL and
// files. There is no sandbox of ours to lease or reap, so `sandboxId` stays
// null and `previewUrl` points at Cloudflare's deployment.
// ---------------------------------------------------------------------------
export const runVibeSdkBuild = async (params: {
  userId: string;
  threadId: string;
  prompt: string;
  buildId?: string;
  toolCallId?: string;
  behavior?: VibeBehavior;
  onProgress?: (stage: string, detail?: string) => void;
}): Promise<ProvisionResult> => {
  const buildId = params.buildId ?? `build_${randomUUID()}`;
  const progress = params.onProgress ?? (() => {});

  await buildJobRepository.create(
    {
      id: buildId,
      threadId: params.threadId,
      prompt: params.prompt,
      toolCallId: params.toolCallId ?? null,
      framework: "vibesdk",
    },
    params.userId,
  );

  try {
    await buildJobRepository.setStatusUnscoped(buildId, { status: "planning" });
    const result = await buildWithVibeSdk({
      prompt: params.prompt,
      behavior: params.behavior,
      onProgress: progress,
    });

    if (!result.previewUrl) {
      throw new Error("VibeSDK finished without returning a preview URL.");
    }

    const title = params.prompt.slice(0, 60);
    const summary = `Built on Cloudflare VibeSDK — ${result.files.length} file(s).`;
    await buildJobRepository.setStatusUnscoped(buildId, {
      status: "ready",
      previewUrl: result.previewUrl,
      files: result.files,
      title,
      summary,
      // Cloudflare owns the runtime; reuse sandboxId to store the agent id so
      // resume can reconnect to the same app.
      sandboxId: result.agentId || null,
    });
    progress("ready", result.previewUrl);

    logger.info(`[build/vibesdk] ${buildId} ready agent=${result.agentId}`);
    return {
      buildId,
      previewUrl: result.previewUrl,
      sandboxId: result.agentId,
      expiresAt: new Date(Date.now() + SANDBOX_LEASE_MS),
      title,
      summary,
      files: result.files,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await buildJobRepository.setStatusUnscoped(buildId, {
      status: "failed",
      error: message,
    });
    logger.error(`[build/vibesdk] ${buildId} failed: ${message}`);
    throw err;
  }
};

/**
 * Bring a previously-built app back up.
 *
 * Tries to reconnect to the original sandbox first (cheap, preserves state).
 * If it is gone, replays the stored files into a fresh sandbox rather than
 * re-running the LLM — same output, no generation cost.
 */
export const resumeBuild = async (
  job: BuildJobEntity,
): Promise<{
  previewUrl: string;
  sandboxId: string;
  expiresAt: Date;
  reused: boolean;
}> => {
  if (job.sandboxId) {
    const existing = await reconnectSandbox(job.sandboxId);
    if (existing) {
      const previewUrl = getPreviewUrl(existing, 3000);
      const expiresAt = new Date(Date.now() + SANDBOX_LEASE_MS);
      await buildJobRepository.setStatusUnscoped(job.id, {
        status: "ready",
        previewUrl,
        sandboxExpiresAt: expiresAt,
      });
      return {
        previewUrl,
        sandboxId: existing.sandboxId,
        expiresAt,
        reused: true,
      };
    }
  }

  const stored = (job.files ?? []) as { path: string; content: string }[];
  if (stored.length === 0) {
    throw new Error("This build has no stored files and its sandbox is gone.");
  }

  const { sandbox, lease } = await createBuildSandbox({
    buildId: job.id,
    userId: job.userId,
  });
  await buildJobRepository.setStatusUnscoped(job.id, {
    sandboxId: lease.sandboxId,
    sandboxExpiresAt: lease.expiresAt,
  });
  await writeFiles(
    sandbox,
    stored.flatMap((f) => {
      const sandboxPath = toSandboxPath(f.path);
      return sandboxPath ? [{ path: sandboxPath, content: f.content }] : [];
    }),
  );
  await startPreviewServer(sandbox, {
    hasPackageJson: stored.some((f) => f.path === "package.json"),
    buildId: job.id,
    emit: () => {},
  });
  const previewUrl = getPreviewUrl(sandbox, 3000);
  await buildJobRepository.setStatusUnscoped(job.id, {
    status: "ready",
    previewUrl,
  });
  return {
    previewUrl,
    sandboxId: lease.sandboxId,
    expiresAt: lease.expiresAt,
    reused: false,
  };
};

/** Kill the sandbox for a build and clear its handle. */
export const teardownBuild = async (job: BuildJobEntity): Promise<void> => {
  if (job.sandboxId) await killSandbox(job.sandboxId);
  await buildJobRepository.releaseSandbox(job.id);
};

export interface ReapResult {
  expiredKilled: number;
  orphansKilled: number;
}

/**
 * Cleanup pass, run from the worker tick.
 *
 * Three classes of waste, in order of how much they cost:
 *   1. expired  — a build row whose lease has passed. Running, therefore
 *                 billing. Killed first.
 *   2. running orphans — tagged as ours but no build row references them.
 *                 Nothing in the product knows they exist, so they would bill
 *                 until E2B's own 24h cap.
 *   3. paused orphans — free, but E2B never reclaims paused sandboxes on its
 *                 own, so they accumulate indefinitely. Swept once they are
 *                 older than ORPHAN_MAX_AGE_MS.
 *
 * Only sandboxes carrying our own metadata are ever killed. Anything without
 * a `buildId` we recognise is left alone — the account may be shared, and
 * killing someone else's sandbox is far worse than leaving one paused.
 *
 * (Metadata round-trips reliably: verified against running, paused, and
 * template-created sandboxes — `Sandbox.list()` returns it and filtering on
 * it works in all three cases.)
 */
const ORPHAN_MAX_AGE_MS =
  Number.parseInt(process.env.E2B_ORPHAN_MAX_AGE_MS || "", 10) ||
  24 * 60 * 60_000;

export const reapSandboxes = async (): Promise<ReapResult> => {
  const result: ReapResult = { expiredKilled: 0, orphansKilled: 0 };

  // 1. Leases we know have expired.
  const expired = await buildJobRepository.findReclaimable();
  for (const job of expired) {
    if (!job.sandboxId) continue;
    await killSandbox(job.sandboxId);
    await buildJobRepository.releaseSandbox(job.id);
    result.expiredKilled += 1;
  }

  // 2 + 3. Sandboxes tagged as ours that the DB no longer knows about.
  const owned = await listOwnedSandboxes(["running", "paused"]).catch(() => []);
  const now = Date.now();
  for (const sbx of owned as {
    sandboxId: string;
    state?: string;
    startedAt?: string | Date;
    metadata?: Record<string, string>;
  }[]) {
    const feature = sbx.metadata?.feature;

    // Conversation sandboxes (the general-purpose agent tool) have no build
    // row to reconcile against. They auto-pause when idle, which is free, but
    // E2B never reclaims a paused sandbox — so retire them past the orphan age.
    if (feature === "tool") {
      const started = sbx.startedAt ? new Date(sbx.startedAt).getTime() : 0;
      if (started && now - started > ORPHAN_MAX_AGE_MS) {
        await killSandbox(sbx.sandboxId);
        result.orphansKilled += 1;
      }
      continue;
    }

    const buildId = sbx.metadata?.buildId;
    // Not ours to judge — leave it alone.
    if (!buildId) continue;
    if (await buildJobRepository.existsUnscoped(buildId)) continue;

    // Running orphans bill, so go immediately. Paused ones are free — give
    // them a grace period so a sandbox mid-handoff isn't destroyed.
    if (sbx.state === "paused") {
      const started = sbx.startedAt ? new Date(sbx.startedAt).getTime() : 0;
      if (started && now - started < ORPHAN_MAX_AGE_MS) continue;
    }
    await killSandbox(sbx.sandboxId);
    result.orphansKilled += 1;
  }

  if (result.expiredKilled || result.orphansKilled) {
    logger.info(
      `[build/reap] expired=${result.expiredKilled} orphans=${result.orphansKilled}`,
    );
  }
  return result;
};
