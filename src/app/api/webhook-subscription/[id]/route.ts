import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import { webhookRepository } from "lib/db/repository";
import {
  WEBHOOK_EVENT_TYPES,
  hashSigningSecret,
} from "lib/webhooks/subscription";
import { z } from "zod";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const patchBodySchema = z.object({
  url: z
    .string()
    .url("url must be a valid URL")
    .max(2048, "url too long")
    .optional(),
  eventTypes: z
    .array(z.enum(WEBHOOK_EVENT_TYPES))
    .min(1, "eventTypes must contain at least one event")
    .max(WEBHOOK_EVENT_TYPES.length)
    .refine((arr) => new Set(arr).size === arr.length, {
      message: "eventTypes cannot contain duplicates",
    })
    .optional(),
  description: z
    .string()
    .max(240, "description too long")
    .nullable()
    .optional(),
  enabled: z.boolean().optional(),
  signingSecret: z.string().min(16).max(256).optional(),
});

const errorFromZod = (error: z.ZodError): string =>
  error.issues
    .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
    .join("; ");

const projectSubscription = (
  row: NonNullable<
    Awaited<ReturnType<typeof webhookRepository.getWebhookSubscription>>
  >,
) => ({
  id: row.id,
  url: row.url,
  eventTypes: row.eventTypes ?? [],
  description: row.description ?? null,
  enabled: row.enabled,
  failureCount: row.failureCount ?? 0,
  lastSuccessAt: row.lastSuccessAt ?? null,
  lastFailureAt: row.lastFailureAt ?? null,
  lastFailureReason: row.lastFailureReason ?? null,
  createdAt: row.createdAt,
});

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

  try {
    const row = await webhookRepository.getWebhookSubscription(
      id,
      session.user.id,
    );
    if (!row) {
      return new Response("Not found", { status: 404 });
    }
    return Response.json({ subscription: projectSubscription(row) });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return new Response("Missing id", { status: 400 });
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

  const patch = parsed.data;
  if (
    patch.url === undefined &&
    patch.eventTypes === undefined &&
    patch.description === undefined &&
    patch.enabled === undefined &&
    patch.signingSecret === undefined
  ) {
    return new Response("At least one field is required", { status: 400 });
  }

  try {
    const updated = await webhookRepository.updateWebhookSubscription(
      id,
      session.user.id,
      {
        ...(patch.url !== undefined ? { url: patch.url } : {}),
        ...(patch.eventTypes !== undefined
          ? { eventTypes: patch.eventTypes }
          : {}),
        ...(patch.description !== undefined
          ? { description: patch.description }
          : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.signingSecret !== undefined
          ? {
              signingSecret: patch.signingSecret,
              secretHash: hashSigningSecret(patch.signingSecret),
            }
          : {}),
      },
    );
    if (!updated) {
      return new Response("Not found", { status: 404 });
    }
    return Response.json({ subscription: projectSubscription(updated) });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

  try {
    const deleted = await webhookRepository.deleteWebhookSubscription(
      id,
      session.user.id,
    );
    if (!deleted) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}
