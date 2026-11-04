import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import { generateApiKey } from "lib/auth/api-key";
import { apiKeyRepository } from "lib/db/repository";
import { z } from "zod";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const rotateBodySchema = z.object({
  graceHours: z.number().int().min(1).max(168).optional().default(24),
});

export async function POST(request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

  let raw: unknown = {};
  const text = await request.text();
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }
  }

  const parsed = rotateBodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(
      parsed.error.issues
        .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
        .join("; "),
      { status: 400 },
    );
  }

  try {
    const oldKey = await apiKeyRepository.getApiKey(id, session.user.id);
    if (!oldKey || oldKey.revokedAt) {
      return new Response("Not found", { status: 404 });
    }

    const { fullKey, prefix, hash } = generateApiKey();
    const graceEndsAt = new Date(
      Date.now() + parsed.data.graceHours * 60 * 60 * 1000,
    );
    const created = await apiKeyRepository.rotateApiKey(
      id,
      session.user.id,
      {
        name: oldKey.name,
        keyHash: hash,
        prefix,
        scopes: oldKey.scopes ?? [],
        expiresAt: oldKey.expiresAt ?? null,
        lastFour: fullKey.slice(-4),
      },
      graceEndsAt,
    );

    return Response.json(
      {
        id: created.id,
        fullKey,
        prefix: created.prefix,
        scopes: created.scopes ?? [],
        expiresAt: created.expiresAt ?? null,
        rotatedFromKeyId: created.rotatedFromKeyId,
        rotationGraceEndsAt: graceEndsAt,
        createdAt: created.createdAt,
      },
      { status: 201 },
    );
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}
