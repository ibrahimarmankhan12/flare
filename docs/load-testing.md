# Load testing

A dependency-free load test that baselines the **system-prompt assembly hot path** — the code that runs on every chat message. We baseline it before Phase 1 changes (memory vector search) and Phase 2 changes (RAG retrieval) so we can detect regressions.

## What it tests

The endpoint `GET /api/_loadtest/prompt` runs `buildUserSystemPromptWithMemory(...)` — the same call `src/app/api/chat/route.ts:641-654` makes for every chat message. It does **not** call any LLM, does **not** stream, does **not** write to the DB. It only measures the synchronous hot path: auth, prompt assembly, memory lookup.

The endpoint is gated by:

- `LOADTEST_ENABLED=1` — must be set
- `NODE_ENV !== "production"` — automatic guard

If either is missing, the endpoint returns `404` (loadtest-disabled).

## Setup

```bash
# 1. Install deps and start the dev server with the load test endpoint enabled
pnpm install
LOADTEST_ENABLED=1 pnpm dev

# 2. In a second shell, seed a load-test user with 50 realistic memories
pnpm seed:loadtest

# 3. Run the load test (writes a JSON report under reports/)
pnpm loadtest

# Override defaults
pnpm loadtest -- --concurrency 20 --iterations 500
pnpm loadtest -- --userId <known-user-id>
```

## Interpreting the output

```
  total requests:    200
  total errors:      0    (0.0%)
  wall time:           1842.3 ms
  throughput:        108.6 req/sec
  latency (ms)
    min:                 12.4
    p50:                 18.7
    p90:                 24.1
    p95:                 28.9
    p99:                 42.0
    max:                 61.3
    mean ± stddev:     19.4 ± 5.1
```

The numbers that matter for Phase 1+ work:

- **p50 / p95 / p99** — these are the latency budget we have to fit the new `getTopKForPrompt` vector query and the `retrieveRelevantChunks` RAG call into, before the chat response can start streaming.
- **max** — tail latency; spikes are usually DB-related (cold caches, vacuum, etc.).
- **throughput** — sustained RPS one Next.js dev server can handle for this hot path.

## Tracking the baseline

```bash
# First run — save as the baseline
cp reports/load-test-<ts>.json reports/baseline-2026-06-01-pre-phase1.json

# After Phase 1+#1 lands:
pnpm loadtest
diff reports/baseline-2026-06-01-pre-phase1.json reports/load-test-<new-ts>.json
```

A useful rule of thumb during Phase 1:

| Change                                                      | Acceptable p95 regression |
| ----------------------------------------------------------- | ------------------------- |
| Replace `getAll` with `getTopKForPrompt` (vector search)    | +5-15ms (HNSW cold: +30ms) |
| Add `retrieveRelevantChunks` (RAG) to the prompt           | +10-30ms                  |
| Both (#1 + #9)                                              | +20-50ms                  |

If you see more than +50ms p95, stop and investigate — the prompt assembly is now on the critical path of every chat.

## CI integration (later)

```bash
# Save current run
pnpm loadtest -- --output reports/pr.json

# Fail the PR if p95 regresses by more than 50ms vs the committed baseline
node scripts/load-test-assert.mjs reports/baseline.json reports/pr.json --max-p95-delta 50
```

(Assert script to be added in a follow-up; not required for Phase 1.)

## What this does NOT test

- **LLM streaming latency** — would need a real LLM call; expensive and noisy. For that, look at Vercel Analytics or your APM.
- **MCP / tool execution** — already covered by Playwright E2E in `tests/core/`.
- **Concurrent users** — single-process runner. For multi-process tests, use k6 (out of scope for Phase 1).
