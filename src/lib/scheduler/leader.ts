import "server-only";

import { serverCache } from "lib/cache";

// ---------------------------------------------------------------------------
// P3.1 — #11 scheduled agents. Distributed leader election backed by the
// existing `serverCache` singleton (memory in dev, Redis / Upstash in prod).
//
// The contract is intentionally simple:
//   * acquireLeaderLock: SETNX with TTL. Returns true on success, false on
//     contention. The TTL acts as a crash-recovery safety bound — if the
//     leader dies, the lock auto-expires and another worker takes over.
//   * releaseLeaderLock: read-then-delete. Best-effort; if the lock has
//     already expired and been reassigned to another owner, this is a
//     no-op (we never delete someone else's lock). A race that drops the
//     lock during release is harmless — the new owner will re-set it.
// ---------------------------------------------------------------------------

export const acquireLeaderLock = async (
  key: string,
  ttlMs: number,
  owner: string,
): Promise<boolean> => {
  return serverCache.setNX(key, owner, ttlMs);
};

export const releaseLeaderLock = async (
  key: string,
  owner: string,
): Promise<void> => {
  const current = await serverCache.get<string>(key);
  if (current === owner) {
    await serverCache.delete(key);
  }
};
