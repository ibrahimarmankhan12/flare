import { NextRequest } from "next/server";
import { serverFileStorage } from "lib/file-storage";
import { getContentTypeFromFilename } from "lib/file-storage/storage-utils";
import { FileNotFoundError } from "lib/errors";
import logger from "logger";

export const runtime = "nodejs";

// Detect the real image type from magic bytes so we serve the correct
// Content-Type even when the stored key's extension is wrong (the image
// proxy may return WebP/JPEG while the pipeline labels it .png).
const sniffContentType = (buf: Buffer): string | null => {
  if (buf.length >= 12) {
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    )
      return "image/png";
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
      return "image/jpeg";
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46)
      return "image/gif";
    if (
      buf.toString("ascii", 0, 4) === "RIFF" &&
      buf.toString("ascii", 8, 12) === "WEBP"
    )
      return "image/webp";
  }
  return null;
};

/**
 * Public read endpoint for locally-stored files (the "local" file-storage
 * driver). Serves generated images / uploads from disk on the app's own
 * domain so <img> tags resolve without any external storage provider.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: segments } = await params;
    const key = (segments ?? []).map((s) => decodeURIComponent(s)).join("/");
    if (!key) {
      return new Response("Not found", { status: 404 });
    }

    const buffer = await serverFileStorage.download(key);
    const contentType =
      sniffContentType(buffer) ?? getContentTypeFromFilename(key);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(buffer.byteLength),
        // Defense-in-depth: files are untrusted user-uploaded/generated
        // content. These headers neutralize active content (e.g. legacy
        // SVGs uploaded before the SVG upload block) even if served with
        // an executable Content-Type.
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    if (error instanceof FileNotFoundError) {
      return new Response("Not found", { status: 404 });
    }
    logger.error("[api/files] failed to serve file", error);
    return new Response("Internal error", { status: 500 });
  }
}
