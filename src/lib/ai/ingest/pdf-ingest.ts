import { Buffer } from "node:buffer";
import { extractText } from "unpdf";
import { ChatAttachment } from "app-types/chat";
import { storageKeyFromUrl } from "@/lib/file-storage/storage-utils";

type PdfPreviewPart = {
  type: "text";
  text: string;
  ingestionPreview: true;
};

export type DownloadFile = (key: string) => Promise<Buffer>;

const isPdfAttachment = (attachment: ChatAttachment, key: string) => {
  const mediaType = attachment.mediaType || "";
  if (mediaType === "application/pdf") return true;
  const name = (attachment.filename || key || "").toLowerCase();
  if (/\.(pdf)$/.test(name)) return true;
  if (
    /(^|[?&])contentType=application\/pdf(&|$)/i.test(attachment.url || "") ||
    /(^|[?&])content-type=application\/pdf(&|$)/i.test(attachment.url || "")
  ) {
    return true;
  }
  return false;
};

/**
 * Extract text from a PDF buffer using unpdf.
 *
 * Handles compressed/deflated streams and modern PDFs reliably.
 * May not work for scanned/image-only PDFs.
 */
const extractPdfText = async (buffer: Buffer): Promise<string> => {
  const { text } = await extractText(new Uint8Array(buffer));
  const joined = Array.isArray(text) ? text.join(" ") : text;
  return joined.replace(/\s+/g, " ").trim();
};

const formatPdfPreviewText = (
  filename: string,
  text: string,
  maxChars: number = 8000,
): string => {
  const truncated =
    text.length > maxChars ? text.slice(0, maxChars) + "\n[…truncated]" : text;

  return [
    `📄 PDF file: "${filename}"`,
    "",
    "--- Extracted text content ---",
    truncated || "(No extractable text found in this PDF)",
    "--- End of PDF content ---",
  ].join("\n");
};

export const buildPdfIngestionPreviewParts = async (
  attachments: ChatAttachment[],
  download: DownloadFile,
): Promise<PdfPreviewPart[]> => {
  if (!attachments?.length) return [];
  const results = await Promise.all(
    attachments.map(async (attachment) => {
      // Accept both "file" and "source-url" attachment types
      if (attachment.type !== "file" && attachment.type !== "source-url")
        return null;
      const key = storageKeyFromUrl(attachment.url);
      if (!key) return null;
      if (!isPdfAttachment(attachment, key)) return null;

      try {
        const buffer = await download(key);
        const text = await extractPdfText(buffer);
        const preview = formatPdfPreviewText(attachment.filename || key, text);
        return {
          type: "text" as const,
          text: preview,
          ingestionPreview: true as const,
        };
      } catch (_error) {
        // Graceful fallback: note the file was attached but couldn't be read
        return {
          type: "text" as const,
          text: `📄 PDF file: "${attachment.filename || key}" was attached but could not be read.`,
          ingestionPreview: true as const,
        };
      }
    }),
  );

  return results.filter(Boolean) as PdfPreviewPart[];
};
