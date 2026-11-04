#!/usr/bin/env tsx
/**
 * Load-test runner for the system-prompt assembly hot path.
 *
 * This is a dependency-free, single-process load test. It uses the built-in
 * `fetch` to fire N concurrent requests at `/api/_loadtest/prompt` and reports
 * p50/p90/p95/p99 latency, throughput, and error rate. Results are written to
 * `reports/load-test-<timestamp>.json` and a human summary is printed.
 *
 * Why a hand-rolled runner?
 *   - No new dependencies in `package.json`.
 *   - The endpoint is intentionally tiny (one DB query + one prompt build),
 *     so we don't need autocannon/k6/artillery's connection management.
 *   - Easy to read and audit. The whole script fits on one screen.
 *
 * Usage:
 *   LOADTEST_ENABLED=1 pnpm dev   # in one shell
 *   pnpm seed:loadtest            # create a user with 50 memories
 *   pnpm loadtest                 # in another shell
 *   pnpm loadtest -- --concurrency 20 --iterations 500
 *
 * CI integration (later):
 *   pnpm loadtest -- --json reports/baseline.json
 *   node scripts/load-test-assert.mjs reports/baseline.json  # fail if p95 regresses
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";

type Args = {
  url: string;
  path: string;
  concurrency: number;
  iterations: number;
  userId: string | undefined;
  output: string;
  warmup: number;
};

const parseArgs = (): Args => {
  const argv = process.argv.slice(2);
  const get = (key: string, fallback: string) => {
    const idx = argv.indexOf(key);
    return idx === -1 ? fallback : (argv[idx + 1] ?? fallback);
  };
  const baseUrl = process.env.LOADTEST_BASE_URL || "http://localhost:3000";
  const defaultOutput = `reports/load-test-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.json`;

  return {
    url: baseUrl,
    path: get("--path", "/api/_loadtest/prompt"),
    concurrency: Number.parseInt(get("--concurrency", "10"), 10),
    iterations: Number.parseInt(get("--iterations", "200"), 10),
    userId: get("--userId", process.env.LOADTEST_USER_ID || ""),
    output: get("--output", defaultOutput),
    warmup: Number.parseInt(get("--warmup", "20"), 10),
  };
};

const percentile = (sorted: number[], p: number) => {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(rank, sorted.length - 1))];
};

const fmt = (n: number) => n.toFixed(1).padStart(7);
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

const runOnce = async (args: Args, userId: string): Promise<number> => {
  const url = new URL(args.path, args.url);
  if (userId) url.searchParams.set("userId", userId);
  const start = performance.now();
  const response = await fetch(url, { method: "GET" });
  // Drain the body so the connection closes.
  await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return performance.now() - start;
};

const main = async () => {
  const args = parseArgs();

  console.log(
    `Load test: ${args.url}${args.path}  concurrency=${args.concurrency}  iterations=${args.iterations}`,
  );
  if (args.userId) console.log(`userId=${args.userId}`);
  console.log("");

  // Warmup: run a few requests to JIT/warm caches, then discard.
  if (args.warmup > 0 && args.userId) {
    process.stdout.write(`Warming up (${args.warmup} requests)... `);
    const warmupPromises: Promise<unknown>[] = [];
    for (let i = 0; i < args.warmup; i++) {
      warmupPromises.push(runOnce(args, args.userId).catch(() => null));
    }
    await Promise.all(warmupPromises);
    process.stdout.write("done\n\n");
  }

  // Run all requests in waves of `concurrency`.
  const latencies: number[] = [];
  const errors: { count: number; sample: string | null } = {
    count: 0,
    sample: null,
  };
  const startWall = performance.now();

  for (let wave = 0; wave < args.iterations; wave += args.concurrency) {
    const waveSize = Math.min(args.concurrency, args.iterations - wave);
    const wavePromises: Promise<number>[] = [];
    for (let i = 0; i < waveSize; i++) {
      if (!args.userId) {
        // If no userId, the endpoint returns 400 — count as an error so
        // users notice quickly that the seed step is missing.
        errors.count += 1;
        if (!errors.sample) errors.sample = "missing userId (run pnpm seed:loadtest)";
        continue;
      }
      wavePromises.push(
        runOnce(args, args.userId).catch((err: Error) => {
          errors.count += 1;
          if (!errors.sample) errors.sample = err.message;
          return Number.NaN;
        }),
      );
    }
    const waveResults = await Promise.all(wavePromises);
    for (const r of waveResults) {
      if (Number.isFinite(r)) latencies.push(r);
    }
  }

  const durationMs = performance.now() - startWall;
  latencies.sort((a, b) => a - b);

  const min = latencies[0] ?? 0;
  const max = latencies[latencies.length - 1] ?? 0;
  const mean =
    latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;
  const variance =
    latencies.length > 0
      ? latencies.reduce((acc, v) => acc + (v - mean) ** 2, 0) / latencies.length
      : 0;
  const stddev = Math.sqrt(variance);

  const rps = (latencies.length / durationMs) * 1000;
  const errorRate = errors.count / args.iterations;

  const report = {
    timestamp: new Date().toISOString(),
    config: {
      url: args.url,
      path: args.path,
      concurrency: args.concurrency,
      iterations: args.iterations,
      warmup: args.warmup,
    },
    stats: {
      totalRequests: latencies.length,
      totalErrors: errors.count,
      errorRate,
      durationMs: Number(durationMs.toFixed(2)),
      rps: Number(rps.toFixed(2)),
      latencyMs: {
        min: Number(min.toFixed(3)),
        max: Number(max.toFixed(3)),
        mean: Number(mean.toFixed(3)),
        stddev: Number(stddev.toFixed(3)),
        p50: Number(percentile(latencies, 50).toFixed(3)),
        p90: Number(percentile(latencies, 90).toFixed(3)),
        p95: Number(percentile(latencies, 95).toFixed(3)),
        p99: Number(percentile(latencies, 99).toFixed(3)),
      },
    },
    firstError: errors.sample,
  };

  console.log("Results");
  console.log("-------");
  console.log(`  total requests:    ${report.stats.totalRequests}`);
  console.log(`  total errors:      ${report.stats.totalErrors}  (${fmtPct(report.stats.errorRate)})`);
  if (errors.sample) console.log(`  first error:       ${errors.sample}`);
  console.log(`  wall time:         ${fmt(report.stats.durationMs)}ms`);
  console.log(`  throughput:        ${fmt(report.stats.rps)} req/sec`);
  console.log("");
  console.log("  latency (ms)");
  console.log(`    min:             ${fmt(report.stats.latencyMs.min)}`);
  console.log(`    p50:             ${fmt(report.stats.latencyMs.p50)}`);
  console.log(`    p90:             ${fmt(report.stats.latencyMs.p90)}`);
  console.log(`    p95:             ${fmt(report.stats.latencyMs.p95)}`);
  console.log(`    p99:             ${fmt(report.stats.latencyMs.p99)}`);
  console.log(`    max:             ${fmt(report.stats.latencyMs.max)}`);
  console.log(`    mean ± stddev:   ${fmt(report.stats.latencyMs.mean)} ± ${fmt(report.stats.latencyMs.stddev)}`);

  await mkdir(dirname(args.output), { recursive: true });
  await writeFile(args.output, JSON.stringify(report, null, 2));
  console.log("");
  console.log(`Wrote ${args.output}`);
  console.log("");
  console.log("Tip: commit this JSON as a baseline, then re-run after Phase 1+");
  console.log("changes to confirm the system-prompt assembly hot path has not regressed.");
};

main().catch((err) => {
  console.error("Load test failed:", err);
  process.exit(1);
});
