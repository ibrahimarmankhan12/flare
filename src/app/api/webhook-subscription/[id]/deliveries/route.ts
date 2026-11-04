import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import { webhookRepository } from "lib/db/repository";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

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
    const subscription = await webhookRepository.getWebhookSubscription(
      id,
      session.user.id,
    );
    if (!subscription) {
      return new Response("Not found", { status: 404 });
    }

    const rows = await webhookRepository.listWebhookDeliveriesForSubscription(
      id,
      session.user.id,
    );

    return Response.json({
      deliveries: rows.map(({ delivery, event }) => ({
        id: delivery.id,
        status: delivery.status,
        attempts: delivery.attempts,
        lastError: delivery.lastError ?? null,
        deliveredAt: delivery.deliveredAt ?? null,
        createdAt: delivery.createdAt,
        updatedAt: delivery.updatedAt,
        event: {
          id: event.id,
          kind: event.kind,
          eventType: event.eventType,
          payload: event.payload,
          status: event.status,
          attempts: event.attempts,
          maxAttempts: event.maxAttempts,
          lastError: event.lastError ?? null,
          createdAt: event.createdAt,
        },
      })),
    });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}
