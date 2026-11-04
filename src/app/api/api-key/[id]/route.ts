import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import { apiKeyRepository } from "lib/db/repository";
import { z } from "zod";

// ---------------------------------------------------------------------------
// P3.3 — /api/api-key/[id] (#24 Public REST + API keys)
// ---------------------------------------------------------------------------
// Session-authenticated get / patch / delete for a single key. The hash
// is never returned. Soft-revoke via DELETE (sets `revokedAt`).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const patchBodySchema = z.object({
  name: z.string().min(1).max(64).optional(),
  scopes: z
    .array(z.string().min(1).max(64))
    .optional()
    .refine((arr) => !arr || arr.every((s) => s.length > 0), {
      message: "scopes cannot contain empty strings",
    }),
});

/**
 * GET /api/api-key/[id]
 *
 * Returns the metadata for one key. 404 if it does not exist or is not
 * owned by the calling user. The hash is never included.
 */
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
    const row = await apiKeyRepository.getApiKey(id, session.user.id);
    if (!row) {
      return new Response("Not found", { status: 404 });
    }
    return Response.json({
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      scopes: row.scopes ?? [],
      lastFour: row.lastFour ?? null,
      lastUsedAt: row.lastUsedAt ?? null,
      expiresAt: row.expiresAt ?? null,
      revokedAt: row.revokedAt ?? null,
      createdAt: row.createdAt,
    });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}

/**
 * PATCH /api/api-key/[id]
 *
 * Body: `{ name?, scopes? }` — both optional but at least one must be
 * present. 404 if the key is not owned by the caller.
 */
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
    return new Response(
      parsed.error.issues
        .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
        .join("; "),
      { status: 400 },
    );
  }
  if (parsed.data.name === undefined && parsed.data.scopes === undefined) {
    return new Response("At least one of `name` or `scopes` is required", {
      status: 400,
    });
  }

  try {
    const updated = await apiKeyRepository.updateApiKey(
      id,
      session.user.id,
      parsed.data,
    );
    if (!updated) {
      return new Response("Not found", { status: 404 });
    }
    return Response.json({
      id: updated.id,
      name: updated.name,
      prefix: updated.prefix,
      scopes: updated.scopes ?? [],
      lastFour: updated.lastFour ?? null,
      lastUsedAt: updated.lastUsedAt ?? null,
      expiresAt: updated.expiresAt ?? null,
      revokedAt: updated.revokedAt ?? null,
      createdAt: updated.createdAt,
    });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}

/**
 * DELETE /api/api-key/[id]
 *
 * Soft-revoke. Sets `revokedAt` to now. The row is retained for audit.
 * 404 if not owned OR if already revoked (idempotency-friendly — a
 * second DELETE on the same key reports 404 because the repository's
 * `revokeApiKey` only matches active rows).
 */
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
    const revoked = await apiKeyRepository.revokeApiKey(id, session.user.id);
    if (!revoked) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}
