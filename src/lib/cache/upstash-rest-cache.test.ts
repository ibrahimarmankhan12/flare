import { beforeEach, describe, expect, it, vi } from "vitest";

import { UpstashRestCache } from "./upstash-rest-cache";

describe("UpstashRestCache", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("sends commands using path-style Upstash REST URLs", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ result: '{"ok":true}' }),
    } as unknown as Response);

    const cache = new UpstashRestCache({
      restUrl: "https://example.upstash.io",
      restToken: "token",
    });

    const value = await cache.get<{ ok: boolean }>("k1");

    expect(value).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.upstash.io/GET/k1",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("throws when Upstash returns a command error", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ error: "ERR failed to parse command" }),
    } as unknown as Response);

    const cache = new UpstashRestCache({
      restUrl: "https://example.upstash.io",
      restToken: "token",
    });

    await expect(cache.has("k2")).rejects.toThrow("Upstash error");
  });

  it("throws when Upstash returns a non-OK status", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      json: async () => ({}),
    } as unknown as Response);

    const cache = new UpstashRestCache({
      restUrl: "https://example.upstash.io",
      restToken: "token",
    });

    await expect(cache.get("k3")).rejects.toThrow("Upstash command failed");
  });
});
