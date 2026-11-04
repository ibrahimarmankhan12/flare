import { getSession } from "auth/server";

const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

// Upload caps: the server proxies these bytes to external storage, so an
// uncapped body is a storage/bandwidth exhaustion vector.
const MAX_IMAGE_BYTES =
  Number(process.env.COMMUNITY_MAX_IMAGE_BYTES) || 25 * 1024 * 1024;
const MAX_VIDEO_BYTES =
  Number(process.env.COMMUNITY_MAX_VIDEO_BYTES) || 200 * 1024 * 1024;

/** Verify the leading magic bytes of an image match its declared MIME. */
const imageMagicBytesMatch = (
  buf: Uint8Array,
  contentType: string,
): boolean => {
  if (buf.length < 12) return false;
  switch (contentType) {
    case "image/png":
      return (
        buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
      );
    case "image/jpeg":
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case "image/gif":
      return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
    case "image/webp":
      return (
        Buffer.from(buf.subarray(0, 4)).toString("ascii") === "RIFF" &&
        Buffer.from(buf.subarray(8, 12)).toString("ascii") === "WEBP"
      );
    default:
      return true;
  }
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.COMMUNITY_STORAGE_BASE_URL?.trim();
  const apiKey = process.env.COMMUNITY_STORAGE_API_KEY?.trim();
  const folderName = process.env.COMMUNITY_STORAGE_FOLDER_NAME?.trim();

  if (!baseUrl || !apiKey || !folderName) {
    return Response.json(
      { error: "Community storage is not configured" },
      { status: 500 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_MEDIA_TYPES.has(file.type)) {
      return Response.json(
        { error: "Only image and video uploads are supported" },
        { status: 400 },
      );
    }

    const isVideo = file.type.startsWith("video/");
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size <= 0 || file.size > maxBytes) {
      return Response.json(
        {
          error: `File exceeds the ${Math.floor(maxBytes / 1024 / 1024)}MB limit`,
        },
        { status: 413 },
      );
    }

    // Don't trust the declared Content-Type for images — verify magic bytes.
    if (!isVideo) {
      const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      if (!imageMagicBytesMatch(head, file.type)) {
        return Response.json(
          { error: "File content does not match its declared type" },
          { status: 400 },
        );
      }
    }

    const uploadBody = new FormData();
    uploadBody.append("folder_name", folderName);
    uploadBody.append("file", file, file.name);

    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/v2/upload-content`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: uploadBody,
      },
    );

    if (!response.ok) {
      throw new Error(`Storage upload failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      file_name?: string;
      file_link?: string;
    };

    if (!payload.file_link) {
      throw new Error("Storage response did not include a file link");
    }

    return Response.json({
      success: true,
      media: {
        url: payload.file_link,
        name: payload.file_name || file.name,
        contentType: file.type,
        size: file.size,
      },
    });
  } catch (error) {
    console.error("Failed to upload community media", error);
    return Response.json(
      { error: "Failed to upload community media" },
      { status: 500 },
    );
  }
}
