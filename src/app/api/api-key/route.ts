import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import { generateApiKey } from "lib/auth/api-key";
import { apiKeyRepository } from "lib/db/repository";
import { z } from "zod";

// ---------------------------------------------------------------------------
// P3.3 — /api/api-key (#24 Public REST + API keys)
// ---------------------------------------------------------------------------
// Session-authenticated CRUD for the user's API keys (Better Auth, NOT
// the `Authorization: Bearer` API-key auth — that path lives under
// `/api/v1/...` and is used by external callers).
//
//   GET    /api/api-key          list active (non-revoked) keys for the user
//   POST   /api/api-key          issue a new key (returns the plaintext ONCE)
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

const createBodySchema = z.object({
  name: z.string().min(1, "name is required").max(64, "name too long"),
  scopes: z
    .array(z.string().min(1).max(64))
    .default([])
    .refine((arr) => arr.every((s) => s.length > 0), {
      message: "scopes cannot contain empty strings",
    }),
  expiresAt: z
    .string()
    .datetime()
    .optional()
    .transform((s) => (s ? new Date(s) : undefined)),
});

/**
 * GET /api/api-key
 *
 * Lists the calling user's API keys. The hash is never returned. 401
 * if unauthenticated.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const rows = await apiKeyRepository.listApiKeys(session.user.id);
    const projection = rows.map((row) => ({
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      scopes: row.scopes ?? [],
      lastFour: row.lastFour ?? null,
      lastUsedAt: row.lastUsedAt ?? null,
      expiresAt: row.expiresAt ?? null,
      revokedAt: row.revokedAt ?? null,
      createdAt: row.createdAt,
    }));
    return Response.json({ keys: projection });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}

/**
 * POST /api/api-key
 *
 * Body: `{ name, scopes, expiresAt? }`.
 * Returns 201 with `{ id, fullKey, prefix, scopes, expiresAt, createdAt }`.
 * `fullKey` is shown exactly once — there is no way to recover it from
 * the server afterwards (only the sha-256 hash is persisted).
 */
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
    return new Response(
      parsed.error.issues
        .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
        .join("; "),
      { status: 400 },
    );
  }

  const { name, scopes, expiresAt } = parsed.data;

  try {
    const { fullKey, prefix, hash } = generateApiKey();
    const created = await apiKeyRepository.createApiKey(
      {
        name,
        keyHash: hash,
        prefix,
        scopes,
        lastFour: fullKey.slice(-4),
        ...(expiresAt ? { expiresAt } : {}),
      },
      session.user.id,
    );

    return Response.json(
      {
        id: created.id,
        fullKey,
        prefix: created.prefix,
        scopes: created.scopes ?? [],
        lastFour: fullKey.slice(-4),
        expiresAt: created.expiresAt ?? null,
        createdAt: created.createdAt,
      },
      { status: 201 },
    );
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}
