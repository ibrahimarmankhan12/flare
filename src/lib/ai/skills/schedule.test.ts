import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("lib/scheduler/jobs", () => ({
  createScheduledJobForUser: vi.fn(),
}));

import { parseScheduleArgs } from "./schedule";

describe("parseScheduleArgs", () => {
  it("parses a 5-field cron expression with a message", () => {
    const result = parseScheduleArgs("0 9 * * 1-5 morning standup");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scheduleType).toBe("recurring");
    expect(result.cron).toBe("0 9 * * 1-5");
    expect(result.triggerMessage).toBe("morning standup");
  });

  it("parses 'in N minutes' as a one-shot timer", () => {
    const before = Date.now();
    const result = parseScheduleArgs("in 5 minutes check deploy");
    const after = Date.now();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scheduleType).toBe("once");
    expect(result.triggerMessage).toBe("check deploy");
    expect(result.runAt).toBeInstanceOf(Date);
    const runAtMs = (result.runAt as Date).getTime();
    expect(runAtMs).toBeGreaterThanOrEqual(before + 5 * 60_000);
    expect(runAtMs).toBeLessThanOrEqual(after + 5 * 60_000 + 50);
  });

  it("parses 'in N hours' as a one-shot timer", () => {
    const result = parseScheduleArgs("in 2 hours send a reminder");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scheduleType).toBe("once");
  });

  it("parses 'in N days' as a one-shot timer", () => {
    const result = parseScheduleArgs("in 1 day morning briefing");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scheduleType).toBe("once");
  });

  it("strips a leading /schedule prefix defensively", () => {
    const result = parseScheduleArgs("/schedule */15 * * * * poll");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cron).toBe("*/15 * * * *");
    expect(result.triggerMessage).toBe("poll");
  });

  it("rejects an empty invocation", () => {
    const result = parseScheduleArgs("");
    expect(result.ok).toBe(false);
  });

  it("rejects too few cron tokens", () => {
    const result = parseScheduleArgs("0 9 * msg");
    expect(result.ok).toBe(false);
  });
});
