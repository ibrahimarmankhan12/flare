import { chromium } from "playwright";
const BASE = "https://flare-sh.tech";
const EMAIL = "dbgtest@flare-sh.tech";
const PASSWORD = "Test12345!!";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("response", (r) => {
  if (r.url().includes("/api/") && r.status() >= 400)
    console.log("[HTTP]", r.status(), r.url().slice(0, 120));
});

await page.goto(BASE + "/sign-in", {
  waitUntil: "networkidle",
  timeout: 60000,
});
await page.getByPlaceholder("Email address").fill(EMAIL);
await page.getByPlaceholder("Password").fill(PASSWORD);
await page.getByRole("button", { name: /Welcome Back/i }).click();
await page.waitForURL(/dashboard/, { timeout: 30000 });
console.log("1. signed in");

// Select deepseek/v3.2 explicitly
const modelBtn = page
  .locator("button", { hasText: /gemma|deepseek|auto/i })
  .first();
if (await modelBtn.count()) {
  await modelBtn.click();
  await page.waitForTimeout(800);
  const opt = page.getByText("deepseek/v3.2", { exact: false }).first();
  if (await opt.count()) {
    await opt.click();
    console.log("2. selected deepseek/v3.2");
  } else await page.keyboard.press("Escape");
}

// Send message asking for slides
const editor = page.locator('div[contenteditable="true"]').first();
await editor.click();
await editor.type(
  "Create a short slide presentation about AI Vision using ecanvas",
);
await page.keyboard.press("Enter");
console.log("3. message sent, waiting for tool execution...");

let leaked = false,
  canvasCard = false;
for (let i = 0; i < 24; i++) {
  await page.waitForTimeout(5000);
  const t = await page.locator("body").innerText();
  if (/DSML/.test(t)) {
    leaked = true;
    break;
  }
  if (/Open Canvas|canvasId|Content ready/i.test(t)) {
    canvasCard = true;
  }
  if (canvasCard && /Perfect|created|ready|presentation/i.test(t)) {
    // wait a bit more for stream end
    await page.waitForTimeout(6000);
    break;
  }
}
console.log("4. DSML leak:", leaked, "| canvas card seen:", canvasCard);

const bodyText = await page.locator("body").innerText();
console.log("5. TAIL:", JSON.stringify(bodyText.slice(-350)));

// If canvas URL present, open it and check preview content
const m = bodyText.match(/\/ecanvas\/([0-9a-f-]{36})/);
if (m) {
  console.log("6. opening /ecanvas/" + m[1]);
  await page.goto(`${BASE}/ecanvas/${m[1]}`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForTimeout(4000);
  const t2 = await page.locator("body").innerText();
  console.log(
    "7. preview has content:",
    !/No canvas slide content is available/.test(t2),
  );
  console.log(
    "8. preview snippet:",
    JSON.stringify(t2.replace(/\s+/g, " ").slice(0, 250)),
  );
}
await browser.close();
