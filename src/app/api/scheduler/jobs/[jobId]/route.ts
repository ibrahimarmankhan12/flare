import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import { z } from "zod";

import { schedulerRepository } from "lib/db/repository";
import { publicScheduledJob } from "lib/scheduler/jobs";

export const dynamic = "force-dynamic";

const patchBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    status: z.enum(["active", "paused", "disabled"]).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "Provide at least one field to update.",
  });

const errorFromZod = (error: z.ZodError): string =>
  error.issues
    .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
    .join("; ");

const pathParamsSchema = z.object({
  jobId: z.string().uuid("jobId must be a UUID"),
});

const parseJobId = (raw: string) => pathParamsSchema.shape.jobId.safeParse(raw);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { jobId } = await params;
  const idCheck = parseJobId(jobId);
  if (!idCheck.success) {
    return new Response(idCheck.error.issues[0]?.message ?? "Invalid jobId", {
      status: 400,
    });
  }

  try {
    const job = await schedulerRepository.getScheduledJob(
      idCheck.data,
      session.user.id,
    );
    if (!job) return new Response("Schedule not found", { status: 404 });
    return Response.json({ job: publicScheduledJob(job) });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { jobId } = await params;
  const idCheck = parseJobId(jobId);
  if (!idCheck.success) {
    return new Response(idCheck.error.issues[0]?.message ?? "Invalid jobId", {
      status: 400,
    });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(errorFromZod(parsed.error), { status: 400 });
  }

  try {
    const job = await schedulerRepository.updateScheduledJob(
      idCheck.data,
      session.user.id,
      parsed.data,
    );
    if (!job) return new Response("Schedule not found", { status: 404 });
    return Response.json({ job: publicScheduledJob(job) });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { jobId } = await params;
  const idCheck = parseJobId(jobId);
  if (!idCheck.success) {
    return new Response(idCheck.error.issues[0]?.message ?? "Invalid jobId", {
      status: 400,
    });
  }

  try {
    const removed = await schedulerRepository.deleteScheduledJob(
      idCheck.data,
      session.user.id,
    );
    if (!removed) return new Response("Schedule not found", { status: 404 });
    return Response.json({ status: "ok" });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}
