import { describe, expect, it } from "vitest";

import nextConfigFactory from "./next.config";

const resolveConfig = async () => {
  const config =
    typeof nextConfigFactory === "function"
      ? await nextConfigFactory()
      : nextConfigFactory;
  const headers = await config.headers?.();
  return headers ?? [];
};

describe("embed route security headers", () => {
  it("removes X-Frame-Options and opens frame-ancestors only for embed routes", async () => {
    const headers = await resolveConfig();
    const embedPageHeaders = headers.find(
      (entry) => entry.source === "/embed/:path*",
    );
    const embedScriptHeaders = headers.find(
      (entry) => entry.source === "/embed.js",
    );
    const globalHeaders = headers.find(
      (entry) => entry.source === "/((?!embed(?:/|$)|embed\\.js$).*)",
    );

    expect(embedPageHeaders).toBeDefined();
    expect(embedScriptHeaders).toBeDefined();
    expect(globalHeaders).toBeDefined();

    for (const entry of [embedPageHeaders, embedScriptHeaders]) {
      expect(entry?.headers).toContainEqual({
        key: "Content-Security-Policy",
        value: "frame-ancestors *;",
      });
      expect(
        entry?.headers.some((header) => header.key === "X-Frame-Options"),
      ).toBe(false);
      expect(entry?.headers).toContainEqual({
        key: "Permissions-Policy",
        value:
          "camera=(), microphone=(), clipboard-read=(), clipboard-write=(self)",
      });
    }

    expect(globalHeaders?.headers).toContainEqual({
      key: "X-Frame-Options",
      value: "SAMEORIGIN",
    });
    expect(globalHeaders?.headers).toContainEqual({
      key: "Content-Security-Policy",
      value: "frame-ancestors 'self';",
    });
  });
});
