import { describe, expect, it } from "vitest";
import { computeNextRun, validateCron } from "./cron-parser";

const fmt = (d: Date) => {
  // UTC ISO without milliseconds, easier to read in test failures.
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
};

describe("validateCron", () => {
  it("accepts a star-every-minute expression", () => {
    expect(validateCron("* * * * *")).toEqual({ ok: true });
  });

  it("accepts a complex expression with lists, ranges and steps", () => {
    expect(validateCron("0,30 9-17 */2 * 1-5")).toEqual({ ok: true });
  });

  it("rejects an empty string", () => {
    const r = validateCron("");
    expect(r.ok).toBe(false);
  });

  it("rejects a 4-field expression", () => {
    const r = validateCron("* * * *");
    expect(r.ok).toBe(false);
  });

  it("rejects a 6-field expression", () => {
    const r = validateCron("* * * * * *");
    expect(r.ok).toBe(false);
  });

  it("rejects a non-numeric range", () => {
    const r = validateCron("abc * * * *");
    expect(r.ok).toBe(false);
  });

  it("rejects a minute value of 60", () => {
    const r = validateCron("60 * * * *");
    expect(r.ok).toBe(false);
  });

  it("rejects an hour value of 24", () => {
    const r = validateCron("* 24 * * *");
    expect(r.ok).toBe(false);
  });
});

describe("computeNextRun", () => {
  it("next minute for `* * * * *` from Friday 4:59pm is 5:00pm", () => {
    // Friday 2026-06-05 16:59:00 UTC
    const from = new Date("2026-06-05T16:59:00.000Z");
    const next = computeNextRun("* * * * *", from);
    expect(fmt(next)).toBe("2026-06-05T17:00:00Z");
  });

  it("`0 9 * * 1-5` from Wednesday 8:00am is the same day at 9:00am", () => {
    // Wednesday 2026-06-03 08:00:00 UTC
    const from = new Date("2026-06-03T08:00:00.000Z");
    const next = computeNextRun("0 9 * * 1-5", from);
    expect(fmt(next)).toBe("2026-06-03T09:00:00Z");
  });

  it("`0 9 * * 1-5` from Saturday 8:00am is Monday 9:00am", () => {
    // Saturday 2026-06-06 08:00:00 UTC
    const from = new Date("2026-06-06T08:00:00.000Z");
    const next = computeNextRun("0 9 * * 1-5", from);
    expect(fmt(next)).toBe("2026-06-08T09:00:00Z");
  });

  it("`0 0 1 * *` from mid-month is the 1st of the next month at midnight", () => {
    // 2026-06-15 12:00:00 UTC
    const from = new Date("2026-06-15T12:00:00.000Z");
    const next = computeNextRun("0 0 1 * *", from);
    expect(fmt(next)).toBe("2026-07-01T00:00:00Z");
  });

  it("`*/15 * * * *` from 12:01 is 12:15", () => {
    const from = new Date("2026-06-01T12:01:00.000Z");
    const next = computeNextRun("*/15 * * * *", from);
    expect(fmt(next)).toBe("2026-06-01T12:15:00Z");
  });

  it("`0,30 9-17 * * *` from 10:00 is 10:30, not 11:00", () => {
    const from = new Date("2026-06-01T10:00:00.000Z");
    const next = computeNextRun("0,30 9-17 * * *", from);
    expect(fmt(next)).toBe("2026-06-01T10:30:00Z");
  });

  it("`0,30 9-17 * * *` from 10:31 is 11:00", () => {
    const from = new Date("2026-06-01T10:31:00.000Z");
    const next = computeNextRun("0,30 9-17 * * *", from);
    expect(fmt(next)).toBe("2026-06-01T11:00:00Z");
  });

  it("`30 8 * * 0` (Sunday 8:30am) from Saturday 23:00 is the next day at 08:30", () => {
    // Saturday 2026-06-06 23:00:00 UTC
    const from = new Date("2026-06-06T23:00:00.000Z");
    const next = computeNextRun("30 8 * * 0", from);
    expect(fmt(next)).toBe("2026-06-07T08:30:00Z");
  });

  it("throws on invalid input rather than looping forever", () => {
    expect(() => computeNextRun("not a cron", new Date())).toThrow();
  });
});
