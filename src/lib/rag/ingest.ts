import "server-only";

import { Buffer } from "node:buffer";
import { embedBatch } from "lib/ai/memory/embed";
import { collectionRepository } from "lib/db/repository";
import logger from "logger";

import { chunkText } from "./chunk";
import { parseDocument } from "./parse";

// ---------------------------------------------------------------------------
// P2.1 follow-up — the ingest pipeline.
// ---------------------------------------------------------------------------
// raw text -> chunkText() -> embedBatch() -> document_chunk rows.
//
// The embedding model MUST match the one used at query time in
// `retrieve.ts` — both go through `lib/ai/memory/embed`, so they stay in
// lock-step by construction. (This deployment embeds via a local Ollama
// running nomic-embed-text at 768 dims.)
//
// Item status transitions: pending -> chunking -> ready | failed. A
// failure records the reason on the item so the caller can surface it
// instead of silently producing an empty knowledge base.
// ---------------------------------------------------------------------------

/** Embedding calls are batched so one document isn't N round-trips. */
const EMBED_BATCH_SIZE = 32;

/** Guard against a single paste/page blowing up embedding cost. */
export const MAX_INGEST_CHARS = 500_000;

export interface IngestTextInput {
  collectionId: string;
  text: string;
  filename?: string | null;
  sourceUrl?: string | null;
  mediaType?: string | null;
  sourceType?: "file" | "source-url";
  chunkMaxChars?: number;
  chunkOverlap?: number;
}

export interface IngestResult {
  itemId: string;
  documentId: string;
  chunks: number;
}

const embedAllChunks = async (chunks: string[]): Promise<number[][]> => {
  const out: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const slice = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const embedded = await embedBatch(slice);
    out.push(...embedded.map((e) => e.embedding));
  }
  return out;
};

/**
 * Ingest a block of already-extracted text into a collection.
 *
 * Caller is responsible for verifying the collection is owned by the
 * user — this function trusts `collectionId`.
 */
export const ingestText = async (
  input: IngestTextInput,
): Promise<IngestResult> => {
  const text = input.text.trim();
  if (text.length === 0) {
    throw new Error("ingestText: text is empty");
  }
  if (text.length > MAX_INGEST_CHARS) {
    throw new Error(
      `ingestText: text is ${text.length} chars, limit is ${MAX_INGEST_CHARS}`,
    );
  }

  const item = await collectionRepository.createCollectionItem({
    collectionId: input.collectionId,
    sourceType: input.sourceType ?? (input.sourceUrl ? "source-url" : "file"),
    sourceUrl: input.sourceUrl ?? null,
    filename: input.filename ?? null,
    mediaType: input.mediaType ?? "text/plain",
    status: "chunking",
  });

  try {
    const chunks = chunkText(text, {
      maxChars: input.chunkMaxChars,
      overlap: input.chunkOverlap,
    });
    if (chunks.length === 0) {
      throw new Error("chunker produced no chunks");
    }

    const document = await collectionRepository.createDocument(item.id, text);
    const embeddings = await embedAllChunks(chunks);

    const written = await collectionRepository.insertDocumentChunks(
      document.id,
      chunks.map((content, position) => ({
        content,
        position,
        embedding: embeddings[position]!,
      })),
    );

    await collectionRepository.updateItemStatus(item.id, "ready");
    logger.info(
      `[rag/ingest] item=${item.id} chunks=${written} chars=${text.length}`,
    );
    return { itemId: item.id, documentId: document.id, chunks: written };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Record why on the item so a half-ingested source is visible rather
    // than looking like an empty-but-successful upload.
    await collectionRepository
      .updateItemStatus(item.id, "failed", message)
      .catch(() => void 0);
    logger.error(`[rag/ingest] item=${item.id} failed: ${message}`);
    throw err;
  }
};

/**
 * Ingest an uploaded file. PDF and DOCX are parsed to text first (see
 * `parse.ts`); text-like files are decoded directly. Parse failures
 * (unsupported container, image-only PDF) throw with a user-facing
 * message before any item row is created.
 */
export const ingestFile = async (params: {
  collectionId: string;
  buffer: Buffer;
  filename: string;
  mediaType: string | null;
  chunkMaxChars?: number;
  chunkOverlap?: number;
}): Promise<IngestResult & { kind: string; pages?: number }> => {
  const parsed = await parseDocument(
    params.buffer,
    params.mediaType,
    params.filename,
  );

  const result = await ingestText({
    collectionId: params.collectionId,
    text: parsed.text,
    filename: params.filename,
    // Record what it actually was, not what the browser guessed.
    mediaType:
      parsed.kind === "pdf"
        ? "application/pdf"
        : parsed.kind === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : (params.mediaType ?? "text/plain"),
    sourceType: "file",
    chunkMaxChars: params.chunkMaxChars,
    chunkOverlap: params.chunkOverlap,
  });

  return { ...result, kind: parsed.kind, pages: parsed.pages };
};

/**
 * Fetch a URL and ingest it. Handles PDFs at a URL as well as text.
 *
 * Deliberately does NOT render JavaScript or strip HTML intelligently —
 * for real web content the project already runs a FlareCrawl/Steel fleet
 * (`CRAWL_BASE_URL`), which is the right tool for that job. This path is
 * for plain-text/markdown/JSON sources.
 */
export const ingestUrl = async (params: {
  collectionId: string;
  url: string;
  chunkMaxChars?: number;
  chunkOverlap?: number;
}): Promise<IngestResult> => {
  let parsed: URL;
  try {
    parsed = new URL(params.url);
  } catch {
    throw new Error("ingestUrl: invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("ingestUrl: only http(s) URLs are supported");
  }

  const res = await fetch(parsed.toString(), {
    headers: { "User-Agent": "Flare-KB-Ingest/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`ingestUrl: upstream returned HTTP ${res.status}`);
  }

  const mediaType =
    res.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
  const filename =
    parsed.pathname.split("/").filter(Boolean).pop() ?? parsed.hostname;

  // A URL can point at a PDF just as easily as at markdown — parse the
  // bytes rather than assuming the response is text.
  const parsedDoc = await parseDocument(
    Buffer.from(await res.arrayBuffer()),
    mediaType,
    filename,
  );

  return ingestText({
    collectionId: params.collectionId,
    text: parsedDoc.text,
    sourceUrl: parsed.toString(),
    filename,
    mediaType,
    sourceType: "source-url",
    chunkMaxChars: params.chunkMaxChars,
    chunkOverlap: params.chunkOverlap,
  });
};
