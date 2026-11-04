import { expect, test } from "@playwright/test";

const EMBED_AGENT_ID = process.env.E2E_EMBED_AGENT_ID || "e2e-agent-id";

test.describe("embed widget", () => {
  test("embed.js injects an iframe from a third-party host page", async ({
    page,
  }) => {
    await page.route("**/api/embed/session", async (route) => {
      const request = route.request();
      expect(request.method()).toBe("POST");
      const body = JSON.parse(request.postData() || "{}");
      expect(body).toEqual({ agentId: EMBED_AGENT_ID });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          token: "test-token",
          iframeUrl: `/embed/${EMBED_AGENT_ID}?token=test-token`,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        }),
      });
    });

    await page.setContent(`
      <!doctype html>
      <html>
        <body>
          <div id="target"></div>
          <script
            src="/embed.js"
            data-agent="${EMBED_AGENT_ID}"
            data-container="#target"
            data-width="420px"
            data-height="520px"
            data-title="Support chat"
          ></script>
        </body>
      </html>
    `);

    const frame = page.locator('iframe[data-flare-embed="e2e-agent-id"]');
    await expect(frame).toHaveAttribute(
      "src",
      `/embed/${EMBED_AGENT_ID}?token=test-token`,
    );
    await expect(frame).toHaveAttribute("title", "Support chat");
    await expect(frame).toHaveCSS("width", "420px");
    await expect(frame).toHaveCSS("height", "520px");
  });

  test("embed.js removes the iframe when session creation fails", async ({
    page,
  }) => {
    await page.route("**/api/embed/session", async (route) => {
      await route.fulfill({ status: 404, body: "missing" });
    });

    await page.setContent(`
      <script src="/embed.js" data-agent="missing-agent"></script>
    `);

    await expect(page.locator("iframe[data-flare-embed]")).toHaveCount(0);
  });
});
