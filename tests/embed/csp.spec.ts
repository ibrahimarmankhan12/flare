import { expect, test } from "@playwright/test";

test.describe("embed CSP", () => {
  test("embed page can be framed by external hosts", async ({ request }) => {
    const response = await request.get("/embed/e2e-agent-id?token=test-token");
    const headers = response.headers();

    expect(headers["content-security-policy"]).toContain("frame-ancestors *");
    expect(headers["x-frame-options"]).toBeUndefined();
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["permissions-policy"]).toContain("microphone=()");
  });

  test("embed script can be loaded without frame-blocking headers", async ({
    request,
  }) => {
    const response = await request.get("/embed.js");
    const headers = response.headers();

    expect(response.ok()).toBeTruthy();
    expect(headers["content-type"]).toContain("application/javascript");
    expect(headers["content-security-policy"]).toContain("frame-ancestors *");
    expect(headers["x-frame-options"]).toBeUndefined();
  });

  test("global app routes keep frame protection", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();

    expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(headers["content-security-policy"]).toContain(
      "frame-ancestors 'self'",
    );
  });
});
