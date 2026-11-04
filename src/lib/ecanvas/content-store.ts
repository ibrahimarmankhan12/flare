import "server-only";

// Shared in-memory store for pre-generated ecanvas HTML. Lives in a single
// module so the ecanvas tool (executing inside the streaming chat request)
// and the /api/ecanvas/[canvasId]/content route share one Map instance.
// Keys are scoped per user so one user can never read or overwrite another
// user's generated HTML.
export const MAX_HTML_BYTES = 512 * 1024;
const MAX_ENTRIES = 5_000;

const canvasContentStore = new Map<string, string>();

const scopeKey = (userId: string, canvasId: string) => `${userId}:${canvasId}`;

export const setCanvasContent = (
  userId: string,
  canvasId: string,
  html: string,
) => {
  const trimmed =
    Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES
      ? html.slice(0, MAX_HTML_BYTES)
      : html;
  if (canvasContentStore.size >= MAX_ENTRIES) {
    const oldest = canvasContentStore.keys().next().value;
    if (oldest !== undefined) canvasContentStore.delete(oldest);
  }
  canvasContentStore.set(scopeKey(userId, canvasId), trimmed);
};

export const getCanvasContent = (userId: string, canvasId: string) =>
  canvasContentStore.get(scopeKey(userId, canvasId)) || null;
