import { tool as createTool } from "ai";
import { JSONSchema7 } from "json-schema";
import { z } from "zod";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";

export const youtubeSearchSchema: JSONSchema7 = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Search query for YouTube videos",
    },
    maxResults: {
      type: "number",
      description: "Maximum number of videos to return. Defaults to 5.",
      minimum: 1,
      maximum: 10,
    },
    order: {
      type: "string",
      enum: ["relevance", "date", "viewCount", "rating"],
      description: "Sort order for results. Defaults to relevance.",
    },
    safeSearch: {
      type: "string",
      enum: ["none", "moderate", "strict"],
      description: "Safe search filter for results. Defaults to moderate.",
    },
    channelId: {
      type: "string",
      description: "Filter results to a specific channel",
    },
    duration: {
      type: "string",
      enum: ["any", "short", "medium", "long"],
      description: "Filter by video duration. Defaults to any.",
    },
  },
  required: ["query"],
};

const youtubeSearchZodSchema = z
  .object({
    query: z.string().min(1),
    maxResults: z.number().min(1).max(10).optional(),
    order: z.enum(["relevance", "date", "viewCount", "rating"]).optional(),
    safeSearch: z.enum(["none", "moderate", "strict"]).optional(),
    channelId: z.string().optional(),
    duration: z.enum(["any", "short", "medium", "long"]).optional(),
  })
  .strict();

type YoutubeSearchInput = z.infer<typeof youtubeSearchZodSchema>;

function buildSearchUrl(input: YoutubeSearchInput) {
  const url = new URL(YOUTUBE_SEARCH_URL);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("q", input.query);
  url.searchParams.set("maxResults", String(input.maxResults ?? 5));
  url.searchParams.set("key", YOUTUBE_API_KEY ?? "");

  if (input.order) {
    url.searchParams.set("order", input.order);
  }
  if (input.safeSearch) {
    url.searchParams.set("safeSearch", input.safeSearch);
  }
  if (input.channelId) {
    url.searchParams.set("channelId", input.channelId);
  }
  if (input.duration && input.duration !== "any") {
    url.searchParams.set("videoDuration", input.duration);
  }

  return url;
}

export const youtubeSearchToolForWorkflow = createTool({
  description:
    "Search YouTube videos by query and return suggested tutorials or videos. Uses the YouTube Data API (no user account required).",
  inputSchema: youtubeSearchZodSchema,
  execute: async (input: YoutubeSearchInput) => {
    if (!YOUTUBE_API_KEY) {
      throw new Error("YOUTUBE_API_KEY is not configured");
    }

    const url = buildSearchUrl(input);
    const response = await fetch(url.toString());

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        errorBody?.error?.message ||
          `YouTube API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    const videos = (data.items || [])
      .map((item: any) => ({
        id: item.id?.videoId,
        title: item.snippet?.title,
        description: item.snippet?.description,
        channelTitle: item.snippet?.channelTitle,
        publishedAt: item.snippet?.publishedAt,
        thumbnail: item.snippet?.thumbnails?.medium?.url,
        url: item.id?.videoId
          ? `https://www.youtube.com/watch?v=${item.id.videoId}`
          : undefined,
      }))
      .filter((item: any) => item.id && item.title);

    return {
      videos,
      count: videos.length,
      info: "Use the results to recommend a relevant YouTube tutorial/video.",
    };
  },
});

export const youtubeSearchTool = createTool({
  description:
    "Search YouTube videos by query and return suggested tutorials or videos. Uses the YouTube Data API (no user account required).",
  inputSchema: youtubeSearchZodSchema,
  execute: async (input: YoutubeSearchInput) => {
    try {
      if (!YOUTUBE_API_KEY) {
        throw new Error("YOUTUBE_API_KEY is not configured");
      }

      const url = buildSearchUrl(input);
      const response = await fetch(url.toString());

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
          errorBody?.error?.message ||
            `YouTube API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      const videos = (data.items || [])
        .map((item: any) => ({
          id: item.id?.videoId,
          title: item.snippet?.title,
          description: item.snippet?.description,
          channelTitle: item.snippet?.channelTitle,
          publishedAt: item.snippet?.publishedAt,
          thumbnail: item.snippet?.thumbnails?.medium?.url,
          url: item.id?.videoId
            ? `https://www.youtube.com/watch?v=${item.id.videoId}`
            : undefined,
        }))
        .filter((item: any) => item.id && item.title);

      return {
        videos,
        count: videos.length,
        info: "Use the results to recommend a relevant YouTube tutorial/video.",
      };
    } catch (error: any) {
      return {
        isError: true,
        error: error?.message || "YouTube search failed",
        solution:
          "Check that YOUTUBE_API_KEY is set and has YouTube Data API v3 access, then retry the request.",
      };
    }
  },
});
