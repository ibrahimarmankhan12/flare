import "server-only";

// ---------------------------------------------------------------------------
// In-process event bus for live build streaming.
// ---------------------------------------------------------------------------
// Builds run detached inside this Node process, so a plain in-memory bus is
// enough to get their progress to a connected browser over SSE.
//
// Each build keeps a bounded replay buffer. A client that connects a second
// after the build started — or reconnects after a dropped connection — gets
// the history first and then live events, instead of joining mid-stream and
// seeing nothing until the next chunk.
//
// LIMITATION: single-process only. If Flare is ever run as multiple instances
// behind a load balancer, a client could connect to an instance that is not
// running its build and would see no events. Moving to Redis pub/sub (the
// `REDIS_URL` slot already exists) is the fix at that point.
// ---------------------------------------------------------------------------

export type BuildEvent =
  | { type: "stage"; stage: string; detail?: string; at: number }
  | { type: "output"; chunk: string; at: number }
  | { type: "file"; path: string; at: number }
  | {
      type: "done";
      status: "ready" | "failed";
      previewUrl?: string;
      error?: string;
      at: number;
    };

type Listener = (event: BuildEvent) => void;

const MAX_BUFFER = 400;
/** Keep finished builds around briefly so a late viewer still sees the tail. */
const RETAIN_AFTER_DONE_MS = 5 * 60_000;

interface Channel {
  buffer: BuildEvent[];
  listeners: Set<Listener>;
  doneAt?: number;
}

const channels = new Map<string, Channel>();

const channel = (buildId: string): Channel => {
  let c = channels.get(buildId);
  if (!c) {
    c = { buffer: [], listeners: new Set() };
    channels.set(buildId, c);
  }
  return c;
};

/** Drop channels whose builds finished a while ago. */
const sweep = () => {
  const now = Date.now();
  for (const [id, c] of channels) {
    if (
      c.doneAt &&
      now - c.doneAt > RETAIN_AFTER_DONE_MS &&
      c.listeners.size === 0
    ) {
      channels.delete(id);
    }
  }
};

export const publishBuildEvent = (buildId: string, event: BuildEvent): void => {
  const c = channel(buildId);
  c.buffer.push(event);
  // Bound memory: a chatty agent can emit thousands of chunks.
  if (c.buffer.length > MAX_BUFFER)
    c.buffer.splice(0, c.buffer.length - MAX_BUFFER);
  if (event.type === "done") c.doneAt = Date.now();
  for (const l of c.listeners) {
    try {
      l(event);
    } catch {
      // A broken listener must never break the build.
    }
  }
  sweep();
};

/** Replay buffered events, then receive live ones. Returns an unsubscribe fn. */
export const subscribeToBuild = (
  buildId: string,
  listener: Listener,
): (() => void) => {
  const c = channel(buildId);
  for (const e of c.buffer) {
    try {
      listener(e);
    } catch {
      /* ignore */
    }
  }
  c.listeners.add(listener);
  return () => {
    c.listeners.delete(listener);
  };
};

/** True when this build has already emitted a terminal event. */
export const isBuildFinished = (buildId: string): boolean =>
  Boolean(channels.get(buildId)?.doneAt);
