"use server";

import logger from "logger";
import { DEFAULT_IMAGE_EDIT_MODEL } from "./edit-models";

// Note: IMAGE_EDIT_MODELS, IMAGE_EDIT_MODEL_MAP, DEFAULT_IMAGE_EDIT_MODEL
// should be imported directly from "./edit-models" by consumers
// "use server" files can only export async functions

type EditedImage = {
  url: string;
  base64?: string;
  mimeType?: string;
};

export type ImageEditResult = {
  images: EditedImage[];
  model: string;
};

export interface EditImageOptions {
  imageBase64: string;
  imageMimeType: string;
  prompt: string;
  model?: string;
  size?: string;
  abortSignal?: AbortSignal;
}

// Image edits are routed through the Flare API (api.flare-sh.tech) to the
// self-hosted image-proxy (imagegenproxy on :3040, routed via Bifrost),
// the same gateway used for image generation.
const FLARE_BASE_URL = (
  process.env.IMAGE_API_BASE_URL || "https://api.flare-sh.tech"
).replace(/\/+$/, "");

interface FlareImageResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
  }>;
}

/**
 * Edit an image using the Flare API (OpenAI compatible)
 * Endpoint: https://api.flare-sh.tech/v1/images/edits
 */
export async function editImageWithFlare(
  options: EditImageOptions,
): Promise<ImageEditResult> {
  const apiKey = process.env.FLARE_API_KEY || process.env.IMAGE_API_KEY;
  if (!apiKey) {
    throw new Error("FLARE_API_KEY is not configured");
  }

  const model = options.model || DEFAULT_IMAGE_EDIT_MODEL;

  logger.info(
    `Editing image with Flare API: model=${model}, prompt=${options.prompt.substring(0, 50)}...`,
  );

  // Create FormData for the multipart request
  const formData = new FormData();
  formData.append("model", `Flare Image/${model}`);
  formData.append("prompt", options.prompt);
  if (options.size) {
    formData.append("size", options.size);
  }

  // Convert base64 to Blob for FormData
  const imageBuffer = Buffer.from(options.imageBase64, "base64");
  const imageBlob = new Blob([imageBuffer], {
    type: options.imageMimeType || "image/png",
  });
  formData.append("image", imageBlob, "image.png");

  const response = await fetch(`${FLARE_BASE_URL}/v1/images/edits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
    signal: options.abortSignal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    logger.error(`Flare API error: ${response.status} - ${errorText}`);
    throw new Error(`Flare API error: ${response.status}`);
  }

  const result: FlareImageResponse = await response.json();
  const images: EditedImage[] = [];

  if (result.data && Array.isArray(result.data)) {
    for (const item of result.data) {
      if (item.url) {
        // Fetch the image and convert to base64 for storage
        try {
          const imgResp = await fetch(item.url);
          if (imgResp.ok) {
            const buffer = Buffer.from(await imgResp.arrayBuffer());
            const contentType =
              imgResp.headers.get("content-type") || "image/png";
            images.push({
              url: item.url,
              base64: buffer.toString("base64"),
              mimeType: contentType,
            });
          } else {
            images.push({ url: item.url });
          }
        } catch (err) {
          logger.error(
            `Failed to fetch edited image from URL: ${item.url}`,
            err,
          );
          images.push({ url: item.url });
        }
      } else if (item.b64_json) {
        images.push({
          url: "",
          base64: item.b64_json,
          mimeType: "image/png",
        });
      }
    }
  }

  if (images.length === 0) {
    logger.warn("Flare API returned no edited images", result);
    throw new Error("No edited images were returned");
  }

  return {
    images,
    model,
  };
}
