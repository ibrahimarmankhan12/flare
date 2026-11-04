import { getSession } from "auth/server";
import {
  getCommunityErrorResponse,
  getCommunityFeed,
} from "lib/community/server";

const tabs = new Set(["For You", "Trending", "Latest", "Following"]);

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const requestedTab = searchParams.get("tab") ?? "For You";
    const tab = tabs.has(requestedTab)
      ? (requestedTab as "For You" | "Trending" | "Latest" | "Following")
      : "For You";
    const feed = await getCommunityFeed(session.user.id, tab);
    return Response.json(feed);
  } catch (error) {
    console.error("Failed to load community feed", error);
    return getCommunityErrorResponse(error);
  }
}
