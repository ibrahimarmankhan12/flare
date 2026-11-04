import { getSession } from "auth/server";
import {
  getCommunityErrorResponse,
  getCommunityPostsStreamUrl,
} from "lib/community/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await fetch(getCommunityPostsStreamUrl(), {
      headers: {
        Accept: "text/event-stream",
      },
      cache: "no-store",
      redirect: "follow",
    });

    if (!response.ok || !response.body) {
      throw new Error(`Firebase stream failed with status ${response.status}`);
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Failed to open community stream", error);
    return getCommunityErrorResponse(error);
  }
}
