import { randomUUID } from "node:crypto";
import { serverCache } from "lib/cache";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireLeaderLock, releaseLeaderLock } from "./leader";

vi.mock("server-only", () => ({}));

let testKey: string;

const makeKey = () => `test-leader-${randomUUID()}`;

const clearKey = async (key: string) => {
  await serverCache.delete(key);
};

afterEach(async () => {
  if (testKey) await clearKey(testKey);
});

describe("acquireLeaderLock / releaseLeaderLock", () => {
  it("returns true on first call and stores the owner", async () => {
    testKey = makeKey();
    const acquired = await acquireLeaderLock(testKey, 60_000, "owner-A");
    expect(acquired).toBe(true);
    const stored = await serverCache.get<string>(testKey);
    expect(stored).toBe("owner-A");
  });

  it("second concurrent call with a different owner returns false", async () => {
    testKey = makeKey();
    const first = await acquireLeaderLock(testKey, 60_000, "owner-A");
    const second = await acquireLeaderLock(testKey, 60_000, "owner-B");
    expect(first).toBe(true);
    expect(second).toBe(false);
    // Owner A is still the holder.
    const stored = await serverCache.get<string>(testKey);
    expect(stored).toBe("owner-A");
  });

  it("after ttl expires, a new caller can acquire the lock", async () => {
    testKey = makeKey();
    const first = await acquireLeaderLock(testKey, 50, "owner-A");
    expect(first).toBe(true);
    // Wait past the ttl — the in-process MemoryCache uses absolute
    // time-based expiry, so a 100ms wait is safely past the 50ms ttl.
    await new Promise((resolve) => setTimeout(resolve, 120));
    const second = await acquireLeaderLock(testKey, 60_000, "owner-B");
    expect(second).toBe(true);
    const stored = await serverCache.get<string>(testKey);
    expect(stored).toBe("owner-B");
  });

  it("release with matching owner clears the lock; release with non-matching owner is a no-op", async () => {
    testKey = makeKey();
    await acquireLeaderLock(testKey, 60_000, "owner-A");

    // Non-matching owner release is a no-op.
    await releaseLeaderLock(testKey, "owner-B");
    expect(await serverCache.has(testKey)).toBe(true);

    // Matching owner release clears the lock.
    await releaseLeaderLock(testKey, "owner-A");
    expect(await serverCache.has(testKey)).toBe(false);

    // And the lock is now free for a new owner.
    const reacquired = await acquireLeaderLock(testKey, 60_000, "owner-C");
    expect(reacquired).toBe(true);
  });
});
