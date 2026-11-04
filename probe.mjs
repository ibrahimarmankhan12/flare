import { chromium } from "playwright";
const url = process.argv[2] || "https://flare-sh.tech/";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
});
page.on("requestfailed", (r) =>
  errors.push(`requestfailed: ${r.url()} -- ${r.failure()?.errorText}`),
);
try {
  const resp = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 25000,
  });
  console.log("HTTP", resp?.status());
  await page.waitForTimeout(2000);
  const triggerCount = await page
    .locator('[data-testid="model-selector-button"]')
    .count();
  console.log("model-selector-button count:", triggerCount);
  if (triggerCount > 0) {
    await page.locator('[data-testid="model-selector-button"]').first().click();
    await page.waitForTimeout(800);
    const popover = await page
      .locator('[data-testid="model-selector-popover"]')
      .count();
    console.log("popover count:", popover);
    if (popover > 0) {
      const zapCount = await page
        .locator('[data-testid="model-selector-popover"] svg.lucide-zap')
        .count();
      const brainCount = await page
        .locator('[data-testid="model-selector-popover"] svg.lucide-brain')
        .count();
      console.log("lucide-zap:", zapCount, "lucide-brain:", brainCount);
      const allSvgs = await page
        .locator('[data-testid="model-selector-popover"] svg')
        .evaluateAll((els) =>
          els.slice(0, 30).map((el) => el.getAttribute("class")),
        );
      console.log("all svg classes in popover:", JSON.stringify(allSvgs));
      const sections = await page
        .locator('[data-testid^="model-provider-"]')
        .evaluateAll((els) =>
          els.map((el) => ({
            provider: el.getAttribute("data-testid"),
            heading: el.querySelector("div")?.textContent?.slice(0, 60),
          })),
        );
      console.log("provider sections:");
      for (const s of sections) console.log("  ", JSON.stringify(s));
    }
  }
} catch (e) {
  console.error("caught:", e.message);
}
if (errors.length) {
  console.log("errors:");
  for (const e of errors) console.log("  ", e);
}
await browser.close();
