# Scheduled agents

A scheduled agent is a server-side job that runs on a recurring cron schedule
or fires once after a delay ("remind me in 5 minutes"). Each tick, the system
materialises a new chat thread, posts the trigger message as a user turn, and
records the run for later inspection. From the user's perspective, the
assistant just "shows up" in their thread list at the appointed time.

## What cron is supported

The scheduler accepts a standard 5-field cron expression with `*` `,` `-` `/`
operators (no `?`, no `L`, no named months). Fields are evaluated in UTC.

| Field          | Range    | Notes                          |
| -------------- | -------- | ------------------------------ |
| minute         | 0-59     |                                |
| hour           | 0-23     |                                |
| day-of-month   | 1-31     |                                |
| month          | 1-12     |                                |
| day-of-week    | 0-6      | Sun=0                          |

A few useful examples:

- `* * * * *` — every minute (debugging only).
- `0 9 * * 1-5` — 09:00 UTC, weekdays.
- `*/15 * * * *` — every 15 minutes.
- `0 0 1 * *` — 00:00 UTC on the 1st of every month.

Granularity is 1 minute — there is no sub-minute scheduling.

## One-shot timers

The scheduler also accepts one-shot reminders via two shorthand forms:

- `/schedule in 5 minutes check deploy`
- `/schedule in 2 hours send a reminder`
- `/schedule in 1 day morning briefing`

One-shot jobs encode their fire time as a single-shot cron (matching the
chosen minute) and a payload of `scheduleType: "once"`. The worker disables
the job after the first execution so it does not re-fire on subsequent ticks.

## How to create a scheduled job

Three paths exist. All funnel through the shared
`createScheduledJobForUser` helper in `src/lib/scheduler/jobs.ts`, which
normalises the request, validates the cron (when present), enforces a 30s
minimum lead time, and writes a `scheduled_job` row via
`schedulerRepository.createScheduledJob`.

**Slash command (recommended for chat).** In any chat, type
`/schedule <cron> <message>` or `/schedule in 5 minutes <message>`. The
chat route resolves the skill, parses the request via `parseScheduleArgs`
(`src/lib/ai/skills/schedule.ts`), and creates the job directly — no LLM
tool call required. The response is a single assistant message confirming
the timer. The user message and the assistant confirmation are both
persisted to the thread, so the schedule shows up in the thread list.

**AI tool (for free-form chat).** The assistant has access to a
`scheduler` tool (`src/lib/ai/tools/scheduler/scheduler-tool.ts`) that
supports `create`, `list`, `pause`, `resume`, and `delete`. Models that
can call tools reliably can use this for natural-language phrasing
("set a timer for 5 minutes to check deploy"). The tool falls back to the
shared `createScheduledJobForUser` helper, so the same validation and
normalisation rules apply.

**API.** `GET /api/scheduler/jobs` lists the current user's jobs, and
`POST /api/scheduler/jobs` creates one. `GET/PATCH/DELETE` on
`/api/scheduler/jobs/{jobId}` manage a single job. All endpoints require
a Better Auth session; `PATCH` accepts `name` and `status`; `DELETE`
hard-removes the row. See `src/app/api/scheduler/jobs/route.ts` and
`src/app/api/scheduler/jobs/[jobId]/route.ts`.

## The tick flow

Every minute, exactly one of two triggers fires:

1. **Vercel Cron** — `vercel.json` declares
   `crons: [{ path: "/api/cron/tick", schedule: "* * * * *" }]`. Vercel
   POSTs the route on schedule. The handler requires
   `Authorization: Bearer <CRON_SECRET>` in production; in dev (no secret
   set + `NODE_ENV=development`) the route is open.
2. **Standalone worker** — `src/worker/index.ts` is a Node process that
   ticks every 60s. Run it anywhere that can keep a Node process alive
   (Railway, Render, Fly, EC2). It uses the same `runSchedulerTick` so the
   two triggers are functionally identical.

The tick itself is six steps:

1. `acquireLeaderLock("cron-tick-leader", 50_000ms, ownerTag)` against
   `serverCache` (memory in dev, Redis / Upstash in prod). The TTL covers
   a 60s tick with slack. If the lock is held by another worker the tick
   no-ops.
2. `schedulerRepository.claimDueScheduledJobs(now, 10)` returns up to 10
   `scheduled_job` rows whose `status='active' AND next_run_at <= now`.
