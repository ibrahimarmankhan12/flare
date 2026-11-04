import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("lib/db/repository", () => ({
  schedulerRepository: {
    createScheduledJob: vi.fn(),
  },
}));

import {
  normalizeScheduleCreateInput,
  parseSimpleScheduleText,
} from "./jobs";

describe("parseSimpleScheduleText", () => {
  const now = new Date("2026-06-02T10:00:00.000Z");

  it("parses 'in N minutes' expressions", () => {
    const result = parseSimpleScheduleText("in 5 minutes check deploy", now);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.runAt.toISOString()).toBe(
      new Date(now.getTime() + 5 * 60_000).toISOString(),
    );
    expect(result.message).toBe("check deploy");
  });

  it("parses 'in N hours' expressions", () => {
    const result = parseSimpleScheduleText("in 2 hours water plants", now);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.runAt.toISOString()).toBe(
      new Date(now.getTime() + 2 * 60 * 60_000).toISOString(),
    );
  });

  it("parses 'in N days' expressions", () => {
    const result = parseSimpleScheduleText("in 1 day standup", now);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.runAt.toISOString()).toBe(
      new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
    );
  });

  it("parses explicit ISO datetimes", () => {
    const result = parseSimpleScheduleText(
      "at 2026-07-01T09:00:00Z standup",
      now,
    );
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.runAt.toISOString()).toBe("2026-07-01T09:00:00.000Z");
  });

  it("rejects unsupported phrasing", () => {
    const result = parseSimpleScheduleText("later", now);
    expect("error" in result).toBe(true);
  });
});

describe("normalizeScheduleCreateInput", () => {
  const now = new Date("2026-06-02T10:00:00.000Z");

  it("rejects one-shot schedules that are too soon", () => {
    expect(() =>
      normalizeScheduleCreateInput(
        {
          scheduleType: "once",
          prompt: "check deploy",
          runAt: new Date(now.getTime() + 5_000).toISOString(),
        },
        now,
      ),
    ).toThrow(/at least 30 seconds/);
  });

  it("builds a valid one-shot cron and ISO runAt", () => {
    const result = normalizeScheduleCreateInput(
      {
        scheduleType: "once",
        prompt: "check deploy",
        runAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
      },
      now,
    );
    expect(result.cron.split(" ").length).toBe(5);
    expect(result.payload.scheduleType).toBe("once");
    expect(result.payload.triggerMessage).toBe("check deploy");
  });

  it("uses naturalLanguage when no runAt is provided", () => {
    const result = normalizeScheduleCreateInput(
      {
        scheduleType: "once",
        prompt: "ignored when natural language is used",
        naturalLanguage: "in 5 minutes check deploy",
      },
      now,
    );
    expect(result.payload.scheduleType).toBe("once");
  });

  it("requires a cron for recurring schedules", () => {
    expect(() =>
      normalizeScheduleCreateInput(
        { scheduleType: "recurring", prompt: "x" },
        now,
      ),
    ).toThrow(/cron/);
  });

  it("rejects an invalid cron", () => {
    expect(() =>
      normalizeScheduleCreateInput(
        { scheduleType: "recurring", prompt: "x", cron: "not a cron" },
        now,
      ),
    ).toThrow(/Invalid cron/);
  });

  it("computes nextRunAt for a valid recurring cron", () => {
    const result = normalizeScheduleCreateInput(
      { scheduleType: "recurring", prompt: "x", cron: "0 9 * * *" },
      now,
    );
    expect(result.nextRunAt.getTime()).toBeGreaterThan(now.getTime());
    expect(result.payload.scheduleType).toBe("recurring");
  });
});
