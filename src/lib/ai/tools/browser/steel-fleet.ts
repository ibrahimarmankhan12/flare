import "server-only";
import { serverCache } from "lib/cache";

// Self-hosted Steel browser fleet (Flare Labs). Containers steel-0..steel-(N-1)
// each publish their API on STEEL_BASE_PORT + index. Playwright connects to a
// session's websocketUrl (the API proxies CDP internally); the live view is the
// session's sessionViewerUrl. See /home/flare/labs/steel-browser.

export const STEEL_HOST = process.env.STEEL_HOST || "localhost";
export const STEEL_BASE_PORT = Number(process.env.STEEL_BASE_PORT || 3300);
export const STEEL_FLEET_SIZE = Number(process.env.STEEL_FLEET_SIZE || 100);

const RR_KEY = "steel:fleet:rr";
const allocKey = (threadKey: string) => `steel:fleet:alloc:${threadKey}`;

export const steelBaseUrl = (index: number) =>
  `http://${STEEL_HOST}:${STEEL_BASE_PORT + index}`;

const isContainerHealthy = async (index: number): Promise<boolean> => {
  try {
    const res = await fetch(`${steelBaseUrl(index)}/v1/sessions`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
};

// Sticky per-thread allocation with round-robin fallback so each chat thread
// keeps hitting the same container (session continuity) while load spreads
// across the fleet.
export const allocateContainer = async (threadKey: string): Promise<number> => {
  const cached = await serverCache.get<number>(allocKey(threadKey));
  if (
    typeof cached === "number" &&
    cached >= 0 &&
    cached < STEEL_FLEET_SIZE &&
    (await isContainerHealthy(cached))
  ) {
    return cached;
  }

  // Round-robin, probing for a healthy container.
  const start = ((await serverCache.get<number>(RR_KEY)) ?? -1) + 1;
  for (let offset = 0; offset < STEEL_FLEET_SIZE; offset++) {
    const index = (start + offset) % STEEL_FLEET_SIZE;
    if (await isContainerHealthy(index)) {
      await serverCache.set(RR_KEY, index, 60 * 60 * 1000);
      await serverCache.set(allocKey(threadKey), index, 60 * 60 * 1000);
      return index;
    }
  }
  throw new Error("No healthy Steel browser container is available.");
};

export const releaseContainerAlloc = async (threadKey: string) => {
  await serverCache.delete(allocKey(threadKey));
};

export type SteelSession = {
  id: string;
  websocketUrl: string;
  sessionViewerUrl: string;
  debuggerUrl?: string;
};

export const createSteelSession = async (
  index: number,
): Promise<SteelSession> => {
  const res = await fetch(`${steelBaseUrl(index)}/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(
      `Steel session create failed (${res.status}) on steel-${index}.`,
    );
  }
  const data = (await res.json()) as SteelSession;
  if (!data?.websocketUrl) {
    throw new Error("Steel session response missing websocketUrl.");
  }
  return data;
};

export const releaseSteelSession = async (index: number, sessionId: string) => {
  try {
    await fetch(
      `${steelBaseUrl(index)}/v1/sessions/${encodeURIComponent(sessionId)}/release`,
      { method: "POST", signal: AbortSignal.timeout(8000) },
    );
  } catch {
    // best-effort release; the container is reusable regardless
  }
};
