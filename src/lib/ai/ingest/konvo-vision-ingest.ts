import { Buffer } from "node:buffer";
import { inflateRawSync } from "node:zlib";
import { storageKeyFromUrl } from "@/lib/file-storage/storage-utils";
import type { ChatAttachment } from "app-types/chat";
import { colorize } from "consola/utils";
import globalLogger from "logger";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", "KonvO Vision Ingest: "),
});

const KONVO_DOC_INTELLIGENCE_BASE =
  "https://api.konvo.ai/doc-digitization/job/v1";

const OCR_SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

const OCR_SUPPORTED_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg"]);

const TERMINAL_JOB_STATES = new Set([
  "Completed",
  "PartiallyCompleted",
  "Failed",
]);

type OcrPreviewPart = {
  type: "text";
  text: string;
  ingestionPreview: true;
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type KonvOOcrResult = {
  attachmentUrl: string;
  part: OcrPreviewPart;
};

type PresignedUrlDetails = {
  url: string;
  method: string;
  headers: Record<string, string>;
  fields: Record<string, string>;
};

type KonvOStatus = {
  job_id?: string;
  job_state?: string;
  error_message?: string;
};

export type DownloadFile = (key: string) => Promise<Buffer>;

const MAX_OCR_ATTACHMENTS =
  process.env.KONVO_OCR_MAX_ATTACHMENTS != null
    ? parseInt(process.env.KONVO_OCR_MAX_ATTACHMENTS, 10)
    : 3;

const OCR_POLL_INTERVAL_MS =
  process.env.KONVO_OCR_POLL_INTERVAL_MS != null
    ? parseInt(process.env.KONVO_OCR_POLL_INTERVAL_MS, 10)
    : 1800;

const OCR_MAX_WAIT_MS =
  process.env.KONVO_OCR_MAX_WAIT_MS != null
    ? parseInt(process.env.KONVO_OCR_MAX_WAIT_MS, 10)
    : 45000;

const OCR_MAX_TEXT_CHARS =
  process.env.KONVO_OCR_MAX_TEXT_CHARS != null
    ? parseInt(process.env.KONVO_OCR_MAX_TEXT_CHARS, 10)
    : 12000;

const parseJsonSafe = <T>(text: string): T | null => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

const normalizeMimeType = (mime?: string) =>
  (mime || "").split(";")[0].trim().toLowerCase();

const normalizeFilename = (value: string) =>
  value
    .replace(/[^\w.\-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");

const getAttachmentExtension = (filename: string) =>
  filename.split(".").pop()?.toLowerCase() || "";

const inferAttachmentFilename = (
  attachment: ChatAttachment,
  storageKey?: string | null,
) => {
  if (attachment.filename?.trim()) {
    return normalizeFilename(attachment.filename.trim());
  }

  if (storageKey?.trim()) {
    const keyName = storageKey.split("/").pop() || storageKey;
    return normalizeFilename(keyName);
  }

  return "";
};

const getAttachmentKind = (
  attachment: ChatAttachment,
  storageKey?: string | null,
) => {
  const normalizedMimeType = normalizeMimeType(attachment.mediaType);
  if (OCR_SUPPORTED_MIME_TYPES.has(normalizedMimeType)) {
    return {
      supported: true,
      mimeType: normalizedMimeType,
    };
  }

  const inferredFilename = inferAttachmentFilename(attachment, storageKey);
  const extension = getAttachmentExtension(inferredFilename);
  if (!OCR_SUPPORTED_EXTENSIONS.has(extension)) {
    return {
      supported: false,
      mimeType: normalizedMimeType,
    };
  }

  if (extension === "pdf") {
    return {
      supported: true,
      mimeType: "application/pdf",
    };
  }

  return {
    supported: true,
    mimeType: extension === "png" ? "image/png" : "image/jpeg",
  };
};

const isKonvOOcrCandidate = (
  attachment: ChatAttachment,
  storageKey?: string | null,
) => {
  if (attachment.type !== "file" && attachment.type !== "source-url") {
    return false;
  }
  return getAttachmentKind(attachment, storageKey).supported;
};

const sanitizeHeaders = (
  input: Record<string, unknown>,
): Record<string, string> => {
  return Object.entries(input).reduce(
    (acc, [key, value]) => {
      if (typeof value === "string" && value.length > 0) {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, string>,
  );
};

const extractPresignedUrl = (value: unknown): PresignedUrlDetails | null => {
  if (typeof value === "string" && value.startsWith("http")) {
    return {
      url: value,
      method: "PUT",
      headers: {},
      fields: {},
    };
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const url =
    (typeof record.url === "string" && record.url) ||
    (typeof record.upload_url === "string" && record.upload_url) ||
    (typeof record.download_url === "string" && record.download_url) ||
    (typeof record.presigned_url === "string" && record.presigned_url) ||
    Object.values(record).find(
      (item): item is string =>
        typeof item === "string" && item.startsWith("http"),
    ) ||
    null;

  if (!url) return null;

  const method =
    typeof record.method === "string" && record.method
      ? record.method.toUpperCase()
      : "PUT";

  const headers =
    typeof record.headers === "object" && record.headers !== null
      ? sanitizeHeaders(record.headers as Record<string, unknown>)
      : {};

  const fields =
    typeof record.fields === "object" && record.fields !== null
      ? sanitizeHeaders(record.fields as Record<string, unknown>)
      : {};

  return {
    url,
    method,
    headers,
    fields,
  };
};

const parseTextFromUnknownJson = (value: Json): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => parseTextFromUnknownJson(entry))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  const preferredKeys = ["text", "content", "markdown", "html", "value"];
  for (const key of preferredKeys) {
    const candidate = value[key];
    if (candidate != null) {
      const parsed = parseTextFromUnknownJson(candidate);
      if (parsed) return parsed;
    }
  }

  return JSON.stringify(value, null, 2);
};

const isZipBuffer = (buffer: Buffer) =>
  buffer.length >= 4 &&
  buffer[0] === 0x50 &&
  buffer[1] === 0x4b &&
  (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
  (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08);

const isTextLikeFileName = (name: string) =>
  /\.(md|markdown|txt|html|json|csv|xml)$/i.test(name);

const extractTextEntriesFromZip = (buffer: Buffer): string[] => {
  const entries: string[] = [];
  let offset = 0;
  const maxEntries = 20;

  while (offset + 30 <= buffer.length && entries.length < maxEntries) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;

    const flags = buffer.readUInt16LE(offset + 6);
    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);

    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    if (fileNameEnd > buffer.length) break;
    const fileName = buffer.toString("utf8", fileNameStart, fileNameEnd);

    const dataStart = fileNameEnd + extraFieldLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) break;

    if (flags & 0x08) {
      // Data descriptor mode is uncommon for our OCR outputs; skip unsupported entry.
      offset = dataEnd;
      continue;
    }

    const compressedData = buffer.slice(dataStart, dataEnd);
    let plainData: Buffer | null = null;

    if (compressionMethod === 0) {
      plainData = compressedData;
    } else if (compressionMethod === 8) {
      try {
        plainData = inflateRawSync(compressedData);
      } catch {
        plainData = null;
      }
    }

    if (plainData && isTextLikeFileName(fileName)) {
      const text = plainData.toString("utf8").trim();
      if (text) {
        entries.push(`### ${fileName}\n${text}`);
      }
    }

    offset = dataEnd;
  }

  return entries;
};

const getTextFromOutputBuffer = (buffer: Buffer): string => {
  if (isZipBuffer(buffer)) {
    const entries = extractTextEntriesFromZip(buffer);
    if (entries.length > 0) {
      return entries.join("\n\n").trim();
    }
  }

  const rawText = buffer.toString("utf8").trim();
  if (!rawText) return "";

  const parsedJson = parseJsonSafe<Json>(rawText);
  if (parsedJson !== null) {
    return parseTextFromUnknownJson(parsedJson).trim();
  }

  return rawText;
};

const truncateText = (text: string, maxChars: number) => {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[...truncated]`;
};

const formatOcrPreviewText = (filename: string, extractedText: string) => {
  return [
    `🧠 OCR file: "${filename}"`,
    "Source: KonvO Vision Document Intelligence",
    "",
    "--- Extracted text content ---",
    extractedText || "(No extractable text found)",
    "--- End of OCR content ---",
  ].join("\n");
};

const createKonvOHeaders = (apiKey: string, hasJsonBody: boolean) => {
  const headers: Record<string, string> = {
    "api-subscription-key": apiKey,
  };
  if (hasJsonBody) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
};

const requestKonvOJson = async <T>(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  const response = await fetch(`${KONVO_DOC_INTELLIGENCE_BASE}${path}`, {
    ...init,
    headers: {
      ...createKonvOHeaders(
        apiKey,
        init.body !== undefined &&
          !(init.body instanceof FormData) &&
          !(init.body instanceof URLSearchParams),
      ),
      ...(init.headers || {}),
    },
  });

  const rawBody = await response.text();
  const parsed = parseJsonSafe<T>(rawBody);
  if (!response.ok) {
    const details =
      parsed && typeof parsed === "object"
        ? JSON.stringify(parsed)
        : rawBody.slice(0, 300);
    throw new Error(`KonvO API error (${response.status}): ${details}`);
  }
  if (parsed == null) {
    throw new Error("KonvO API returned invalid JSON");
  }
  return parsed;
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const waitForKonvOCompletion = async (
  apiKey: string,
  jobId: string,
): Promise<KonvOStatus> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= OCR_MAX_WAIT_MS) {
    const status = await requestKonvOJson<KonvOStatus>(
      apiKey,
      `/${jobId}/status`,
      {
        method: "GET",
      },
    );

    const state = status.job_state || "";
    if (TERMINAL_JOB_STATES.has(state)) {
      return status;
    }

    await wait(Math.max(0, OCR_POLL_INTERVAL_MS));
  }

  throw new Error("KonvO OCR timed out while waiting for completion");
};

const uploadToPresignedUrl = async (
  presigned: PresignedUrlDetails,
  buffer: Buffer,
  filename: string,
  mimeType: string,
) => {
  const method = presigned.method.toUpperCase();

  if (method === "POST" && Object.keys(presigned.fields).length > 0) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(presigned.fields)) {
      formData.append(key, value);
    }
    formData.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: mimeType }),
      filename || "document",
    );

    const response = await fetch(presigned.url, {
      method: "POST",
      headers: presigned.headers,
      body: formData,
    });
    if (!response.ok) {
      throw new Error(
        `KonvO presigned upload failed (${response.status}) for ${filename}`,
      );
    }
    return;
  }

  const response = await fetch(presigned.url, {
    method,
    headers: {
      "Content-Type": mimeType,
      ...presigned.headers,
    },
    body: new Uint8Array(buffer),
  });
  if (!response.ok) {
    throw new Error(
      `KonvO presigned upload failed (${response.status}) for ${filename}`,
    );
  }
};

const runOcrForAttachment = async (
  attachment: ChatAttachment,
  attachmentBuffer: Buffer,
  filename: string,
  mimeType: string,
  apiKey: string,
): Promise<KonvOOcrResult | null> => {
  const createJobResponse = await requestKonvOJson<{
    job_id?: string;
  }>(apiKey, "", {
    method: "POST",
    body: JSON.stringify({
      job_parameters: {
        language: "en-IN",
        output_format: "md",
      },
    }),
  });

  const jobId = createJobResponse.job_id;
  if (!jobId) {
    throw new Error("KonvO create job response is missing job_id");
  }

  const uploadLinksResponse = await requestKonvOJson<{
    upload_urls?: Record<string, unknown>;
  }>(apiKey, "/upload-files", {
    method: "POST",
    body: JSON.stringify({
      job_id: jobId,
      files: [filename],
    }),
  });

  const uploadLinkRaw =
    uploadLinksResponse.upload_urls?.[filename] ||
    (uploadLinksResponse.upload_urls &&
      Object.values(uploadLinksResponse.upload_urls)[0]) ||
    null;

  const uploadLink = extractPresignedUrl(uploadLinkRaw);
  if (!uploadLink) {
    throw new Error("KonvO upload link is missing");
  }

  await uploadToPresignedUrl(uploadLink, attachmentBuffer, filename, mimeType);

  await requestKonvOJson(apiKey, `/${jobId}/start`, {
    method: "POST",
  });

  const finalStatus = await waitForKonvOCompletion(apiKey, jobId);
  const finalState = finalStatus.job_state || "";

  if (finalState === "Failed") {
    const details = finalStatus.error_message || "Unknown OCR failure";
    throw new Error(`KonvO OCR job failed: ${details}`);
  }

  const downloadLinksResponse = await requestKonvOJson<{
    download_urls?: Record<string, unknown>;
  }>(apiKey, `/${jobId}/download-files`, {
    method: "POST",
  });

  const downloadUrls = Object.values(downloadLinksResponse.download_urls || {})
    .map((entry) => extractPresignedUrl(entry)?.url || null)
    .filter((url): url is string => typeof url === "string");

  if (!downloadUrls.length) {
    throw new Error("KonvO OCR output link is missing");
  }

  let extractedText = "";
  for (const downloadUrl of downloadUrls) {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      continue;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const text = getTextFromOutputBuffer(buffer).trim();
    if (text) {
      extractedText = text;
      break;
    }
  }

  if (!extractedText) {
    return null;
  }

  return {
    attachmentUrl: attachment.url,
    part: {
      type: "text",
      text: formatOcrPreviewText(
        filename,
        truncateText(extractedText, Math.max(1000, OCR_MAX_TEXT_CHARS)),
      ),
      ingestionPreview: true as const,
    },
  };
};

export async function buildKonvOVisionIngestionPreviewParts(
  attachments: ChatAttachment[],
  download: DownloadFile,
): Promise<KonvOOcrResult[]> {
  const apiKey = process.env.KONVO_OCR_API_KEY || process.env.KONVO_AI_API;
  if (!apiKey) return [];
  if (!attachments?.length) return [];

  const uniqueCandidates = attachments
    .filter((attachment) => attachment.url)
    .filter(
      (attachment, index, all) =>
        all.findIndex((candidate) => candidate.url === attachment.url) ===
        index,
    )
    .map((attachment) => ({
      attachment,
      storageKey: storageKeyFromUrl(attachment.url),
    }))
    .filter(({ attachment, storageKey }) =>
      isKonvOOcrCandidate(attachment, storageKey),
    )
    .slice(0, Math.max(0, MAX_OCR_ATTACHMENTS));

  const results: KonvOOcrResult[] = [];
  for (const { attachment, storageKey } of uniqueCandidates) {
    try {
      if (!storageKey) continue;

      const fileBuffer = await download(storageKey);
      if (!fileBuffer.length) continue;

      const baseFilename = inferAttachmentFilename(attachment, storageKey);
      if (!baseFilename) continue;

      const { mimeType } = getAttachmentKind(attachment, storageKey);
      const extension = getAttachmentExtension(baseFilename);
      const normalizedFilename =
        extension.length > 0
          ? baseFilename
          : `${baseFilename}.${mimeType === "application/pdf" ? "pdf" : "jpg"}`;

      const ocrResult = await runOcrForAttachment(
        attachment,
        fileBuffer,
        normalizedFilename,
        mimeType,
        apiKey,
      );

      if (ocrResult?.part?.text) {
        results.push(ocrResult);
      }
    } catch (error) {
      logger.warn("KonvO OCR failed for attachment", {
        attachmentUrl: attachment.url,
        filename: attachment.filename,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
