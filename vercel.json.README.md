# vercel.json — deployment notes

Vercel Cron is a **paid feature** — coordinate the deployment tier before
relying on this configuration. The standalone worker (`src/worker/index.ts`)
is the fallback for Railway / Render / Fly / any platform that can keep a
Node process alive.

The `/api/cron/tick` route is also POST-able with a `Bearer <CRON_SECRET>`
header for manual triggers and tests. In dev with no `CRON_SECRET` set,
the route is open (`NODE_ENV=development`).
