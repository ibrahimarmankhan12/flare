import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { schedulerRepository } from "lib/db/repository";
import type { ScheduledJob } from "lib/db/pg/schema.pg";
import { computeNextRun, validateCron } from "./cron-parser";

const MIN_LEAD_MS = 30_000;
const MAX_TITLE_LENGTH = 120;
const MAX_PROMPT_LENGTH = 8_000;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?$/;

export const ScheduleCreateInputSchema = z.object({
  scheduleType: z.enum(["once", "recurring"]),
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH).optional(),
  prompt: z.string().trim().min(1).max(MAX_PROMPT_LENGTH),
  cron: z.string().trim().optional(),
  runAt: z.union([z.string().trim(), z.date()]).optional(),
  delay: z
    .object({
      amount: z.number().int().positive().max(10_000),
      unit: z.enum(["minute", "minutes", "hour", "hours", "day", "days"]),
    })
    .optional(),
  naturalLanguage: z.string().trim().optional(),
  agentId: z.string().uuid().optional(),
  threadId: z.string().optional(),
  createdFrom: z.enum(["chat-tool", "api", "slash"]).default("api"),
});

export type ScheduleCreateInput = z.infer<typeof ScheduleCreateInputSchema>;

export type SchedulePayload = {
  scheduleType: "once" | "recurring";
  triggerMessage: string;
  threadId?: string;
  runAt?: string;
  createdFrom?: "chat-tool" | "api" | "slash";
  executionMode?: "assistant" | "agent";
};

type ParsedDelay = { amount: number; unit: "minute" | "hour" | "day" };

const normalizeDelayUnit = (unit: string): ParsedDelay["unit"] => {
  if (unit.startsWith("minute")) return "minute";
  if (unit.startsWith("hour")) return "hour";
  return "day";
};

const addDelay = (from: Date, delay: ParsedDelay): Date => {
  const multiplier =
    delay.unit === "minute"
      ? 60_000
      : delay.unit === "hour"
        ? 60 * 60_000
        : 24 * 60 * 60_000;
  return new Date(from.getTime() + delay.amount * multiplier);
};

export const parseSimpleScheduleText = (
  text: string,
  now = new Date(),
): { runAt: Date; message: string } | { error: string } => {
  const trimmed = text.trim();
  const inMatch = trimmed.match(
    /^in\s+(\d{1,5})\s+(minutes?|hours?|days?)\s+(.+)$/i,
  );
  if (inMatch) {
    const amount = Number(inMatch[1]);
    if (!Number.isInteger(amount) || amount <= 0) {
      return { error: "Delay amount must be a positive integer." };
    }
    return {
      runAt: addDelay(now, {
        amount,
        unit: normalizeDelayUnit(inMatch[2].toLowerCase()),
      }),
      message: inMatch[3].trim(),
    };
  }

  const atMatch = trimmed.match(/^at\s+([^\s]+(?:T|\s)[^\s]+)\s+(.+)$/i);
  if (atMatch) {
    const dateText = atMatch[1].replace(" ", "T");
    if (!ISO_DATE_RE.test(dateText)) {
      return {
        error:
          "Use an explicit ISO datetime for one-shot schedules, e.g. at 2026-06-02T09:00:00Z message.",
      };
    }
    const runAt = new Date(dateText);
    if (Number.isNaN(runAt.getTime())) {
      return { error: "runAt is not a valid datetime." };
    }
    return { runAt, message: atMatch[2].trim() };
  }

  return {
    error:
      "Unsupported schedule text. Use 'in 5 minutes <message>', 'in 2 hours <message>', or a 5-field cron.",
  };
};

const titleFromPrompt = (prompt: string): string =>
  prompt
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITLE_LENGTH) || "Scheduled reminder";

const cronForOneShot = (runAt: Date): string =>
  `${runAt.getUTCMinutes()} ${runAt.getUTCHours()} ${runAt.getUTCDate()} ${
    runAt.getUTCMonth() + 1
  } *`;

