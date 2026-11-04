import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import { webhookRepository } from "lib/db/repository";
import {
  WEBHOOK_EVENT_TYPES,
  generateSigningSecret,
  hashSigningSecret,
} from "lib/webhooks/subscription";
import {
  UrlBlockedError,
  assertPublicWebhookUrl,
} from "lib/webhooks/url-guard";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  url: z.string().url("url must be a valid URL").max(2048, "url too long"),
  eventTypes: z
    .array(z.enum(WEBHOOK_EVENT_TYPES))
    .min(1, "eventTypes must contain at least one event")
    .max(WEBHOOK_EVENT_TYPES.length)
    .refine((arr) => new Set(arr).size === arr.length, {
      message: "eventTypes cannot contain duplicates",
    }),
  description: z.string().max(240, "description too long").optional(),
  signingSecret: z.string().min(16).max(256).optional(),
});

const errorFromZod = (error: z.ZodError): string =>
  error.issues
    .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
    .join("; ");

const projectSubscription = (
  row: Awaited<ReturnType<typeof webhookRepository.getWebhookSubscription>>,
) => {
  if (!row) return null;
  return {
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
  };
};

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const rows = await webhookRepository.listWebhookSubscriptionsForUser(
      session.user.id,
    );
    return Response.json({ subscriptions: rows.map(projectSubscription) });
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

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(errorFromZod(parsed.error), { status: 400 });
  }

  const signingSecret = parsed.data.signingSecret ?? generateSigningSecret();

  // SSRF guard at registration: https only, host must resolve to a public
  // address (delivery re-checks before every attempt).
  try {
    await assertPublicWebhookUrl(parsed.data.url);
  } catch (err) {
    const message =
      err instanceof UrlBlockedError ? err.message : "url failed safety checks";
    return new Response(message, { status: 400 });
  }

  try {
    const created = await webhookRepository.createWebhookSubscription(
      {
        url: parsed.data.url,
        eventTypes: parsed.data.eventTypes,
        description: parsed.data.description ?? null,
        secretHash: hashSigningSecret(signingSecret),
        signingSecret,
        enabled: true,
      },
      session.user.id,
    );

    return Response.json(
      {
        subscription: projectSubscription(created),
        signingSecret,
      },
      { status: 201 },
    );
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}
