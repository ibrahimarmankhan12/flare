import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import logger from "logger";
import { buildJobRepository } from "lib/db/repository";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { isE2BConfigured } from "lib/sandbox/client";
import { runAgentBuild, runBuild, runVibeSdkBuild } from "lib/sandbox/runner";
import { isVibeSdkConfigured } from "lib/sandbox/vibesdk";
import { randomUUID } from "node:crypto";
import { z } from "zod";

// ---------------------------------------------------------------------------
// /api/build — E2B AI app builder
// ---------------------------------------------------------------------------
//   GET   list the caller's builds
//   POST  generate an app and provision a live preview sandbox
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const createSchema = z.object({
  prompt: z.string().min(1, "prompt is required").max(4000),
  threadId: z.string().uuid("threadId must be a uuid"),
  /**
   * "agent" delegates to a coding agent running inside the sandbox (slower,
   * can iterate and use a terminal). "static" is a single LLM pass that emits
   * files (faster, cheaper). Default stays "static" so the common case is not
   * silently made slower.
   */
  mode: z.enum(["static", "agent", "vibesdk"]).default("static"),
  /** Which coding agent to use when mode === "agent". */
  agent: z.string().max(40).optional(),
  /** Optional model id for agents that accept one. */
  agentModel: z.string().max(80).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  try {
    const builds = await buildJobRepository.listByUser(session.user.id);
    // `files` can be large; the list view only needs metadata.
    return Response.json({
      builds: builds.map(({ files: _files, ...rest }) => rest),
    });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Provider availability differs per mode, so check the one actually asked for.
  if (parsed.data.mode === "vibesdk") {
    if (!isVibeSdkConfigured()) {
      return Response.json(
        {
          error: "vibesdk-unavailable",
          message: "VIBESDK_API_KEY is not configured on this deployment.",
        },
        { status: 503 },
      );
    }
  } else if (!isE2BConfigured()) {
    return Response.json(
      {
        error: "build-unavailable",
        message: "E2B_API_KEY is not configured on this deployment.",
      },
      { status: 503 },
    );
  }

  // Admission control: each build spawns a billable sandbox (and in agent
  // mode runs npm install + coding CLIs for up to ~10 min). Without caps a
  // single free account can exhaust the E2B org budget.
  try {
    const rpm = await checkApiRateLimit({
      kind: "chat-user",
      id: session.user.id,
      limit: 6,
      windowMs: 60_000,
    });
    if (!rpm.allowed) {
      return Response.json(
        {
          error: "rate-limited",
          message: "Too many builds. Try again shortly.",
        },
        { status: 429 },
      );
    }
  } catch (err) {
    logger.warn("[build] rate limit check failed", err);
  }
  const MAX_ACTIVE_BUILDS_PER_USER = Number(
    process.env.MAX_ACTIVE_BUILDS_PER_USER || 3,
  );
  const activeStatuses = new Set(["planning", "generating", "running"]);
  const recent = await buildJobRepository.listByUser(session.user.id, 20);
  const active = recent.filter((b) => activeStatuses.has(b.status)).length;
  if (active >= MAX_ACTIVE_BUILDS_PER_USER) {
    return Response.json(
      {
        error: "too-many-active-builds",
        message: `You already have ${active} builds running. Wait for one to finish.`,
      },
      { status: 429 },
    );
  }

  const run =
    parsed.data.mode === "vibesdk"
      ? runVibeSdkBuild
      : parsed.data.mode === "agent"
        ? runAgentBuild
        : runBuild;

  // Builds routinely run past 100s (measured: 129s, 130s, once 1989s), and
  // Cloudflare terminates the connection at ~100s with a 524 — the work kept
  // succeeding on the server while the browser saw a failed request. So the
  // row is created up-front, the build is started detached, and the client
  // polls GET /api/build/:id (which the detail page already does).
  const buildId = `build_${randomUUID()}`;
  try {
    await buildJobRepository.create(
      {
        id: buildId,
        threadId: parsed.data.threadId,
        prompt: parsed.data.prompt,
        framework: parsed.data.mode,
      },
      session.user.id,
    );
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }

  void run({
    userId: session.user.id,
    threadId: parsed.data.threadId,
    prompt: parsed.data.prompt,
    buildId,
    ...(parsed.data.mode === "agent"
      ? { agent: parsed.data.agent, model: parsed.data.agentModel }
      : {}),
  }).catch(() => {
    // The runner already records the failure on the build row; swallowing
    // here only stops an unhandled rejection from taking down the process.
  });

  return Response.json(
    { buildId, status: "queued", mode: parsed.data.mode },
    { status: 202 },
  );
}