const resolveRunAt = (input: ScheduleCreateInput, now: Date): Date => {
  if (input.delay) {
    return addDelay(now, {
      amount: input.delay.amount,
      unit: normalizeDelayUnit(input.delay.unit),
    });
  }

  if (input.runAt instanceof Date) {
    return input.runAt;
  }

  if (typeof input.runAt === "string" && input.runAt.trim()) {
    const runAt = new Date(input.runAt);
    if (Number.isNaN(runAt.getTime())) {
      throw new Error("runAt is not a valid datetime.");
    }
    return runAt;
  }

  if (input.naturalLanguage) {
    const parsed = parseSimpleScheduleText(input.naturalLanguage, now);
    if ("error" in parsed) throw new Error(parsed.error);
    return parsed.runAt;
  }

  throw new Error("One-shot schedules require runAt, delay, or naturalLanguage.");
};

const assertLeadTime = (runAt: Date, now: Date) => {
  if (runAt.getTime() - now.getTime() < MIN_LEAD_MS) {
    throw new Error("Schedule must be at least 30 seconds in the future.");
  }
};

export const normalizeScheduleCreateInput = (
  raw: unknown,
  now = new Date(),
): ScheduleCreateInput & { cron: string; nextRunAt: Date; payload: SchedulePayload } => {
  const input = ScheduleCreateInputSchema.parse(raw);

  if (input.scheduleType === "recurring") {
    if (!input.cron) throw new Error("Recurring schedules require cron.");
    const validation = validateCron(input.cron);
    if (!validation.ok) throw new Error(`Invalid cron: ${validation.error}`);
    const nextRunAt = computeNextRun(input.cron, now);
    return {
      ...input,
      cron: input.cron,
      nextRunAt,
      payload: {
        scheduleType: "recurring",
        triggerMessage: input.prompt,
        threadId: input.threadId,
        createdFrom: input.createdFrom,
        executionMode: input.agentId ? "agent" : "assistant",
      },
    };
  }

  const runAt = resolveRunAt(input, now);
  assertLeadTime(runAt, now);
  const cron = cronForOneShot(runAt);
  return {
    ...input,
    cron,
    nextRunAt: runAt,
    payload: {
      scheduleType: "once",
      triggerMessage: input.prompt,
      threadId: input.threadId,
      runAt: runAt.toISOString(),
      createdFrom: input.createdFrom,
      executionMode: input.agentId ? "agent" : "assistant",
    },
  };
};

export const createScheduledJobForUser = async (
  userId: string,
  raw: unknown,
  now = new Date(),
): Promise<ScheduledJob> => {
  const normalized = normalizeScheduleCreateInput(raw, now);
  return schedulerRepository.createScheduledJob(
    {
      agentId: normalized.agentId,
      name: normalized.title ?? titleFromPrompt(normalized.prompt),
      cron: normalized.cron,
      payload: normalized.payload,
      nextRunAt: normalized.nextRunAt,
      status: "active",
    },
    userId,
  );
};

export const createOneShotFromNaturalLanguage = async (params: {
  userId: string;
  text: string;
  agentId?: string;
  threadId?: string;
  createdFrom: "chat-tool" | "api" | "slash";
}) => {
  const parsed = parseSimpleScheduleText(params.text);
  if ("error" in parsed) throw new Error(parsed.error);
  return createScheduledJobForUser(params.userId, {
    scheduleType: "once",
    prompt: parsed.message,
    runAt: parsed.runAt,
    agentId: params.agentId,
    threadId: params.threadId,
    createdFrom: params.createdFrom,
  });
};

export const publicScheduledJob = (job: ScheduledJob) => ({
  id: job.id,
  name: job.name,
  cron: job.cron,
  payload: job.payload,
  lastRunAt: job.lastRunAt,
  nextRunAt: job.nextRunAt,
  status: job.status,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
});

export const createAssistantThreadId = () => randomUUID();
