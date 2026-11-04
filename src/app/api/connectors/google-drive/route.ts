import { NextRequest, NextResponse } from "next/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getSession } from "auth/server";
import { refreshConnectorToken } from "lib/connectors/refresh";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "list";
    const fileId = searchParams.get("fileId");
    const maxResults = parseInt(searchParams.get("maxResults") || "20");

    const rows = await db
      .select()
      .from(UserConnectorTable)
      .where(
        and(
          eq(UserConnectorTable.userId, session.user.id),
          eq(UserConnectorTable.provider, "google-drive"),
        ),
      )
      .limit(1);

    if (rows.length === 0 || !rows[0].isConnected) {
      return NextResponse.json(
        { error: "Google Drive is not connected" },
        { status: 400 },
      );
    }

    const accessToken = await refreshConnectorToken("google-drive", rows[0]);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Google Drive authentication expired. Please reconnect." },
        { status: 401 },
      );
    }

    if (action === "read" && fileId) {
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink,modifiedTime,head`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!metaRes.ok) {
        return NextResponse.json(
          { error: "Failed to fetch file metadata" },
          { status: 500 },
        );
      }
      const meta = await metaRes.json();

      // Only fetch text content for text-like MIME types.
      if (
        meta.mimeType?.startsWith("text/") ||
        meta.mimeType === "application/json" ||
        meta.mimeType === "application/markdown"
      ) {
        const contentRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (contentRes.ok) {
          const content = await contentRes.text();
          return NextResponse.json({ file: { ...meta, content } });
        }
      }

      return NextResponse.json({ file: meta });
    }

    // Default: list recent files.
    const listRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?pageSize=${maxResults}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&orderBy=modifiedTime desc`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!listRes.ok) {
      return NextResponse.json(
        { error: "Failed to list Drive files" },
        { status: 500 },
      );
    }
    const listData: { files: DriveFile[] } = await listRes.json();
    return NextResponse.json({ files: listData.files || [] });
  } catch (error) {
    console.error("Drive API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Drive request failed",
      },
      { status: 500 },
    );
  }
}
