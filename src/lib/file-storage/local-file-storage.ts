import { promises as fs } from "node:fs";
import path from "node:path";
import { FileNotFoundError } from "lib/errors";
import { generateUUID } from "lib/utils";
import logger from "logger";
import type {
  FileMetadata,
  FileStorage,
  UploadOptions,
} from "./file-storage.interface";
import {
  getContentTypeFromFilename,
  resolveStoragePrefix,
  sanitizeFilename,
  toBuffer,
} from "./storage-utils";

const STORAGE_PREFIX = resolveStoragePrefix();

/**
 * On-disk file storage. Self-hosted alternative to Vercel Blob / S3 — no cloud
 * credentials required. Files are written under FILE_STORAGE_LOCAL_DIR and
 * served publicly by the `/api/files/[...path]` route on the app's own domain,
 * so generated images render without any external storage provider.
 */
const BASE_DIR = path.resolve(
  process.env.FILE_STORAGE_LOCAL_DIR || "/home/flare/labs/flare-uploads",
);

// Base used to build public URLs. Defaults to a root-relative URL so it
// resolves against whatever origin the browser is viewing the app on (the app
// may be served via a tunnel/proxy whose domain we can't know here). Set
// FILE_STORAGE_PUBLIC_BASE_URL to force an absolute base when needed.
const PUBLIC_BASE = (process.env.FILE_STORAGE_PUBLIC_BASE_URL || "").replace(
  /\/+$/,
  "",
);

// Map a content type to a file extension so stored keys carry the right
// extension — the public serving route infers Content-Type from the key.
const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf",
};

const ensureExtension = (filename: string, contentType?: string): string => {
  const hasExt = /\.[a-z0-9]{1,5}$/i.test(filename);
  if (hasExt) return filename;
  const ext = contentType
    ? EXT_BY_CONTENT_TYPE[contentType.toLowerCase().split(";")[0].trim()]
    : undefined;
  return ext ? `${filename}.${ext}` : filename;
};

const keyToPath = (key: string): string => {
  // Prevent path traversal: resolve and ensure the result stays under BASE_DIR.
  const normalized = path
    .normalize(key)
    .replace(/^(\.\.(\/|\\|$))+/, "")
    .replace(/^\/+/, "");
  const full = path.resolve(BASE_DIR, normalized);
  if (full !== BASE_DIR && !full.startsWith(BASE_DIR + path.sep)) {
    throw new Error("Invalid storage key");
  }
  return full;
};

const publicUrlForKey = (key: string): string => {
  const encoded = key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${PUBLIC_BASE}/api/files/${encoded}`;
};

export const createLocalFileStorage = (): FileStorage => {
  return {
    async upload(content, options: UploadOptions = {}) {
      const buffer = await toBuffer(content);
      const filename = ensureExtension(
        sanitizeFilename(options.filename ?? "file"),
        options.contentType,
      );
      const prefix = STORAGE_PREFIX ? `${STORAGE_PREFIX}/` : "";
      const key = `${prefix}${generateUUID()}-${filename}`;
      const filePath = keyToPath(key);

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, buffer);

      const contentType =
        options.contentType || getContentTypeFromFilename(filename);

      const metadata: FileMetadata = {
        key,
        filename: path.posix.basename(key),
        contentType,
        size: buffer.byteLength,
        uploadedAt: new Date(),
      };

      logger.info(`[local-storage] wrote ${key} (${buffer.byteLength} bytes)`);

      return {
        key,
        sourceUrl: publicUrlForKey(key),
        metadata,
      };
    },

    // Client-side direct uploads are not supported; clients POST through the app.
    async createUploadUrl() {
      return null;
    },

    async download(key) {
      try {
        return await fs.readFile(keyToPath(key));
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
          throw new FileNotFoundError(key, error as Error);
        }
        throw error;
      }
    },

    async delete(key) {
      try {
        await fs.unlink(keyToPath(key));
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
          throw error;
        }
      }
    },

    async exists(key) {
      try {
        await fs.access(keyToPath(key));
        return true;
      } catch {
        return false;
      }
    },

    async getMetadata(key) {
      try {
        const stat = await fs.stat(keyToPath(key));
        return {
          key,
          filename: path.posix.basename(key),
          contentType: getContentTypeFromFilename(key),
          size: stat.size,
          uploadedAt: stat.mtime,
        } satisfies FileMetadata;
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
          return null;
        }
        throw error;
      }
    },

    async getSourceUrl(key) {
      return publicUrlForKey(key);
    },

    async getDownloadUrl(key) {
      return publicUrlForKey(key);
    },
  } satisfies FileStorage;
};
