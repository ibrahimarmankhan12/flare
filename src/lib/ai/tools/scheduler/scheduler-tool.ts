import "server-only";

import { tool as createTool, jsonSchema } from "ai";
import { z } from "zod";

import { DefaultToolName } from "lib/ai/tools";
import { schedulerRepository } from "lib/db/repository";
import {
  createScheduledJobForUser,
  publicScheduledJob,
} from "lib/scheduler/jobs";

const SchedulerToolInputSchema = z.object({
  action: z.enum(["create", "list", "pause", "resume", "delete"]),
  scheduleType: z.enum(["once", "recurring"]).optional(),
  title: z.string().optional(),
  prompt: z.string().optional(),
  cron: z.string().optional(),
  runAt: z.string().optional(),
  delay: z
    .object({
      amount: z.number().int().positive(),
      unit: z.enum(["minute", "minutes", "hour", "hours", "day", "days"]),
    })
    .optional(),
  naturalLanguage: z.string().optional(),
  jobId: z.string().optional(),
});

const formatDate = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

export const createSchedulerToolForUser = (userId: string, threadId?: string) =>
  createTool({
    description:
      "Create and manage server-side reminders and scheduled assistant jobs. Use this for timers, reminders, recurring checks, and scheduled agent work.",
    inputSchema: jsonSchema<z.infer<typeof SchedulerToolInputSchema>>({
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["create", "list", "pause", "resume", "delete"],
        },
        scheduleType: { type: "string", enum: ["once", "recurring"] },
        title: { type: "string" },
        prompt: {
          type: "string",
          description:
            "The reminder text or assistant instruction to run when the schedule fires.",
        },
        cron: {
          type: "string",
          description: "5-field UTC cron for recurring schedules.",
        },
        runAt: {
          type: "string",
          description: "ISO datetime for one-shot reminders.",
        },
        delay: {
          type: "object",
          properties: {
            amount: { type: "number" },
            unit: {
              type: "string",
              enum: ["minute", "minutes", "hour", "hours", "day", "days"],
            },
          },
          required: ["amount", "unit"],
        },
        naturalLanguage: {
          type: "string",
          description:
            "Simple one-shot schedule text, e.g. 'in 5 minutes check deploy'.",
        },
        jobId: { type: "string" },
      },
      required: ["action"],
    }),
    execute: async (rawInput) => {
      const input = SchedulerToolInputSchema.parse(rawInput);

      if (input.action === "list") {
        const jobs = await schedulerRepository.listScheduledJobs(userId);
        return {
          status: "ok",
          jobs: jobs.map(publicScheduledJob),
        };
      }

      if (input.action === "pause" || input.action === "resume") {
        if (!input.jobId) throw new Error("jobId is required.");
        const job = await schedulerRepository.updateScheduledJob(
          input.jobId,
          userId,
          { status: input.action === "pause" ? "paused" : "active" },
        );
        if (!job) return { status: "not_found", message: "Schedule not found." };
        return {
          status: "ok",
          message:
            input.action === "pause" ? "Schedule paused." : "Schedule resumed.",
          job: publicScheduledJob(job),
        };
      }

      if (input.action === "delete") {
        if (!input.jobId) throw new Error("jobId is required.");
        const deleted = await schedulerRepository.deleteScheduledJob(
          input.jobId,
          userId,
        );
        return deleted
          ? { status: "ok", message: "Schedule deleted." }
          : { status: "not_found", message: "Schedule not found." };
      }

      if (!input.scheduleType) throw new Error("scheduleType is required.");
      if (!input.prompt && !input.naturalLanguage) {
        throw new Error("prompt or naturalLanguage is required.");
      }

      const job = await createScheduledJobForUser(userId, {
        scheduleType: input.scheduleType,
        title: input.title,
        prompt: input.prompt ?? input.naturalLanguage ?? "Scheduled reminder",
        cron: input.cron,
        runAt: input.runAt,
        delay: input.delay,
        naturalLanguage: input.naturalLanguage,
        threadId,
        createdFrom: "chat-tool",
      });

      const payload = job.payload as Record<string, unknown> | null;
      const scheduleType = payload?.scheduleType;
      return {
        status: "ok",
        message:
          scheduleType === "once"
            ? `Timer set for ${formatDate(job.nextRunAt)}.`
            : `Scheduled with cron ${job.cron}. Next run: ${formatDate(
                job.nextRunAt,
              )}.`,
        job: publicScheduledJob(job),
      };
    },
  });

export const schedulerTool = createSchedulerToolForUser("__static__");

export const SchedulerToolName = DefaultToolName.Scheduler;
