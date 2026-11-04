import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import { collectionRepository } from "lib/db/repository";

// ---------------------------------------------------------------------------
// P2.1 follow-up — /api/collections/[id]
// ---------------------------------------------------------------------------
//   GET     one collection + its items (with chunk counts)
//   DELETE  the collection (cascades to items -> documents -> chunks)
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;

  try {
    const collection = await collectionRepository.getCollection(
      id,
      session.user.id,
    );
    // Same 404 for "missing" and "not yours" so the endpoint can't be
    // used to probe for other users' collection ids.
    if (!collection) {
      return new Response("Not found", { status: 404 });
    }

    const items = await collectionRepository.listCollectionItems(id);
    const counts = await collectionRepository.countChunksForItems(
      items.map((i) => i.id),
    );
    return Response.json({
      collection,
      items: items.map((i) => ({ ...i, chunkCount: counts[i.id] ?? 0 })),
    });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;

  try {
    const deleted = await collectionRepository.deleteCollection(
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
