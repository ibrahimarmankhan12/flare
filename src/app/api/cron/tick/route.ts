import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { runSchedulerTick } from "lib/scheduler";
import logger from "logger";

// P3.1 — #11 scheduled agents. Vercel Cron calls this route once a minute
// (see vercel.json). It can also be POSTed to manually for tests / smoke
// checks. Auth: Bearer <CRON_SECRET>. In dev with no secret, the route is
// open to keep the dev loop fast.

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

const isAuthorized = (req: Request): boolean => {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return process.env.NODE_ENV === "development";
  }
  const header = req.headers.get("authorization") ?? "";
  // Constant-time comparison (via sha256 digests to equalize lengths).
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(`Bearer ${expected}`).digest();
  return timingSafeEqual(a, b);
};

const handle = async (req: Request) => {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const result = await runSchedulerTick();
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[cron/tick] tick failed:", err);
    return NextResponse.json(
      { ok: false, error: message, durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
};

export const GET = handle;
export const POST = handle;
