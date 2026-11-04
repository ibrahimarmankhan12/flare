import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import { apiKeyRepository, apiUsageRepository } from "lib/db/repository";
import { z } from "zod";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export async function GET(request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return new Response(
      parsed.error.issues
        .map((i) => `${i.path.join(".") || "query"}: ${i.message}`)
        .join("; "),
      { status: 400 },
    );
  }

  try {
    const key = await apiKeyRepository.getApiKeyUsageSafeFields(
      id,
      session.user.id,
    );
    if (!key) {
      return new Response("Not found", { status: 404 });
    }

    const rows = await apiUsageRepository.summarizeApiKeyUsage(
      id,
      session.user.id,
      parsed.data.days,
    );
    const totals = rows.reduce(
      (acc, row) => ({
        requests: acc.requests + row.requests,
        costUnits: acc.costUnits + row.costUnits,
      }),
      { requests: 0, costUnits: 0 },
    );

    return Response.json({
      key,
      days: parsed.data.days,
      totals,
      usage: rows,
    });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}
