import "server-only";

import { Buffer } from "node:buffer";

// ---------------------------------------------------------------------------
// Knowledge base document parsing.
// ---------------------------------------------------------------------------
// Turns an uploaded file into plain text for the ingest pipeline.
//
//   PDF   -> LiteParse (@llamaindex/liteparse). Chosen over unpdf after
//            measuring both: on a text-layer PDF they are equivalent, but
//            on a scanned/image-only PDF unpdf returns an empty string
//            while LiteParse's bundled Tesseract OCR recovers the text.
//            Scanned documents are exactly what people drop into a
//            knowledge base, so silent empty ingests were the failure
//            mode worth designing out.
//   DOCX  -> mammoth. LiteParse *can* read Office formats, but it does so
//            by shelling out to LibreOffice ("LibreOffice is not
//            installed" if absent) — a ~500MB system dependency for a
//            format mammoth handles natively in-process.
//   text  -> decoded as UTF-8.
//
// `lib/ai/ingest/pdf-ingest.ts` (chat attachments) still uses unpdf; it
// is a separate, latency-sensitive preview path and is left alone.
//
// Legacy .doc (OLE compound binary, pre-2007) is NOT DOCX and mammoth
// cannot read it; it is rejected explicitly so the user isn't left
// wondering why their file produced garbage.
// ---------------------------------------------------------------------------

export const PDF_MEDIA_TYPE = "application/pdf";
export const DOCX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const LEGACY_DOC_MEDIA_TYPE = "application/msword";

const TEXT_MEDIA_PATTERN =
  /^text\/|application\/(json|xml|x-yaml|yaml|markdown|javascript|typescript)/i;

export type ParsedKind = "pdf" | "docx" | "text";

export interface ParsedDocument {
  text: string;
  kind: ParsedKind;
  /** Page count for PDFs; undefined for other formats. */
  pages?: number;
}

const extensionOf = (filename: string | null | undefined): string =>
  (filename ?? "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

/**
 * Decide how to parse. Content-type is authoritative when it is
 * specific, but browsers routinely send `application/octet-stream` for
 * .md/.docx, so the filename extension is a fallback rather than an
 * afterthought.
 */
export const resolveParsedKind = (
  mediaType: string | null | undefined,
  filename?: string | null,
): ParsedKind | "unsupported" => {
  const type = (mediaType ?? "").toLowerCase().split(";")[0]!.trim();
  const ext = extensionOf(filename);

  if (type === PDF_MEDIA_TYPE || ext === "pdf") return "pdf";
  if (type === DOCX_MEDIA_TYPE || ext === "docx") return "docx";
  // .doc is a different container entirely — reject rather than mangle.
  if (type === LEGACY_DOC_MEDIA_TYPE || ext === "doc") return "unsupported";
  if (type && TEXT_MEDIA_PATTERN.test(type)) return "text";
  if (
    [
      "txt",
      "md",
      "markdown",
      "json",
      "csv",
      "tsv",
      "yaml",
      "yml",
      "log",
    ].includes(ext)
  ) {
    return "text";
  }
  // Unknown/absent content-type with no useful extension: treat as text
  // only when nothing suggests a binary container.
  if (!type || type === "application/octet-stream") {
    return ext ? "unsupported" : "text";
  }
  return "unsupported";
};

/** Reused across calls — constructing it loads the native binding. */
let liteParser: any = null;

const getPdfParser = async () => {
  if (liteParser) return liteParser;
  const { LiteParse } = await import("@llamaindex/liteparse");
  liteParser = new LiteParse({
    ocrEnabled: true,
    // Default is fatal: one flaky OCR pass would then discard a PDF
    // whose text layer parsed perfectly well. Prefer partial success.
    ocrFailureFatal: false,
    quiet: true,
  });
  return liteParser;
};

const parsePdf = async (buffer: Buffer): Promise<ParsedDocument> => {
  const parser = await getPdfParser();
  const result = await parser.parse(buffer);
  const cleaned = String(result?.text ?? "")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (!cleaned) {
    throw new Error(
      "No extractable text found in this PDF, even after OCR. It may be blank, or scanned at too low a resolution to read.",
    );
  }
  return {
    text: cleaned,
    kind: "pdf",
    pages: Array.isArray(result?.pages) ? result.pages.length : undefined,
  };
};

const parseDocx = async (buffer: Buffer): Promise<ParsedDocument> => {
  // Imported lazily so the dependency only loads when a DOCX actually
  // arrives, keeping it out of the common text/PDF path.
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer });
  const cleaned = value.replace(/[ \t ]+/g, " ").trim();
  if (!cleaned) {
    throw new Error("No extractable text found in this document.");
  }
  return { text: cleaned, kind: "docx" };
};

/**
 * Parse an uploaded file into plain text.
 *
 * Throws with a user-facing message for unsupported containers and for
 * files that contain no extractable text.
 */
export const parseDocument = async (
  buffer: Buffer,
  mediaType: string | null | undefined,
  filename?: string | null,
): Promise<ParsedDocument> => {
  const kind = resolveParsedKind(mediaType, filename);

  switch (kind) {
    case "pdf":
      return parsePdf(buffer);
    case "docx":
      return parseDocx(buffer);
    case "text": {
      const text = buffer.toString("utf8");
      // A binary file mislabelled as text decodes to replacement chars;
      // catching it here beats storing mojibake and embedding noise.
      const replacementRatio =
        (text.match(/�/g)?.length ?? 0) / Math.max(text.length, 1);
      if (replacementRatio > 0.1) {
        throw new Error(
          "This file doesn't look like text. Supported formats: PDF, DOCX, and plain-text files.",
        );
      }
      return { text: text.trim(), kind: "text" };
    }
    default:
      throw new Error(
        `Unsupported file type${mediaType ? ` "${mediaType}"` : ""}. Supported: PDF, DOCX, and text files (txt, md, json, csv, yaml). Legacy .doc isn't supported — save as .docx.`,
      );
  }
};

/** True when the media type / filename is something we can parse. */
export const isParseableDocument = (
  mediaType: string | null | undefined,
  filename?: string | null,
): boolean => resolveParsedKind(mediaType, filename) !== "unsupported";
