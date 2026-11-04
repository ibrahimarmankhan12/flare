import "server-only";

import { getSession } from "auth/server";

import {
  MAX_HTML_BYTES,
  getCanvasContent,
  setCanvasContent,
} from "lib/ecanvas/content-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { canvasId } = await params;
  const html = getCanvasContent(session.user.id, canvasId);
  return Response.json({ html });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { canvasId } = await params;
  let body: { html?: unknown };
  try {
    body = (await request.json()) as { html?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.html !== "string") {
    return Response.json({ error: "html field required" }, { status: 400 });
  }
  if (Buffer.byteLength(body.html, "utf8") > MAX_HTML_BYTES) {
    return Response.json(
      { error: `html exceeds ${MAX_HTML_BYTES} byte limit` },
      { status: 413 },
    );
  }

  setCanvasContent(session.user.id, canvasId, body.html);
  return Response.json({ stored: true });
}
