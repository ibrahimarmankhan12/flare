import { tool as createTool } from "ai";
import { JSONSchema7 } from "json-schema";
import { z } from "zod";

const SUPADATA_API_KEY = process.env.SUPADATA_API_KEY;
const SUPADATA_TRANSCRIPT_URL = "https://api.supadata.ai/v1/transcript";

export const youtubeTranscriptSchema: JSONSchema7 = {
  type: "object",
  properties: {
    url: {
      type: "string",
      description:
        "YouTube video URL (preferred). Example: https://youtu.be/dQw4w9WgXcQ",
    },
    id: {
      type: "string",
      description:
        "YouTube video ID (alternative to url). Example: dQw4w9WgXcQ",
    },
    includeTimestamps: {
      type: "boolean",
      description:
        "Include timestamped segments when available. Defaults to false.",
    },
  },
  required: [],
};

const youtubeTranscriptZodSchema = z
  .object({
    url: z.string().url().optional(),
    id: z.string().min(5).optional(),
    includeTimestamps: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.url || value.id, {
    message: "Provide either url or id",
  });

type YoutubeTranscriptInput = z.infer<typeof youtubeTranscriptZodSchema>;

function buildTranscriptUrl(input: YoutubeTranscriptInput) {
  const url = new URL(SUPADATA_TRANSCRIPT_URL);
  const youtubeUrl =
    input.url ?? (input.id ? `https://youtu.be/${input.id}` : undefined);
  if (!youtubeUrl) {
    throw new Error("Missing YouTube url or id");
  }
  url.searchParams.set("url", youtubeUrl);
  return url;
}

function normalizeTranscriptResponse(data: any) {
  const segments = Array.isArray(data?.segments)
    ? data.segments
    : Array.isArray(data?.transcript)
      ? data.transcript
      : undefined;

  const transcriptText =
    typeof data?.text === "string"
      ? data.text
      : typeof data?.transcript === "string"
        ? data.transcript
        : Array.isArray(segments)
          ? segments
              .map((segment: any) => segment?.text)
              .filter(Boolean)
              .join(" ")
          : "";

  return {
    transcript: transcriptText,
    segments,
    raw: data,
  };
}

export const youtubeTranscriptToolForWorkflow = createTool({
  description:
    "Fetch a YouTube video transcript via Supadata (no user account required). Use the transcript to summarize or analyze the video.",
  inputSchema: youtubeTranscriptZodSchema,
  execute: async (input: YoutubeTranscriptInput) => {
    if (!SUPADATA_API_KEY) {
      throw new Error("SUPADATA_API_KEY is not configured");
    }

    const url = buildTranscriptUrl(input);
    const response = await fetch(url.toString(), {
      headers: {
        "x-api-key": SUPADATA_API_KEY,
      },
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        errorBody?.error?.message ||
          `Supadata transcript error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    return normalizeTranscriptResponse(data);
  },
});

export const youtubeTranscriptTool = createTool({
  description:
    "Fetch a YouTube video transcript via Supadata (no user account required). Use the transcript to summarize or analyze the video.",
  inputSchema: youtubeTranscriptZodSchema,
  execute: async (input: YoutubeTranscriptInput) => {
    try {
      if (!SUPADATA_API_KEY) {
        throw new Error("SUPADATA_API_KEY is not configured");
      }

      const url = buildTranscriptUrl(input);
      const response = await fetch(url.toString(), {
        headers: {
          "x-api-key": SUPADATA_API_KEY,
        },
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
          errorBody?.error?.message ||
            `Supadata transcript error: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      return normalizeTranscriptResponse(data);
    } catch (error: any) {
      return {
        isError: true,
        error: error?.message || "Supadata transcript request failed",
        solution:
          "Check that SUPADATA_API_KEY is set and has transcript access, then retry the request.",
      };
    }
  },
});
