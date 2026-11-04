import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import { z } from "zod";

import {
  createScheduledJobForUser,
  publicScheduledJob,
} from "lib/scheduler/jobs";
import { schedulerRepository } from "lib/db/repository";

export const dynamic = "force-dynamic";

const createBodySchema = z.object({
  scheduleType: z.enum(["once", "recurring"]),
  title: z.string().trim().min(1).max(120).optional(),
  prompt: z.string().trim().min(1).max(8000),
  cron: z.string().trim().min(1).max(120).optional(),
  runAt: z.string().trim().min(1).optional(),
  delay: z
    .object({
      amount: z.number().int().positive().max(10_000),
      unit: z.enum(["minute", "minutes", "hour", "hours", "day", "days"]),
    })
    .optional(),
  naturalLanguage: z.string().trim().min(1).max(500).optional(),
  agentId: z.string().uuid().optional(),
  threadId: z.string().trim().min(1).max(128).optional(),
});

const errorFromZod = (error: z.ZodError): string =>
  error.issues
    .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
    .join("; ");

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const jobs = await schedulerRepository.listScheduledJobs(session.user.id);
    return Response.json({ jobs: jobs.map(publicScheduledJob) });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const parsed = createBodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(errorFromZod(parsed.error), { status: 400 });
  }

  try {
    const job = await createScheduledJobForUser(
      session.user.id,
      { ...parsed.data, createdFrom: "api" },
    );
    return Response.json({ job: publicScheduledJob(job) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create schedule.";
    return new Response(message, { status: 400 });
  }
}
