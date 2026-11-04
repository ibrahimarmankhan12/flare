// scripts/dodo-create-products.ts
//
// One-shot script that creates subscription products on Dodo Payments
// for each Flare paid tier using the Dodo REST API (much more
// reliable than automating the dashboard).
//
// Run with:
//   DODO_PAYMENTS_API_KEY=<key> \
//   pnpm dlx tsx scripts/dodo-create-products.ts
//
// Or with --env=local to load from .env automatically.
//
// Outputs JSON to stdout with {tier, productId, status} for each tier
// and writes the resulting product IDs back to .env so the admin
// runtime picks them up.

import { config as loadEnv } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Tier = {
  slug: string;
  name: string;
  description: string;
  envVar: string;
  pricePaise: number; // smallest INR unit (1 INR = 100 paise)
};

const TIERS: Tier[] = [
  {
    slug: "flare-pro",
    name: "Flare Pro",
    description:
      "Higher daily limits and faster models for power users of Flare AI.",
    envVar: "DODO_PRODUCT_FLARE_PRO",
    pricePaise: 79900, // ₹799
  },
  {
    slug: "flare-max",
    name: "Flare Max",
    description:
      "Generous limits and priority access to premium models on Flare AI.",
    envVar: "DODO_PRODUCT_FLARE_MAX",
    pricePaise: 199900, // ₹1,999
  },
  {
    slug: "flare-enterprises",
    name: "Flare Enterprises",
    description: "Team-grade Flare AI plan with deployment support.",
    envVar: "DODO_PRODUCT_FLARE_ENTERPRISES",
    pricePaise: 399900, // ₹3,999
  },
  {
    slug: "flare-enterprises-pro",
    name: "Flare Enterprises Pro",
    description:
      "Enterprise Flare AI plan with enhanced security and support.",
    envVar: "DODO_PRODUCT_FLARE_ENTERPRISES_PRO",
    pricePaise: 599900, // ₹5,999
  },
  {
    slug: "flare-enterprises-max",
    name: "Flare Enterprises Max",
    description:
      "Highest enterprise Flare AI tier with dedicated endpoints.",
    envVar: "DODO_PRODUCT_FLARE_ENTERPRISES_MAX",
    pricePaise: 1099900, // ₹10,999
  },
];

const log = (msg: string) => console.log(`[dodo-bootstrap] ${msg}`);

const BASE_URL =
  process.env.DODO_BOOTSTRAP_BASE_URL ??
  (process.env.DODO_ENVIRONMENT === "live_mode"
    ? "https://live.dodopayments.com"
    : "https://test.dodopayments.com");

interface CreateProductResponse {
  product_id: string;
  name?: string;
  description?: string;
}

async function createProduct(
  apiKey: string,
  tier: Tier,
): Promise<{ productId: string | null; error?: string }> {
  const res = await fetch(`${BASE_URL}/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      name: tier.name,
      description: tier.description,
      tax_category: "saas",
      price: {
        type: "recurring_price",
        price: tier.pricePaise,
        currency: "INR",
        discount: 0,
        purchasing_power_parity: false,
        payment_frequency_count: 1,
        payment_frequency_interval: "Month",
        subscription_period_count: 1,
        subscription_period_interval: "Month",
        tax_inclusive: false, // India: GST is added on top at checkout (excluded from the listed price)
        trial_period_days: 0,
      },
      metadata: {
        flare_tier: tier.slug,
      },
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    return { productId: null, error: `${res.status}: ${text}` };
  }
  try {
    const data = JSON.parse(text) as CreateProductResponse;
    if (!data.product_id) {
      return { productId: null, error: `No product_id in response: ${text}` };
    }
    return { productId: data.product_id };
  } catch {
    return { productId: null, error: `Invalid JSON: ${text}` };
  }
}

function loadApiKey(): string | null {
  if (process.env.DODO_PAYMENTS_API_KEY) {
    return process.env.DODO_PAYMENTS_API_KEY;
  }
  try {
    const envPath = join(process.cwd(), ".env");
    const content = readFileSync(envPath, "utf8");
    const match = content.match(/^DODO_PAYMENTS_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch {
    /* .env not readable */
  }
  return null;
}

function updateEnvFile(updates: Record<string, string>) {
  const envPath = join(process.cwd(), ".env");
  let content = "";
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    content = "";
  }
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(content)) {
      content = content.replace(re, `${key}=${value}`);
    } else {
      content += `${content.endsWith("\n") || !content ? "" : "\n"}${key}=${value}\n`;
    }
  }
  writeFileSync(envPath, content, "utf8");
}

async function main() {
  const apiKey = loadApiKey();
  if (!apiKey) {
    console.error(
      "Set DODO_PAYMENTS_API_KEY in the env or .env, then rerun.\n" +
        "Usage: DODO_PAYMENTS_API_KEY=<key> pnpm dlx tsx scripts/dodo-create-products.ts",
    );
    process.exit(1);
  }

  log(`Using Dodo base URL: ${BASE_URL}`);
  log(`Creating ${TIERS.length} products…\n`);

  const results: Array<{
    tier: string;
    envVar: string;
    productId: string | null;
    error?: string;
  }> = [];

  for (const tier of TIERS) {
    log(`POST /products — ${tier.name} (₹${tier.pricePaise / 100}/mo)`);
    const { productId, error } = await createProduct(apiKey, tier);
    if (productId) {
      log(`  -> ${productId}\n`);
    } else {
      log(`  !! ${error ?? "unknown error"}\n`);
    }
    results.push({ tier: tier.slug, envVar: tier.envVar, productId, error });
  }

  // Persist successful product IDs to .env so the runtime picks them
  // up immediately.
  const updates: Record<string, string> = {};
  for (const r of results) {
    if (r.productId) updates[r.envVar] = r.productId;
  }
  if (Object.keys(updates).length > 0) {
    log(`Writing ${Object.keys(updates).length} product IDs to .env…`);
    try {
      updateEnvFile(updates);
      log("Done.\n");
    } catch (e) {
      log(`! could not write .env: ${e instanceof Error ? e.message : e}\n`);
    }
  }

  // Try to archive any leftover products on this account that match
  // our old USD pricing — Dodo has no PATCH endpoint so we can't
  // edit the currency. The archive endpoint is best-effort; if it
  // 404s the user can clean up manually in the dashboard.
  const oldIds: string[] = [
    "pdt_0Ng58igyMQ6Sr4wvzl9Fz", // flare-pro (USD)
    "pdt_0Ng58ik3U7HoDWmw2fcNP", // flare-max (USD)
    "pdt_0Ng58ilQrfzqSelYExO7N", // flare-enterprises (USD)
    "pdt_0Ng58im2d1D0D77dt90oH", // flare-enterprises-pro (USD)
    "pdt_0Ng58imcrz6FIzmvHRNFp", // flare-enterprises-max (USD)
  ];
  log("Attempting to archive old USD products (best effort)…");
  for (const oldId of oldIds) {
    if (Object.values(updates).includes(oldId)) continue; // skip if it's the new INR one
    const res = await fetch(`${BASE_URL}/products/${oldId}/archive`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    log(`  ${oldId}: HTTP ${res.status}`);
  }

  console.log("# Dodo product IDs:");
  console.log(JSON.stringify(results, null, 2));
}

if (process.argv.includes("--env=local")) {
  loadEnv({ path: ".env" });
}

main().catch((e) => {
  console.error("[dodo-bootstrap] failed:", e);
  process.exit(1);
});
