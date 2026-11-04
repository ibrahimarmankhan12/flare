import { ModelMessage, tool } from "ai";
import { isString } from "lib/utils";
import logger from "logger";
import z from "zod";
import { DefaultToolName } from "..";

type VideoToolResult = {
  videos: Array<{
    url: string;
  }>;
  model: string;
  provider: "flare";
};

type VideoGenerationApiResponse = Record<string, unknown>;

const DEFAULT_VIDEO_MODEL = "video-v50";
const VIDEO_GEN_API_URL = (
  process.env.VIDEO_GEN_API_URL || "https://api.flare-sh.tech/v1/videos/generations"
).replace(/\/+$/, "");
const VIDEO_GEN_API_KEY = process.env.FLARE_API_KEY || process.env.VIDEO_GEN_API_KEY;

const extractLatestUserPrompt = (messages: ModelMessage[]) => {
  const recentMessages = messages.slice(-6);
  for (let i = recentMessages.length - 1; i >= 0; i -= 1) {
    const msg = recentMessages[i];
    if (msg.role !== "user") continue;
    if (isString(msg.content)) {
      if (msg.content.trim()) return msg.content.trim();
      continue;
    }

    const text = msg.content
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ")
      .trim();
    if (text) return text;
  }
  return "Generate a cinematic video.";
};

const collectUrls = (value: unknown, urls: string[]) => {
  if (!value) return;
  if (isString(value)) {
    const lower = value.toLowerCase();
    if (
      /^https?:\/\//i.test(value) &&
      (lower.includes(".mp4") ||
        lower.includes(".webm") ||
        lower.includes(".mov") ||
        lower.includes(".m3u8") ||
        lower.includes("/video/"))
    ) {
      urls.push(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, urls));
    return;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const directKeys = [
      "url",
      "video_url",
      "videoUrl",
      "output_url",
      "outputUrl",
    ];

    directKeys.forEach((key) => {
      const candidate = record[key];
      if (isString(candidate) && /^https?:\/\//i.test(candidate)) {
        urls.push(candidate);
      }
    });

    Object.values(record).forEach((nested) => collectUrls(nested, urls));
  }
};

const extractVideoUrls = (payload: VideoGenerationApiResponse) => {
  const urls: string[] = [];
  collectUrls(payload, urls);
  return [...new Set(urls)];
};

export const videoGenerationTool = tool({
  description:
    "Generate a video from a text prompt. Use this when users ask for creating or generating a video, cinematic clip, animation, or motion scene.",
  inputSchema: z.object({
    prompt: z
      .string()
      .optional()
      .describe(
        "Video generation prompt. If omitted, infer from chat context.",
      ),
    model: z
      .string()
      .optional()
      .describe(
        "Video model id. Defaults to video-v50. Examples: video-v50, video-v52.",
      ),
  }),
  execute: async ({ prompt, model }, { messages }) => {
    const finalPrompt = (prompt || extractLatestUserPrompt(messages)).trim();
    const finalModel = (model || DEFAULT_VIDEO_MODEL).trim();

    if (!VIDEO_GEN_API_KEY) {
      throw new Error("FLARE_API_KEY is not configured");
    }

    logger.info(
      `Generating video: model=${finalModel}, prompt=${finalPrompt.slice(0, 80)}...`,
    );

    const response = await fetch(VIDEO_GEN_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VIDEO_GEN_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: finalPrompt,
        model: finalModel,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      logger.error(
        `Video API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
      throw new Error(
        `Video generation failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as VideoGenerationApiResponse;
    const videoUrls = extractVideoUrls(data);

    if (!videoUrls.length) {
      logger.error("Video API returned no video URLs", data);
      throw new Error("No video URL returned by generation API.");
    }

    return {
      toolName: DefaultToolName.VideoGeneration,
      videos: videoUrls.map((url) => ({ url })),
      model: finalModel,
      provider: "flare",
    } as VideoToolResult;
  },
});
