import "server-only";

import {
  PhasicClient,
  AgenticClient,
  type BuildSession,
} from "@cf-vibesdk/sdk";
import logger from "logger";

// ---------------------------------------------------------------------------
// Cloudflare VibeSDK provider.
// ---------------------------------------------------------------------------
// A second build backend alongside E2B, not a replacement. The two differ in
// kind, which is why both are worth having:
//
//   E2B      — we own the sandbox. We generate the files, run any command, get
//              a raw preview URL. Full control, and the app is ours.
//   VibeSDK  — Cloudflare owns the whole generate-build-deploy pipeline. We
//              hand it a prompt and get back a deployed preview. Less control,
//              much less for us to operate.
//
// This talks to a VibeSDK *instance* over HTTPS — either Cloudflare's hosted
// build.cloudflare.dev or a self-deployed one. We deliberately do NOT vendor
// the VibeSDK platform itself: it is `private: true`, Cloudflare-native
// (Workers + Durable Objects + D1 + R2 + Containers) and requires a Workers
// Paid plan plus a Workers for Platforms subscription to self-host. The
// published `@cf-vibesdk/sdk` client is the supported way in.
// ---------------------------------------------------------------------------

export const VIBESDK_BASE_URL =
  process.env.VIBESDK_BASE_URL || "https://build.cloudflare.dev";

export const isVibeSdkConfigured = (): boolean =>
  Boolean(process.env.VIBESDK_API_KEY?.trim());

const assertConfigured = () => {
  if (!isVibeSdkConfigured()) {
    throw new Error(
      "VIBESDK_API_KEY is not configured — the VibeSDK build provider is unavailable.",
    );
  }
};

/**
 * `phasic` runs phase-based generation (plan then build); `agentic` lets an
 * autonomous agent drive. Mirrors the static/agent split on the E2B side so
 * the two providers present the same choice to the user.
 */
export type VibeBehavior = "phasic" | "agentic";

const makeClient = (behavior: VibeBehavior) => {
  assertConfigured();
  const options = {
    baseUrl: VIBESDK_BASE_URL,
    apiKey: process.env.VIBESDK_API_KEY!,
  };
  return behavior === "agentic"
    ? new AgenticClient(options)
    : new PhasicClient(options);
};

export interface VibeBuildResult {
  agentId: string;
  previewUrl: string | null;
  files: { path: string; content: string }[];
}

/**
 * Build an app on VibeSDK and wait for its preview deployment.
 *
 * The session holds a WebSocket, so it is always closed in `finally` — an
 * abandoned session would otherwise keep a connection open against the
 * VibeSDK instance.
 */
export const buildWithVibeSdk = async (params: {
  prompt: string;
  behavior?: VibeBehavior;
  onProgress?: (stage: string, detail?: string) => void;
}): Promise<VibeBuildResult> => {
  const progress = params.onProgress ?? (() => {});
  const client = makeClient(params.behavior ?? "phasic");

  progress("planning", "Sending prompt to VibeSDK");
  const session: BuildSession = await client.build(params.prompt, {
    onBlueprintChunk: (chunk: string) => progress("blueprint", chunk),
  });

  try {
    const agentId = (session as unknown as { agentId?: string }).agentId ?? "";

    progress("generating", "Waiting for the build to become deployable");
    await session.wait.deployable();

    progress("deploying", "Deploying preview");
    session.deployPreview();
    const deployed = await session.wait.previewDeployed();

    const previewUrl =
      (deployed as unknown as { previewURL?: string }).previewURL ?? null;

    // listPaths() gives names only; contents are read per-file.
    const paths = session.files.listPaths();
    const files: { path: string; content: string }[] = [];
    for (const path of paths.slice(0, 40)) {
      const content = (
        session.files as unknown as {
          get?: (p: string) => { content?: string };
        }
      ).get?.(path)?.content;
      if (typeof content === "string") files.push({ path, content });
    }

    logger.info(
      `[vibesdk] built agent=${agentId} files=${files.length} preview=${previewUrl ?? "none"}`,
    );
    return { agentId, previewUrl, files };
  } finally {
    session.close();
  }
};

/** Reconnect to a previous VibeSDK app by its agent id. */
export const reconnectVibeSdk = async (
  agentId: string,
): Promise<BuildSession | null> => {
  try {
    const client = makeClient("phasic");
    return await client.connect(agentId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[vibesdk] reconnect failed agent=${agentId}: ${message}`);
    return null;
  }
};
