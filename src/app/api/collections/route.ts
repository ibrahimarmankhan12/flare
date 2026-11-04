import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import { collectionRepository } from "lib/db/repository";
import { z } from "zod";

// ---------------------------------------------------------------------------
// P2.1 follow-up — /api/collections (knowledge base)
// ---------------------------------------------------------------------------
//   GET   /api/collections   list the caller's collections
//   POST  /api/collections   create a collection
//
// Item ingest lives at /api/collections/[id]/items.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

const createBodySchema = z.object({
  name: z.string().min(1, "name is required").max(128, "name too long"),
  description: z.string().max(1000).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const collections = await collectionRepository.listCollections(
      session.user.id,
    );
    return Response.json({ collections });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) {
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
    return Response.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const collection = await collectionRepository.createCollection(
      { name: parsed.data.name, description: parsed.data.description ?? null },
      session.user.id,
    );
    return Response.json({ collection }, { status: 201 });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}
