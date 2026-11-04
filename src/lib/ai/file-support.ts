export const DEFAULT_FILE_PART_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/x-icon",
  "application/pdf",
] as const;

export const GEMINI_FILE_MIME_TYPES = [
  ...DEFAULT_FILE_PART_MIME_TYPES,
] as const;

const DEFAULT_FILE_PART_MIME_SET = new Set<string>(
  DEFAULT_FILE_PART_MIME_TYPES,
);

export const INGEST_SUPPORTED_MIME = new Set<string>([
  "text/csv",
  "application/csv",
  "application/pdf",
  // Future: xlsx when server-side parser is added
  // "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export const isFilePartSupported = (
  mime?: string,
  supportedMimeTypes?: readonly string[],
) => {
  if (!mime) return false;
  if (supportedMimeTypes !== undefined) {
    return supportedMimeTypes.includes(mime);
  }
  return DEFAULT_FILE_PART_MIME_SET.has(mime);
};

export const isIngestSupported = (mime?: string) =>
  !!mime && INGEST_SUPPORTED_MIME.has(mime);
