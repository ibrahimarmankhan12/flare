import { chromium } from "playwright";

const BASE = "http://localhost:3003";

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture console messages
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("Browser error:", msg.text());
  });

  console.log("1. Loading sign-in page...");
  const response = await page.goto(`${BASE}/sign-in`);
  console.log("Response status:", response?.status());
  await page.waitForLoadState("networkidle");

  // Check if there's an error message on the page
  const errorEl =
    (await page.$('[class*="error"]')) || (await page.$('[class*="Error"]'));
  if (errorEl) {
    console.log("Error element found:", await errorEl.textContent());
  }

  // Credentials come from the environment — never commit real credentials.
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error(
      "Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to run this check.",
    );
    process.exit(1);
  }

  // Try the sign-in
  console.log("2. Filling credentials...");
  await page.fill('input[placeholder="Email address"]', email);
  await page.fill('input[placeholder="Password"]', password);

  // Wait a bit before submitting
  await page.waitForTimeout(500);

  console.log("3. Submitting form...");
  await page.click('button[type="submit"]');

  // Wait for any navigation or response
  await page.waitForTimeout(5000);

  const url = page.url();
  console.log(`URL after submit: ${url}`);

  // Check for any error messages
  const pageContent = await page.content();
  if (pageContent.includes("error") || pageContent.includes("Error")) {
    console.log("Page has error content");
  }

  // Try to check the network requests
  const cookies = await context.cookies();
  console.log("Cookies after sign-in:", cookies.map((c) => c.name).join(", "));

  await browser.close();
  console.log("\nTest complete - check the output above for issues");
}

test().catch(console.error);
