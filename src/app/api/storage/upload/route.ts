import { NextResponse } from "next/server";
import { getSession } from "auth/server";
import { serverFileStorage, storageDriver } from "lib/file-storage";
import { checkStorageAction } from "../actions";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check storage configuration first
  const storageCheck = await checkStorageAction();
  if (!storageCheck.isValid) {
    return NextResponse.json(
      {
        error: storageCheck.error,
        solution: storageCheck.solution,
        storageDriver,
      },
      { status: 500 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided. Use 'file' field in FormData." },
        { status: 400 },
      );
    }

    // Size limit BEFORE buffering: file.arrayBuffer() would load the whole
    // body into memory, so reject oversized uploads first.
    const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `File too large. Maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`,
        },
        { status: 413 },
      );
    }

    // Denylist executable/hostile content types. SVG and HTML can carry
    // active content that executes when served same-origin from
    // /api/files/<key>.
    const BLOCKED_MIME = new Set([
      "image/svg+xml",
      "text/html",
      "application/xhtml+xml",
      "text/javascript",
      "application/javascript",
      "application/ecmascript",
      "text/ecmascript",
      "application/x-httpd-php",
    ]);
    const contentType = file.type || "application/octet-stream";
    if (BLOCKED_MIME.has(contentType.toLowerCase().split(";")[0].trim())) {
      return NextResponse.json(
        {
          error:
            "File type not allowed. Active content formats (SVG/HTML/scripts) are blocked.",
        },
        { status: 415 },
      );
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to storage (works with any storage backend)
    const result = await serverFileStorage.upload(buffer, {
      filename: file.name,
      contentType,
    });

    return NextResponse.json({
      success: true,
      key: result.key,
      url: result.sourceUrl,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error("Failed to upload file", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 },
    );
  }
}
