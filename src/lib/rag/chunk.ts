/**
 * Recursive character text splitter for the RAG ingestion pipeline (P2.2).
 *
 * Splits a blob of text into overlapping chunks of roughly `maxChars`
 * characters. The strategy mirrors the LangChain "RecursiveCharacterTextSplitter"
 * pattern: try the coarsest separator first (`\n\n` -> paragraph), and if a
 * resulting piece is still too long, recurse into it with a finer separator.
 *
 *   1. `\n\n`   paragraph breaks
 *   2. `\n`     single line breaks
 *   3. ` `      word boundaries
 *   4. ``       hard character split (fallback)
 *
 * The overlap is appended as a suffix of the previous chunk: every chunk
 * after the first begins with the last `overlap` characters of the previous
 * chunk. This preserves boundary context (a sentence split across two
 * chunks will appear in full in the second chunk) at the cost of chunks
 * being slightly longer than `maxChars` after overlap is applied.
 *
 * The function is pure and side-effect-free, so it lives outside
 * `server-only` and can be exercised in unit tests without mocking the
 * environment.
 */

export const DEFAULT_CHUNK_MAX_CHARS = 1000 as const;
export const DEFAULT_CHUNK_OVERLAP = 200 as const;

/**
 * Ordered list of separators used by the recursive splitter. The empty
 * string at the end is a sentinel that means "hard split by character" and
 * must always be present.
 */
const SEPARATORS = ["\n\n", "\n", " ", ""] as const;

export interface ChunkOptions {
  /** Target upper bound for each chunk. Defaults to 1000. */
  maxChars?: number;
  /** Characters of overlap to preserve from the previous chunk. Defaults to 200. */
  overlap?: number;
}

/**
 * Split `text` into overlapping chunks. Returns an empty array for an
 * empty / whitespace-only input.
 *
 * Throws if `maxChars` is non-positive, `overlap` is negative, or `overlap`
 * is not strictly less than `maxChars` (otherwise chunks could grow
 * without bound).
 */
export function chunkText(text: string, options?: ChunkOptions): string[] {
  if (text.trim().length === 0) return [];

  const maxChars = options?.maxChars ?? DEFAULT_CHUNK_MAX_CHARS;
  const overlap = options?.overlap ?? DEFAULT_CHUNK_OVERLAP;

  if (!Number.isFinite(maxChars) || maxChars <= 0) {
    throw new Error(
      `chunkText: maxChars must be a positive number, got ${maxChars}`,
    );
  }
  if (!Number.isFinite(overlap) || overlap < 0) {
    throw new Error(`chunkText: overlap must be non-negative, got ${overlap}`);
  }
  if (overlap >= maxChars) {
    throw new Error(
      `chunkText: overlap (${overlap}) must be strictly less than maxChars (${maxChars})`,
    );
  }

  const baseChunks = recursiveSplit(text, maxChars, SEPARATORS, 0);
  return applyOverlap(baseChunks, overlap);
}

/**
 * Internal recursive splitter. Returns chunks whose length is at most
 * `maxChars`. Overlap is applied later by `applyOverlap`.
 */
function recursiveSplit(
  text: string,
  maxChars: number,
  separators: readonly string[],
  sepIndex: number,
): string[] {
  if (text.length <= maxChars) return [text];

  // Find the first separator (at or after sepIndex) that is present in the
  // text. If none of the real separators are present, we fall through to
  // the trailing "" separator which forces a hard character split.
  let chosen = sepIndex;
  while (
    chosen < separators.length - 1 &&
    !text.includes(separators[chosen]!)
  ) {
    chosen += 1;
  }
  const separator = separators[chosen]!;

  if (separator === "") {
    return hardSplit(text, maxChars);
  }

  const parts = text.split(separator);
  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    const candidate = current.length === 0 ? part : current + separator + part;

    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    // Candidate doesn't fit. Flush the current buffer (if any) and start a
    // new one. If the new `part` alone is bigger than maxChars we have to
    // recurse with a finer separator.
    if (current.length > 0) {
      chunks.push(current);
      current = "";
    }
    if (part.length > maxChars) {
      const subChunks = recursiveSplit(part, maxChars, separators, chosen + 1);
      // All but the last sub-chunk are emitted as standalone chunks; the
      // last one becomes the new `current` so it can keep accumulating.
      for (let i = 0; i < subChunks.length - 1; i += 1) {
        chunks.push(subChunks[i]!);
      }
      current = subChunks[subChunks.length - 1] ?? "";
    } else {
      current = part;
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

function hardSplit(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    chunks.push(text.slice(i, i + maxChars));
  }
  return chunks;
}

/**
 * Prefix each chunk after the first with the tail of the previous chunk
 * to maintain `overlap` characters of context across the boundary.
 */
function applyOverlap(chunks: string[], overlap: number): string[] {
  if (overlap === 0 || chunks.length <= 1) return chunks;
  const result: string[] = [chunks[0]!];
  for (let i = 1; i < chunks.length; i += 1) {
    const prev = chunks[i - 1]!;
    const tail = prev.slice(Math.max(0, prev.length - overlap));
    result.push(tail + chunks[i]!);
  }
  return result;
}
