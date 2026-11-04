/**
 * Build the prebuilt sandbox environments defined in `lib/sandbox/templates`.
 *
 *   pnpm tsx scripts/build-e2b-templates.ts              # all of them
 *   pnpm tsx scripts/build-e2b-templates.ts android web  # just these
 *   FORCE=1 pnpm tsx scripts/build-e2b-templates.ts base # ignore layer cache
 *
 * Builds go through the SDK rather than the `e2b` CLI on purpose: the CLI
 * authenticates with a dashboard access token, while `Template.build()` uses
 * E2B_API_KEY — which this deployment already has in .env. One less secret.
 *
 * Templates are per-team and persist, so this is a one-time cost per
 * environment. Re-running is cheap: unchanged layers are cached.
 *
 * On success it prints the E2B_ENABLED_TEMPLATES line to put in .env — that
 * env var is what makes an environment selectable at runtime.
 */

import "load-env";

import { Template } from "e2b";

import {
  SANDBOX_ENVIRONMENTS,
  type SandboxEnvironment,
} from "lib/sandbox/templates";

const FORCE = process.env.FORCE === "1";

const requested = process.argv.slice(2).filter((a) => !a.startsWith("-"));

const selected: SandboxEnvironment[] = requested.length
  ? requested.map((id) => {
      const env = SANDBOX_ENVIRONMENTS.find((e) => e.id === id);
      if (!env) {
        console.error(
          `Unknown environment "${id}". Known: ${SANDBOX_ENVIRONMENTS.map((e) => e.id).join(", ")}`,
        );
        process.exit(1);
      }
      return env;
    })
  : SANDBOX_ENVIRONMENTS;

const buildOne = async (env: SandboxEnvironment) => {
  if (!env.template) {
    console.log(`- ${env.id}: uses the stock image, nothing to build`);
    return { id: env.id, ok: true as const, skipped: true };
  }

  const started = Date.now();
  console.log(`\n=== building ${env.id} -> ${env.template} ===`);

  try {
    const info = await Template.build(env.define(Template()), env.template, {
      cpuCount: env.cpuCount,
      memoryMB: env.memoryMB,
      skipCache: FORCE,
      // Logs are the only way to see a failing apt/sdkmanager step; without
      // them a broken build is just a rejected promise with no context.
      onBuildLogs: (entry) => {
        const line = String(
          (entry as { message?: string }).message ?? entry,
        ).trimEnd();
        if (line) console.log(`  | ${line}`);
      },
    });
    const secs = Math.round((Date.now() - started) / 1000);
    console.log(
      `=== ${env.id} ok in ${secs}s (templateId=${info.templateId}) ===`,
    );
    return { id: env.id, ok: true as const, skipped: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`=== ${env.id} FAILED: ${message} ===`);
    return { id: env.id, ok: false as const, error: message };
  }
};

const main = async () => {
  if (!process.env.E2B_API_KEY?.trim()) {
    console.error("E2B_API_KEY is not set — cannot build templates.");
    process.exit(1);
  }

  console.log(
    `Building ${selected.length} environment(s): ${selected.map((e) => e.id).join(", ")}`,
  );

  const results: Awaited<ReturnType<typeof buildOne>>[] = [];
  // Serial on purpose. Concurrent builds compete for the same E2B build
  // capacity and interleave their logs into something unreadable, which
  // matters more than wall-clock here.
  for (const env of selected) {
    results.push(await buildOne(env));
  }

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log("\n---------------------------------------------");
  console.log(`built: ${ok.length}/${results.length}`);
  if (failed.length) {
    for (const f of failed) {
      console.log(`  FAILED ${f.id}: ${"error" in f ? f.error : ""}`);
    }
  }

  // Only the environments that just built are safe to advertise, but the
  // deployment may already have others — merge rather than overwrite.
  const existing = (process.env.E2B_ENABLED_TEMPLATES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const merged = [...new Set([...existing, ...ok.map((r) => r.id)])];

  console.log("\nAdd (or update) this in .env, then restart Flare:\n");
  console.log(`E2B_ENABLED_TEMPLATES=${merged.join(",")}`);

  process.exit(failed.length ? 1 : 0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
