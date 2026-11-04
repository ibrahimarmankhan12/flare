//@vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupMock = vi.fn();

vi.mock("node:dns/promises", () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}));

import { UrlBlockedError, assertPublicWebhookUrl } from "./url-guard";

describe("assertPublicWebhookUrl", () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it("accepts an https URL resolving to a public address", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const url = await assertPublicWebhookUrl("https://hooks.example.com/x");
    expect(url.hostname).toBe("hooks.example.com");
  });

  it("rejects non-https schemes", async () => {
    await expect(
      assertPublicWebhookUrl("http://hooks.example.com/x"),
    ).rejects.toThrow(/https/i);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects URLs with embedded credentials", async () => {
    await expect(
      assertPublicWebhookUrl("https://user:pass@hooks.example.com/x"),
    ).rejects.toThrow(/credentials/i);
  });

  it("rejects hosts that fail to resolve", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(
      assertPublicWebhookUrl("https://nope.example.com/x"),
    ).rejects.toThrow(/resolve/i);
  });

  it("rejects loopback IPv4", async () => {
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await expect(
      assertPublicWebhookUrl("https://internal.example.com/hook"),
    ).rejects.toThrow(UrlBlockedError);
  });

  it("rejects RFC1918 ranges", async () => {
    for (const addr of ["10.0.0.5", "192.168.1.10", "172.16.0.9"]) {
      lookupMock.mockResolvedValue([{ address: addr, family: 4 }]);
      await expect(
        assertPublicWebhookUrl("https://internal.example.com/hook"),
      ).rejects.toThrow(/non-public/i);
    }
  });

  it("rejects the cloud metadata range (169.254.169.254)", async () => {
    lookupMock.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    await expect(
      assertPublicWebhookUrl("https://metadata.example.com/latest"),
    ).rejects.toThrow(/non-public/i);
  });

  it("rejects IPv6 loopback and unique-local addresses", async () => {
    for (const addr of ["::1", "fd00::1", "fe80::1"]) {
      lookupMock.mockResolvedValue([{ address: addr, family: 6 }]);
      await expect(
        assertPublicWebhookUrl("https://v6.example.com/hook"),
      ).rejects.toThrow(/non-public/i);
    }
  });

  it("rejects IPv4-mapped IPv6 pointing at private space", async () => {
    lookupMock.mockResolvedValue([{ address: "::ffff:10.0.0.1", family: 6 }]);
    await expect(
      assertPublicWebhookUrl("https://mapped.example.com/hook"),
    ).rejects.toThrow(/non-public/i);
  });

  it("rejects when ANY resolved address is private", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.9.9.9", family: 4 },
    ]);
    await expect(
      assertPublicWebhookUrl("https://mixed.example.com/hook"),
    ).rejects.toThrow(/non-public/i);
  });
});
