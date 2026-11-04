import { tool as createTool, Tool } from "ai";
import { z } from "zod";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { refreshConnectorToken } from "lib/connectors/refresh";

const inputSchema = z.object({
  action: z.enum(["list", "read", "create"]),
  fileId: z
    .string()
    .optional()
    .describe("The Drive file ID (for read action)"),
  name: z
    .string()
    .optional()
    .describe("The name of the new file (for create action)"),
  content: z
    .string()
    .optional()
    .describe("The text content of the new file (for create action)"),
  maxResults: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum number of files to return (default 20)"),
});

interface DriveToolInput {
  action: "list" | "read" | "create";
  fileId?: string;
  name?: string;
  content?: string;
  maxResults?: number;
}

async function getAccessToken(userId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(UserConnectorTable)
    .where(
      and(
        eq(UserConnectorTable.userId, userId),
        eq(UserConnectorTable.provider, "google-drive"),
      ),
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].isConnected) return null;
  return refreshConnectorToken("google-drive", rows[0]);
}

export function createDriveToolForUser(userId: string): Tool {
  return createTool({
    description: `Google Drive integration tool.

Actions:
- list: List recent files in the user's Drive (optional: maxResults 1-50).
- read: Read a file's metadata and text content (requires: fileId from list results).
- create: Create a new text file (requires: name, content).

IMPORTANT:
- User must connect Google Drive first via the Connectors menu.
- For non-text files (PDF, image, etc.), only metadata is returned, not content.`,
    inputSchema,
    execute: async (input: DriveToolInput) => {
      try {
        const { action, fileId, name, content, maxResults = 20 } = input;

        const accessToken = await getAccessToken(userId);
        if (!accessToken) {
          return {
            error:
              "Google Drive is not connected or authentication has expired. Please connect via the Connectors menu.",
          };
        }

        if (action === "read") {
          if (!fileId) {
            return { error: "fileId is required for the read action" };
          }
          const metaRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink,modifiedTime`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (!metaRes.ok) {
            return { error: "Failed to fetch file metadata" };
          }
          const meta = await metaRes.json();

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
              const text = await contentRes.text();
              return {
                file: { ...meta, content: text.slice(0, 20000) },
                info: "Text content truncated to 20000 chars.",
              };
            }
          }
          return { file: meta };
        }

        if (action === "create") {
          if (!name || !content) {
            return { error: "name and content are required for create" };
          }
          const metadata = {
            name,
            mimeType: "text/plain",
          };
          const boundary = "flare-drive-boundary";
          const body =
            `--${boundary}\r\n` +
            `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
            `${JSON.stringify(metadata)}\r\n` +
            `--${boundary}\r\n` +
            `Content-Type: text/plain\r\n\r\n` +
            `${content}\r\n` +
            `--${boundary}--`;
          const res = await fetch(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": `multipart/related; boundary=${boundary}`,
              },
              body,
            },
          );
          if (!res.ok) {
            return { error: "Failed to create file" };
          }
          const created = await res.json();
          return {
            success: true,
            file: { id: created.id, name: created.name, webViewLink: created.webViewLink },
            info: `Created file "${created.name}" in Drive.`,
          };
        }

        // list
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files?pageSize=${maxResults}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&orderBy=modifiedTime desc`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!res.ok) {
          return { error: "Failed to list Drive files" };
        }
        const data = (await res.json()) as { files?: any[] };
        return {
          files: data.files || [],
          count: data.files?.length || 0,
          info: "Use the 'read' action with a fileId to fetch text content.",
        };
      } catch (error) {
        console.error("Drive tool error:", error);
        return {
          error:
            error instanceof Error
              ? error.message
              : "Drive operation failed.",
        };
      }
    },
  });
}

export const driveTool = createTool({
  description: "Google Drive tool (requires user context).",
  inputSchema,
  execute: async () => ({
    error:
      "Drive tool requires user context. This should not happen in normal operation.",
  }),
});
