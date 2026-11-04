"use server";

import logger from "logger";
import {
  DEFAULT_IMAGE_GENERATION_MODEL,
  IMAGE_GENERATION_MODEL_MAP,
} from "./models";

type GeneratedImage = {
  base64: string;
  mimeType?: string;
  originalUrl?: string;
};

export type FlareGeneratedImageResult = {
  images: GeneratedImage[];
  model: string;
};

export interface FlareGenerateImageOptions {
  prompt: string;
  model?: string;
  n?: number;
  size?: string;
  abortSignal?: AbortSignal;
}

/** Response from polling endpoint */
interface PollingStatusResponse {
  task_id?: string;
  status?: "pending" | "processing" | "completed" | "failed" | "cancelled";
  created_at?: number;
  model?: string;
  poll_url?: string;
  estimated_time_remaining_seconds?: number;
  error?: string;
  // When completed:
  created?: number;
  data?: Array<{
    url?: string;
    b64_json: string | null;
    model?: string;
  }>;
}

// Image generation is routed through the Flare API (api.flare-sh.tech):
// cloudflared -> sse-proxy (2001) -> Bifrost gateway (2000) -> Flare Image
// provider -> imagegenproxy (3040). The proxy returns inline base64.
const FLARE_BASE_URL = (
  process.env.IMAGE_API_BASE_URL || "https://api.flare-sh.tech"
).replace(/\/+$/, "");
const POLLING_INTERVAL_MS = 3000; // Poll every 3 seconds
const POLLING_TIMEOUT_MS = 240000; // 4 minute max timeout

function hasGeneratedImages(
  response: Pick<PollingStatusResponse, "data">,
): boolean {
  return (
    Array.isArray(response.data) &&
    response.data.some((item) => Boolean(item?.b64_json || item?.url))
  );
}

/**
 * Poll for image generation result
 */
async function pollForResult(
  taskId: string,
  apiKey: string,
  abortSignal?: AbortSignal,
  pollUrl?: string,
): Promise<PollingStatusResponse> {
  const startTime = Date.now();

  while (true) {
    // Check if aborted
    if (abortSignal?.aborted) {
      throw new Error("Image generation was cancelled");
    }

    // Check timeout
    if (Date.now() - startTime > POLLING_TIMEOUT_MS) {
      throw new Error("Image generation timed out after 4 minutes");
    }

    const response = await fetch(
      pollUrl || `${FLARE_BASE_URL}/v1/tasks/${taskId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: abortSignal,
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Polling error: ${response.status} - ${errorText}`);
    }

    const result: PollingStatusResponse = await response.json();
    const generated = hasGeneratedImages(result);
    const status = result.status;

    logger.info(
      `Polling task ${taskId}: status=${status || (generated ? "completed(data)" : "unknown")}, estimated_time=${result.estimated_time_remaining_seconds || "N/A"}s`,
    );

    // The Flare API may return completed image data without an explicit "status" field.
    if (generated || status === "completed") {
      return result;
    }

    if (status === "failed" || status === "cancelled") {
      throw new Error(
        `Image generation failed: ${result.error || "Unknown error"}`,
      );
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL_MS));
  }
}

/**
 * Generate images using the Flare API
 * Endpoint: https://api.flare-sh.tech/v1/images/generations
 * The self-hosted image-proxy (imagegenproxy on :3040, routed via Bifrost)
 * returns images inline as base64, so polling is only used as a fallback
 * for async task-based models.
 */
export async function generateImageWithFlare(
  options: FlareGenerateImageOptions,
): Promise<FlareGeneratedImageResult> {
  const apiKey = process.env.FLARE_API_KEY || process.env.IMAGE_API_KEY;
  if (!apiKey) {
    throw new Error("FLARE_API_KEY is not configured");
  }

  const model = options.model || DEFAULT_IMAGE_GENERATION_MODEL;
  const modelConfig = IMAGE_GENERATION_MODEL_MAP[model];
  const n = options.n || 1;
  const size = options.size || "1024x1024"; // Default to 1024x1024 for all models
  const requiresPolling = modelConfig?.requiresPolling || false;

  logger.info(
    `Generating image with Flare API: model=${model}, size=${size}, polling=${requiresPolling}, prompt=${options.prompt.substring(0, 50)}...`,
  );

  const response = await fetch(`${FLARE_BASE_URL}/v1/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: `Flare Image/${model}`,
      prompt: options.prompt,
      n,
      size,
      // Ask for inline base64 so we never depend on a proxy-internal image URL
      // (the image-proxy returns a localhost URL the browser cannot fetch).
      response_format: "b64_json",
    }),
    signal: options.abortSignal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    logger.error(
      `Flare API error: ${response.status} ${response.statusText} - ${errorText}`,
    );
    throw new Error(
      `Flare API error: ${response.status} ${response.statusText}`,
    );
  }

  let data: PollingStatusResponse = await response.json();

  // Handle polling-based models (Nano Banana, Nano Banana Pro)
  if (requiresPolling && data.task_id && !hasGeneratedImages(data)) {
    logger.info(`Polling mode: task_id=${data.task_id}, starting to poll...`);

    // Poll until completed
    data = await pollForResult(
      data.task_id,
      apiKey,
      options.abortSignal,
      data.poll_url,
    );
  }

  // Flare API returns images in data array with either b64_json or url
  const images: GeneratedImage[] = [];

  if (data.data && Array.isArray(data.data)) {
    for (const item of data.data) {
      if (item.b64_json) {
        images.push({
          base64: item.b64_json,
          mimeType: "image/png",
        });
      } else if (item.url) {
        // Fetch the image URL and convert to base64
        try {
          const imgResp = await fetch(item.url);
          if (imgResp.ok) {
            const buffer = Buffer.from(await imgResp.arrayBuffer());
            const contentType =
              imgResp.headers.get("content-type") || "image/png";
            images.push({
              base64: buffer.toString("base64"),
              mimeType: contentType,
              originalUrl: item.url,
            });
          }
        } catch (err) {
          logger.error(`Failed to fetch image from URL: ${item.url}`, err);
        }
      }
    }
  }

  if (images.length === 0) {
    logger.warn("Flare API returned no images", data);
    throw new Error("No images were generated");
  }

  return {
    images,
    model,
  };
}
