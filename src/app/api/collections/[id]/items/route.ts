import "server-only";

import { Buffer } from "node:buffer";
import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import { collectionRepository } from "lib/db/repository";
import { ingestFile, ingestText, ingestUrl } from "lib/rag/ingest";
import { isParseableDocument } from "lib/rag/parse";
import { z } from "zod";

// ---------------------------------------------------------------------------
// P2.1 follow-up — /api/collections/[id]/items (ingest)
// ---------------------------------------------------------------------------
// Three ways in, all landing in the same chunk -> embed -> store pipeline:
//
//   1. JSON  { text, filename? }   paste / programmatic
//   2. JSON  { url }               fetch a text-like URL
//   3. multipart/form-data  file=  upload PDF / DOCX / text
//
// PDF and DOCX are parsed to text in `lib/rag/parse.ts` before chunking.
// Containers we can't read (legacy .doc, images) are rejected with 415
// rather than silently stored as mojibake.
//
// Ingest is synchronous: the caller gets the chunk count back. Large
// sources are capped by MAX_INGEST_CHARS. If this ever needs to handle
// slow multi-MB sources, the natural move is to enqueue onto the
// existing webhook outbox / worker tick rather than hold the request.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const jsonBodySchema = z.union([
  z.object({
    text: z.string().min(1, "text is required"),
    filename: z.string().max(255).optional(),
  }),
  z.object({ url: z.string().url("url must be a valid URL") }),
]);

/** PDFs of any substance run past 5MB; OCR is the slow part, not size. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

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
    if (!collection) return new Response("Not found", { status: 404 });

    const items = await collectionRepository.listCollectionItems(id);
    const counts = await collectionRepository.countChunksForItems(
      items.map((i) => i.id),
    );
    return Response.json({
      items: items.map((i) => ({ ...i, chunkCount: counts[i.id] ?? 0 })),
    });
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;

  // Ownership first — everything below writes through this collection id.
  const collection = await collectionRepository.getCollection(
    id,
    session.user.id,
  );
  if (!collection) {
    return new Response("Not found", { status: 404 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  try {
    // --- multipart upload ------------------------------------------------
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return Response.json(
          { error: "form field 'file' is required" },
          { status: 400 },
        );
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return Response.json(
          { error: `file too large (max ${MAX_UPLOAD_BYTES} bytes)` },
          { status: 413 },
        );
      }
      const mediaType = file.type || null;
      if (!isParseableDocument(mediaType, file.name)) {
        return Response.json(
          {
            error: `Unsupported file type${mediaType ? ` "${mediaType}"` : ""}`,
            message:
              "Supported: PDF, DOCX, and text files (txt, md, json, csv, yaml). Legacy .doc isn't supported — save as .docx.",
          },
          { status: 415 },
        );
      }
      const result = await ingestFile({
        collectionId: id,
        buffer: Buffer.from(await file.arrayBuffer()),
        filename: file.name,
        mediaType,
      });
      return Response.json(result, { status: 201 });
    }

    // --- JSON: text or url ----------------------------------------------
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }

    const parsed = jsonBodySchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid body", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const result =
      "url" in parsed.data
        ? await ingestUrl({ collectionId: id, url: parsed.data.url })
        : await ingestText({
            collectionId: id,
            text: parsed.data.text,
            filename: parsed.data.filename ?? null,
            sourceType: "file",
          });

    return Response.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Caller-fixable ingest failures (empty, too large, bad URL,
    // unsupported type) are 400s, not 500s.
    if (
      message.includes("is empty") ||
      message.includes("limit is") ||
      message.includes("invalid URL") ||
      message.includes("only http") ||
      message.includes("unsupported content-type") ||
      message.includes("upstream returned") ||
      message.includes("Unsupported file type") ||
      message.includes("No extractable text") ||
      message.includes("doesn't look like text")
    ) {
      return Response.json({ error: message }, { status: 400 });
    }
    return new Response(handleError(err), { status: 500 });
  }
}