3. For each claim: insert a `chat_thread` (so the trigger is visible in
   the sidebar even if the chat call fails), then
   `createScheduledRun(job.id)` to record the run.
4. Synthesise a `POST /api/chat` body and POST it. The worker adds
   `x-scheduler-source: cron-tick`, `x-scheduler-user-id: <job.userId>`,
   and `x-scheduler-secret: <SCHEDULER_INTERNAL_SECRET|CRON_SECRET>`.
   The chat route accepts this in place of a Better Auth session
   (constant-time secret comparison, narrowly scoped to cron-tick source),
   then runs the rest of the normal chat pipeline. See
   `isAuthorizedSchedulerRequest` in `src/app/api/chat/route.ts`.
5. `updateScheduledRun` flips the run to `completed` or `failed`.
6. For `payload.scheduleType === "once"` the job is set to
   `status='disabled'` and `nextRunAt` pushed a year out so it can never
   re-fire. For recurring jobs `computeNextRun(job.cron, now)` advances
   the cursor. In both cases `lastRunAt` is set regardless of outcome so
   the same row is not retried on the very next tick.

## Required env

- `CRON_SECRET` — must be set in production. The `/api/cron/tick` route
  returns 401 unless the request carries
  `Authorization: Bearer <CRON_SECRET>`. In dev (no secret,
  `NODE_ENV=development`) the route is open. Vercel Cron is itself a
  paid feature — coordinate the deployment tier before relying on the
  `vercel.json` schedule. The standalone worker at `src/worker/index.ts`
  is the free fallback and uses the same tick code.
- `SCHEDULER_INTERNAL_SECRET` (optional override) — if set, the chat
  route uses this for `x-scheduler-secret` validation in place of
  `CRON_SECRET`. Pick a distinct value if `/api/chat` runs on the same
  origin as the cron handler and you want to rotate independently.

## Limits and risks

- **Max 10 jobs per tick.** A backlog of >10 due jobs will drain one tick
  at a time. The next tick catches up.
- **Vercel Cron granularity is 1 minute.** Sub-minute scheduling is not
  supported by the cron parser.
- **Multi-replica duplicate processing is possible** in a worst case.
  `claimDueScheduledJobs` is non-mutating; the leader lock prevents
  concurrent ticks within one deployment, but Vercel cron + a standalone
  worker can both attempt the same job. A `FOR UPDATE SKIP LOCKED`
  follow-up is on the Phase 5 hardening list.
- **Default assistant reminders are not agent-scoped.** A `scheduled_job`
  with `agent_id IS NULL` runs as the default assistant (no `@agent`
  mention in the synthesised chat body). Useful for "remind me" style
  timers; uses fewer tokens and skips the per-agent system prompt.
- **No PUT / PATCH on `cron` or `payload` via the API.** Jobs can be
  paused, resumed, renamed, or deleted; to change the schedule, delete
  and recreate. A `PATCH` body that allows `cron` / `payload` updates is
  on the API surface backlog.

## See also

- `src/lib/scheduler/cron-parser.ts` — the 5-field parser, 17 unit tests.
- `src/lib/scheduler/leader.ts` — SETNX / read-then-delete.
- `src/lib/scheduler/worker.ts` — `runSchedulerTick`.
- `src/lib/scheduler/jobs.ts` — shared create + normalise helper.
- `src/lib/scheduler/index.ts` — public surface.
- `src/app/api/cron/tick/route.ts` — Vercel Cron handler.
- `src/app/api/scheduler/jobs/route.ts` — list + create API.
- `src/app/api/scheduler/jobs/[jobId]/route.ts` — get / patch / delete API.
- `src/worker/index.ts` — standalone worker entry.
- `vercel.json` + `vercel.json.README.md` — deployment notes.
- `src/lib/ai/skills/schedule.ts` — `/schedule` slash skill.
- `src/lib/ai/tools/scheduler/scheduler-tool.ts` — AI tool binding.
- `src/lib/db/pg/repositories/scheduler-repository.pg.ts` — data layer.
- `src/lib/db/migrations/pg/0028_scheduler_assistant_jobs.sql` — schema
  follow-up that drops the `agent_id` NOT NULL constraint so reminders
  can run as the default assistant.
