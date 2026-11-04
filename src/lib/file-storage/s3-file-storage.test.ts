import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted ensures mocks are initialized before vi.mock() factories run
const mocks = vi.hoisted(() => {
  const sendMock = vi.fn();
  const generateUUID = vi.fn(() => "fixed-uuid-12345678");
  class MockS3Client {
    send = sendMock;
  }
  class MockBaseCmd {
    constructor(public input: unknown) {}
  }
  return { sendMock, generateUUID, MockS3Client, MockBaseCmd };
});

vi.mock("lib/utils", () => ({
  generateUUID: mocks.generateUUID,
}));

vi.mock("lib/file-storage/storage-utils", () => ({
  resolveStoragePrefix: vi.fn(() => process.env.FILE_STORAGE_PREFIX ?? ""),
  sanitizeFilename: (f: string) => f.split(/[/\\]/).pop() ?? "file",
  toBuffer: async (c: unknown) => {
    if (Buffer.isBuffer(c)) return c;
    return Buffer.from("test-data");
  },
}));

vi.mock("lib/errors", () => ({
  FileNotFoundError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "FileNotFoundError";
    }
  },
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: mocks.MockS3Client,
  PutObjectCommand: class extends mocks.MockBaseCmd {},
  GetObjectCommand: class extends mocks.MockBaseCmd {},
  DeleteObjectCommand: class extends mocks.MockBaseCmd {},
  HeadObjectCommand: class extends mocks.MockBaseCmd {},
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(
    async (
      _client: unknown,
      _cmd: unknown,
      { expiresIn }: { expiresIn: number },
    ) => `https://example.com/presigned?exp=${expiresIn}`,
  ),
}));

import { createS3FileStorage } from "./s3-file-storage";

describe("s3-file-storage", () => {
  beforeEach(() => {
    mocks.sendMock.mockReset();
    process.env.FILE_STORAGE_S3_BUCKET = "my-bucket";
    process.env.FILE_STORAGE_S3_REGION = "us-east-2";
    process.env.FILE_STORAGE_PREFIX = "uploads";
    delete process.env.FILE_STORAGE_S3_PUBLIC_BASE_URL;
    delete process.env.FILE_STORAGE_S3_ENDPOINT;
    delete process.env.FILE_STORAGE_S3_FORCE_PATH_STYLE;
  });

  it("uploads and returns sourceUrl + metadata", async () => {
    mocks.sendMock.mockResolvedValueOnce({});

    const storage = createS3FileStorage();
    const result = await storage.upload(
      Buffer.from("png-data"),
      { filename: "test.png", contentType: "image/png" },
    );

    // S3 virtual-hosted style URL
    expect(result.sourceUrl).toMatch(
      /^https:\/\/my-bucket\.s3\.us-east-2\.amazonaws\.com\//,
    );
    // Key ends with UUID + sanitized filename
    expect(result.metadata.key).toMatch(/fixed-uuid-12345678-test\.png$/);
    expect(result.metadata.contentType).toBe("image/png");
    expect(mocks.sendMock).toHaveBeenCalledOnce();
  });

  it("returns presigned upload URL via createUploadUrl", async () => {
    mocks.sendMock.mockResolvedValueOnce({});

    const storage = createS3FileStorage();
    expect(storage.createUploadUrl).toBeDefined();
    const url = await storage.createUploadUrl?.({
      filename: "test.png",
      contentType: "image/png",
      expiresInSeconds: 300,
    });

    expect(url?.url).toContain("example.com/presigned");
    expect(url?.key).toContain("test");
  });

  it("deletes file from S3", async () => {
    mocks.sendMock.mockResolvedValueOnce({});

    const storage = createS3FileStorage();
    await expect(storage.delete("test.png")).resolves.toBeUndefined();
    expect(mocks.sendMock).toHaveBeenCalledOnce();
  });

  it("uses custom public base URL when set", async () => {
    mocks.sendMock.mockResolvedValueOnce({});
    process.env.FILE_STORAGE_S3_PUBLIC_BASE_URL = "https://cdn.example.com/files";

    const storage = createS3FileStorage();
    const result = await storage.upload(
      Buffer.from("png-data"),
      { filename: "test.png", contentType: "image/png" },
    );
    expect(result.sourceUrl).toMatch(/^https:\/\/cdn\.example\.com\/files\//);
  });

  it("allows path traversal in custom endpoint", async () => {
    mocks.sendMock.mockResolvedValueOnce({});
    process.env.FILE_STORAGE_S3_ENDPOINT = "https://minio.local:9000";
    process.env.FILE_STORAGE_S3_FORCE_PATH_STYLE = "true";

    const storage = createS3FileStorage();
    const result = await storage.upload(
      Buffer.from("png-data"),
      { filename: "test.png", contentType: "image/png" },
    );
    expect(result.sourceUrl).toMatch(/^https:\/\/minio\.local:9000\/my-bucket\//);
  });

  it("handles S3 errors gracefully on delete", async () => {
    mocks.sendMock.mockRejectedValueOnce(new Error("S3 connection failed"));

    const storage = createS3FileStorage();
    await expect(storage.delete("test.png")).rejects.toThrow(
      "S3 connection failed",
    );
  });

  it("does not prefix keys when no prefix is set", async () => {
    mocks.sendMock.mockResolvedValueOnce({});
    delete process.env.FILE_STORAGE_PREFIX;

    const storage = createS3FileStorage();
    await storage.upload(
      Buffer.from("png-data"),
      { filename: "test.png", contentType: "image/png" },
    );
    const call = mocks.sendMock.mock.calls[0][0] as { input?: { Key?: string } };
    expect(call?.input?.Key).not.toContain("uploads/");
  });

  it("generates UUID-based unique filename", async () => {
    mocks.sendMock.mockResolvedValueOnce({});

    const storage = createS3FileStorage();
    const result = await storage.upload(
      Buffer.from("png-data"),
      { filename: "test.png", contentType: "image/png" },
    );
    // key uses fixed UUID, ends with sanitized filename
    expect(result.metadata.key).toMatch(/^fixed-uuid-12345678-test\.png$/);
  });

  it("respects custom content type header", async () => {
    mocks.sendMock.mockResolvedValueOnce({});

    const storage = createS3FileStorage();
    await storage.upload(
      Buffer.from("pdf-data"),
      { filename: "doc.pdf", contentType: "application/pdf" },
    );
    const call = mocks.sendMock.mock.calls[0][0] as {
      input?: { ContentType?: string };
    };
    expect(call?.input?.ContentType).toBe("application/pdf");
  });
});