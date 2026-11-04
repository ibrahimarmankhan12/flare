import type { ChatAttachment } from "app-types/chat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const attachmentFactory = (
  overrides: Partial<ChatAttachment> = {},
): ChatAttachment => ({
  type: "file",
  url: "https://example.com/uploads/document.pdf",
  mediaType: "application/pdf",
  filename: "document.pdf",
  ...overrides,
});

describe("buildKonvOVisionIngestionPreviewParts", () => {
  const originalEnv = {
    KONVO_OCR_API_KEY: process.env.KONVO_OCR_API_KEY,
    KONVO_AI_API: process.env.KONVO_AI_API,
  };

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    delete process.env.KONVO_OCR_API_KEY;
    delete process.env.KONVO_AI_API;
  });

  afterEach(() => {
    if (originalEnv.KONVO_OCR_API_KEY === undefined) {
      delete process.env.KONVO_OCR_API_KEY;
    } else {
      process.env.KONVO_OCR_API_KEY = originalEnv.KONVO_OCR_API_KEY;
    }

    if (originalEnv.KONVO_AI_API === undefined) {
      delete process.env.KONVO_AI_API;
    } else {
      process.env.KONVO_AI_API = originalEnv.KONVO_AI_API;
    }
  });

  it("returns empty results when no KonvO API key is configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { buildKonvOVisionIngestionPreviewParts } = await import(
      "./konvo-vision-ingest"
    );

    const result = await buildKonvOVisionIngestionPreviewParts(
      [attachmentFactory()],
      vi.fn(async () => Buffer.from("file-data")),
    );

    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("extracts OCR preview text for supported attachments", async () => {
    process.env.KONVO_OCR_API_KEY = "test-key";

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ job_id: "job-123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            upload_urls: {
              "document.pdf": {
                url: "https://upload.example.com/signed",
                method: "PUT",
              },
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ job_state: "Queued" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ job_state: "Completed" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            download_urls: {
              result: "https://download.example.com/output.md",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response("# OCR Result\n\nInvoice total is 1200 INR.", {
          status: 200,
          headers: { "Content-Type": "text/markdown" },
        }),
      );

    const downloadMock = vi.fn(async () => Buffer.from("pdf-bytes"));

    const { buildKonvOVisionIngestionPreviewParts } = await import(
      "./konvo-vision-ingest"
    );

    const result = await buildKonvOVisionIngestionPreviewParts(
      [attachmentFactory()],
      downloadMock,
    );

    expect(result).toHaveLength(1);
    expect(result[0].attachmentUrl).toBe(
      "https://example.com/uploads/document.pdf",
    );
    expect(result[0].part.type).toBe("text");
    expect(result[0].part.ingestionPreview).toBe(true);
    expect(result[0].part.text).toContain('OCR file: "document.pdf"');
    expect(result[0].part.text).toContain("Invoice total is 1200 INR.");
    expect(downloadMock).toHaveBeenCalledWith("uploads/document.pdf");
  });
});
