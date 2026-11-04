/**
 * P2.3 — RAG prompt section builder.
 *
 * Pure functions only — no DB or network imports. P2.2's
 * `retrieveRelevantChunks()` returns `RetrievedChunk[]`; this file turns
 * that array into a `<retrieved_context>` system-prompt block the LLM
 * can read. The companion `RetrievedChunk` type is the contract between
 * the retrieval layer and the prompt builder.
 *
 * Failure mode: an empty `chunks` array (or a failed retrieval upstream)
 * produces an empty string. The caller is expected to skip the section
 * append in that case so the prompt stays clean.
 *
 * P2.2 also adds `formatRetrievedContext` — a thinner, citation-only
 * formatter for callers that don't need the full `<retrieved_context>`
 * block (e.g. ad-hoc debugging or future server-rendered citation
 * panels). Both functions are pure and side-effect-free.
 */

/**
 * A chunk surfaced by `retrieveRelevantChunks`. Mirrors the columns of
 * `document_chunk` (`id`, `content`, `position`, `documentId`) joined
 * with the originating `collection_item` (`filename`, `sourceUrl`,
 * `collectionItemId`) so the prompt section can name the source. The
 * `score` is cosine similarity in `[0, 1]`, with 1 = identical.
 */
export interface RetrievedChunk {
  /** `document_chunk.id` */
  id: string;
  /** The chunk's text content. */
  content: string;
  /** Position within the document (0-indexed). */
  position: number;
  /** `document_chunk.documentId` — the logical document. */
  documentId: string;
  /** `document.id` -> `collection_item.id` link. */
  collectionItemId: string;
  /** Display name of the source (filename or URL). May be null. */
  filename: string | null;
  /** Original source URL (Vercel Blob / S3 key for uploads, or the
   *  pointed-at URL for `source-url` items). May be null. */
  sourceUrl: string | null;
  /** Cosine similarity in `[0, 1]`. */
  score: number;
}

/**
 * Options that shape the resulting prompt section.
 */
export interface FormatRetrievedContextOptions {
  /**
   * Hard cap on how many chunks go into the section. Defaults to 5
   * (matches the chat route's `topK`). The retrieval layer is already
   * expected to cap at topK, but we re-cap here to defend against
   * future callers passing raw arrays.
   */
  maxChunks?: number;
  /**
   * Per-chunk content cap, in characters. Defaults to 800. Chunks are
   * truncated with an ellipsis so the prompt section does not blow up
   * on accidentally huge chunks. 800 is chosen as a balance: long
   * enough to keep a full paragraph of context, short enough that 5
   * chunks fit comfortably under the model's context window.
   */
  maxChunkChars?: number;
}

const DEFAULT_MAX_CHUNKS = 5;
const DEFAULT_MAX_CHUNK_CHARS = 800;

const truncate = (text: string, max: number): string => {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
};

const chunkLabel = (chunk: RetrievedChunk, index: number): string => {
  const source =
    chunk.filename?.trim() ||
    chunk.sourceUrl?.trim() ||
    chunk.collectionItemId.slice(0, 8) ||
    "unknown source";
  return `[${index + 1}] ${source} (chunk ${chunk.position}, score ${chunk.score.toFixed(3)})`;
};

/**
 * Build the `<retrieved_context>` section that goes at the end of the
 * chat system prompt. Returns an empty string if `chunks` is empty
 * (the caller should skip the append in that case).
 *
 * The block tells the model:
 *  - it has been given authoritative source material;
 *  - the source material is from the user's own uploaded files / URLs;
 *  - to ground its answer in those chunks and cite them by index.
 *
 * The model is also told NOT to fabricate citations — only `[1]`,
 * `[2]`, ... matching a chunk index in the list are valid.
 */
export const buildRetrievedContextPromptSection = (
  chunks: RetrievedChunk[],
  options: FormatRetrievedContextOptions = {},
): string => {
  if (!Array.isArray(chunks) || chunks.length === 0) return "";

  const maxChunks = options.maxChunks ?? DEFAULT_MAX_CHUNKS;
  const maxChars = options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;
  const limited = chunks.slice(0, maxChunks);

  const block = limited
    .map((chunk, index) => {
      const label = chunkLabel(chunk, index);
      const body = truncate(chunk.content ?? "", maxChars);
      return `${label}\n${body}`;
    })
    .join("\n\n");

  return `
<retrieved_context>
The following excerpts are from the user's own uploaded files or linked source URLs. Use them to ground your answer when relevant. If you reference information from these excerpts, cite the source inline with the bracketed index (e.g. [1], [2]). Do not invent citations — only use indices that appear in the list below. If the retrieved excerpts do not contain enough information, say so explicitly rather than guessing.

${block}
</retrieved_context>`.trim();
};

// ---------------------------------------------------------------------------
// P2.2 — citation-only formatter
// ---------------------------------------------------------------------------
//
// `formatRetrievedContext` is the thin counterpart of
// `buildRetrievedContextPromptSection`: it produces a one-line-per-chunk
// citation block (e.g. `[1] chunk body…`) without the surrounding XML
// tags, header text, or source labels. Useful for:
//   - server-rendered citation panels that just need the list;
//   - debug logs that want to see what the retriever surfaced;
//   - future callers that compose their own prompt section but still
//     need a deterministic citation format.
//
// The chunk shape is the simple one returned by `retrieveRelevantChunks`
// in `retrieve.ts` — no filename / sourceUrl / position required.
// ---------------------------------------------------------------------------

export const FORMAT_DEFAULT_MAX_CHUNKS = 5;
export const FORMAT_DEFAULT_MAX_CHARS_PER_CHUNK = 800;

export interface FormatRetrievedContextOptions {
  /** Hard cap on the number of chunks to include. Defaults to 5. */
  maxChunks?: number;
  /** Per-chunk content cap, in characters. Chunks longer than this are
   *  truncated and a trailing ellipsis is appended. Defaults to 800. */
  maxCharsPerChunk?: number;
}

const truncateChunk = (text: string, max: number): string => {
  if (!text) return "";
  if (text.length <= max) return text;
  // Reserve one slot for the ellipsis so the result fits in `max` chars.
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
};

/**
 * Format a list of retrieved chunks as a flat citation block:
 *
 *   [1] First chunk content…
 *   [2] Second chunk content…
 *
 * Returns an empty string for an empty input (the caller should skip
 * the section append in that case).
 *
 * Truncation is applied per-chunk to `maxCharsPerChunk`, and the
 * returned list is capped at `maxChunks` entries.
 */
export const formatRetrievedContext = (
  chunks: RetrievedChunk[],
  options: FormatRetrievedContextOptions = {},
): string => {
  if (!Array.isArray(chunks) || chunks.length === 0) return "";

  const maxChunks = options.maxChunks ?? FORMAT_DEFAULT_MAX_CHUNKS;
  const maxChars =
    options.maxCharsPerChunk ?? FORMAT_DEFAULT_MAX_CHARS_PER_CHUNK;
  const limited = chunks.slice(0, maxChunks);

  return limited
    .map(
      (chunk, index) =>
        `[${index + 1}] ${truncateChunk(chunk.content ?? "", maxChars)}`,
    )
    .join("\n\n");
};
