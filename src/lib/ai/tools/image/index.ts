import { google } from "@ai-sdk/google";
import { ModelMessage, tool as createTool } from "ai";
import { generateText } from "ai";
import { editImageWithFlare } from "lib/ai/image/edit-image";
import {
  DEFAULT_IMAGE_EDIT_MODEL,
  IMAGE_EDIT_MODEL_MAP,
} from "lib/ai/image/edit-models";
import { generateImageWithFlare } from "lib/ai/image/generate-flare-image";
import {
  DEFAULT_IMAGE_GENERATION_MODEL,
  IMAGE_GENERATION_MODEL_MAP,
} from "lib/ai/image/models";
import { serverFileStorage } from "lib/file-storage";
import {
  canUseFreeTierImageEdit,
  canUseFreeTierImageGeneration,
  getFreeTierLimits,
  recordFreeTierImageEditSuccess,
  recordFreeTierImageGenerationSuccess,
} from "lib/rate-limit/free-tier-usage";
import { isString } from "lib/utils";
import logger from "logger";
import { safe, watchError } from "ts-safe";
import z from "zod";
import { ImageToolName } from "..";
import { isFreeTier } from "app-types/subscription";

export type ImageToolResult = {
  images: {
    url: string;
    mimeType?: string;
    originalUrl?: string;
  }[];
  mode?: "create" | "edit" | "composite";
  guide?: string;
  model: string;
  provider?: "flare";
};

/**
 * Extract the latest user prompt from messages for image generation
 */
function extractLatestUserPrompt(messages: ModelMessage[]): string {
  // Look at recent messages to find user's image request
  const recentMessages = messages.slice(-6);
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    if (msg.role === "user") {
      if (isString(msg.content)) {
        return msg.content;
      }
      // Extract text parts
      const textParts = msg.content
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(" ");
      if (textParts) return textParts;
    }
  }
  return "A beautiful image";
}

type LatestUserImage = {
  url: string;
  mimeType: string;
};

const EDIT_INTENT_REGEX =
  /\b(edit|change|replace|remove|background|stylize|style|restyle|retouch|enhance|convert|transform|ghibli|anime)\b/i;
const CREATE_INTENT_REGEX = /\b(generate|create|draw|render|design|make)\b/i;

const SIZE_REGEX = /\b(1792x1024|1024x1792|1024x1024)\b/i;
const ATTACHED_IMAGE_URL_REGEX = /\[Attached image URL:\s*([^\]]+)\]/gi;

const MODEL_ALIASES: Array<{ regex: RegExp; model: string }> = [
  {
    regex: /\b(nb[\s-]*pro|nbpro|nano[\s-]*banana[\s-]*pro)\b/i,
    model: "nbpro",
  },
  { regex: /\bnano[\s-]*banana\b/i, model: "nano-banana" },
  { regex: /\bimagen?\s*4|img4\b/i, model: "img4" },
  { regex: /\bimagen?\s*3|img3\b/i, model: "img3" },
  { regex: /\bflux\s*schnell\b/i, model: "flux-schnell" },
  { regex: /\bqwen\b/i, model: "qwen" },
  { regex: /\blucid\s*origin\b/i, model: "lucid-origin" },
  { regex: /\bphoenix\b/i, model: "phoenix" },
  { regex: /\bsdxl\s*lite\b/i, model: "sdxl-lite" },
  { regex: /\bsdxl\b/i, model: "sdxl" },
];

const inferMode = (
  inputMode: "create" | "edit" | "composite" | undefined,
  prompt: string,
  hasImageInput: boolean,
): "create" | "edit" | "composite" => {
  if (inputMode) return inputMode;
  if (!hasImageInput) return "create";

  const hasEditIntent = EDIT_INTENT_REGEX.test(prompt);
  const hasCreateIntent = CREATE_INTENT_REGEX.test(prompt);

  if (hasEditIntent) return "edit";
  if (hasCreateIntent && !hasEditIntent) return "create";
  return "edit";
};

const extractRequestedModel = (prompt: string): string | undefined => {
  for (const alias of MODEL_ALIASES) {
    if (alias.regex.test(prompt)) return alias.model;
  }
  return undefined;
};

const normalizeRequestedModel = (requestedModel?: string) => {
  if (!requestedModel) return undefined;
  const normalized = requestedModel.trim().toLowerCase();
  const aliasMatch = extractRequestedModel(normalized);
  if (aliasMatch) return aliasMatch;
  return requestedModel.trim();
};

const extractRequestedModelFromMessages = (
  messages: ModelMessage[],
): string | undefined => {
  const recentMessages = messages.slice(-8);
  for (let i = recentMessages.length - 1; i >= 0; i -= 1) {
    const message = recentMessages[i];
    if (message.role !== "user") continue;

    if (isString(message.content)) {
      const model = extractRequestedModel(message.content);
      if (model) return model;
      continue;
    }

    if (!Array.isArray(message.content)) continue;
    const text = message.content
      .filter((part: any) => part?.type === "text")
      .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
      .join(" ");
    const model = extractRequestedModel(text);
    if (model) return model;
  }
  return undefined;
};

const resolveEditModel = (requestedModel?: string) => {
  const normalizedModel = normalizeRequestedModel(requestedModel);
  if (!normalizedModel) return DEFAULT_IMAGE_EDIT_MODEL;
  if (IMAGE_EDIT_MODEL_MAP[normalizedModel]) return normalizedModel;
  if (normalizedModel === "nbpro" || normalizedModel === "nano-banana") {
    return normalizedModel;
  }
  return DEFAULT_IMAGE_EDIT_MODEL;
};

const resolveGenerationModel = (requestedModel?: string) => {
  const normalizedModel = normalizeRequestedModel(requestedModel);
  if (!normalizedModel) return DEFAULT_IMAGE_GENERATION_MODEL;
  if (IMAGE_GENERATION_MODEL_MAP[normalizedModel]) return normalizedModel;
  return DEFAULT_IMAGE_GENERATION_MODEL;
};

const extractLatestUserImage = (
  messages: ModelMessage[],
): LatestUserImage | null => {
  const recentMessages = messages.slice(-8);
  for (let i = recentMessages.length - 1; i >= 0; i -= 1) {
    const msg = recentMessages[i];
    if (msg.role !== "user") continue;

    if (isString(msg.content)) {
      const matches = Array.from(
        msg.content.matchAll(ATTACHED_IMAGE_URL_REGEX),
      );
      const lastMatch = matches.at(-1);
      if (lastMatch?.[1]) {
        return {
          url: lastMatch[1].trim(),
          mimeType: "image/png",
        };
      }
      continue;
    }

    if (!Array.isArray(msg.content)) continue;

    for (let j = msg.content.length - 1; j >= 0; j -= 1) {
      const part: any = msg.content[j];
      if (part?.type === "file") {
        const mediaType =
          typeof part.mediaType === "string" ? part.mediaType : "";
        const url = typeof part.url === "string" ? part.url : "";
        if (mediaType.startsWith("image/") && url) {
          return {
            url,
            mimeType: mediaType || "image/png",
          };
        }
      }
      if (part?.type === "text" && typeof part.text === "string") {
        const matches = Array.from(
          part.text.matchAll(ATTACHED_IMAGE_URL_REGEX),
        );
        const lastMatch = matches.at(-1);
        if (lastMatch?.[1]) {
          return {
            url: lastMatch[1].trim(),
            mimeType: "image/png",
          };
        }
      }
    }
  }
  return null;
};

const resolveSizeFromPrompt = (
  prompt: string,
  aspectRatio?: "square" | "landscape" | "portrait",
) => {
  const directSize = prompt.match(SIZE_REGEX)?.[1];
  if (directSize) return directSize;

  if (/\blandscape\b/i.test(prompt)) return "1792x1024";
  if (/\bportrait\b/i.test(prompt)) return "1024x1792";
  if (/\bsquare\b/i.test(prompt)) return "1024x1024";

  if (aspectRatio === "landscape") return "1792x1024";
  if (aspectRatio === "portrait") return "1024x1792";
  return "1024x1024";
};

const isUsableImageReference = (url: string) => {
  const normalized = url.trim();
  if (!normalized) return false;
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(normalized)) return true;
  if (/^https?:\/\//i.test(normalized)) return true;
  if (normalized.startsWith("/")) return true;
  return false;
};

const createImageRefFromUrl = (url: string): LatestUserImage | null => {
  const normalized = url.trim();
  if (!isUsableImageReference(normalized)) {
    return null;
  }
  const dataUrlMatch = normalized.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,/,
  );
  return {
    url: normalized,
    mimeType: dataUrlMatch?.[1] || "image/png",
  };
};

const normalizeImageUrlForServerFetch = (url: string) => {
  if (/^https?:\/\//i.test(url)) return url;

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.BETTER_AUTH_URL;

  if (!origin) return null;
  return new URL(url, origin).toString();
};

const fetchImageAsBase64 = async (image: LatestUserImage) => {
  if (image.url.startsWith("data:")) {
    const parts = image.url.split(",");
    if (parts.length >= 2) {
      return {
        base64: parts[1],
        mimeType: image.mimeType || "image/png",
      };
    }
  }

  const normalizedUrl = normalizeImageUrlForServerFetch(image.url);
  if (!normalizedUrl) {
    throw new Error(
      "Could not resolve uploaded image URL. Please re-upload and try again.",
    );
  }

  const response = await fetch(normalizedUrl);
  if (!response.ok) {
    throw new Error("Failed to load uploaded image for editing");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    base64: buffer.toString("base64"),
    mimeType:
      response.headers.get("content-type") || image.mimeType || "image/png",
  };
};

const uploadGeneratedImages = async (
  images: { base64: string; mimeType?: string; originalUrl?: string }[],
) => {
  return safe(images)
    .map((values) =>
      Promise.all(
        values.map(async (image) => {
          const uploadedImage = await serverFileStorage.upload(
            Buffer.from(image.base64, "base64"),
            {
              contentType: image.mimeType,
            },
          );
          return {
            url: uploadedImage.sourceUrl,
            mimeType: image.mimeType,
            originalUrl: image.originalUrl,
          };
        }),
      ),
    )
    .watch(
      watchError((e) => {
        logger.error(e);
        logger.info(`upload image failed`);
      }),
    )
    .ifFail(() => {
      throw new Error(
        "Image generation was successful, but file upload failed. Please check your file upload configuration and try again.",
      );
    })
    .unwrap();
};

const uploadEditedImages = async (
  images: { url: string; base64?: string; mimeType?: string }[],
) => {
  return safe(images)
    .map((values) =>
      Promise.all(
        values.map(async (image) => {
          if (!image.base64) {
            return {
              url: image.url,
              mimeType: image.mimeType,
              originalUrl: image.url,
            };
          }
          const uploadedImage = await serverFileStorage.upload(
            Buffer.from(image.base64, "base64"),
            {
              contentType: image.mimeType,
            },
          );
          return {
            url: uploadedImage.sourceUrl,
            mimeType: image.mimeType,
            originalUrl: image.url,
          };
        }),
      ),
    )
    .watch(
      watchError((e) => {
        logger.error(e);
        logger.info(`upload edited image failed`);
      }),
    )
    .ifFail(() => {
      throw new Error(
        "Image edit was successful, but file upload failed. Please check your file upload configuration and try again.",
      );
    })
    .unwrap();
};

/**
 * Create a Flare API image generation tool with optional model and size override
 */
export function createFlareImageTool(
  modelId?: string,
  optimize: boolean = false,
  size?: string,
  executionContext?: {
    userId?: string;
    userTier?: string | null;
  },
) {
  const targetModel = modelId || DEFAULT_IMAGE_GENERATION_MODEL;

  return createTool({
    name: ImageToolName,
    description: `Generate or edit images. Use this tool when user asks to create an image, or to edit an uploaded image (style transfer, background change, etc.). If the user provides an image and asks for modifications, set mode='edit'. Model aliases: "nano banana pro" = "nbpro" and "nano banana" = "nano-banana". You can infer model/size from prompt (e.g. square/portrait/landscape).`,
    inputSchema: z.object({
      prompt: z
        .string()
        .optional()
        .describe(
          "Prompt for image generation or editing. If omitted, inferred from recent conversation.",
        ),
      aspect_ratio: z
        .enum(["square", "landscape", "portrait"])
        .optional()
        .describe(
          "Aspect ratio hint. Used when explicit size is not provided.",
        ),
      mode: z
        .enum(["create", "edit", "composite"])
        .optional()
        .describe(
          "Mode of operation. Use edit when modifying an uploaded image.",
        ),
      model: z
        .string()
        .optional()
        .describe(
          "Optional model id/name. Examples: nbpro (nano banana pro), nano-banana (nano banana).",
        ),
      image_url: z
        .string()
        .optional()
        .describe(
          "Direct URL (or data URL) of the source image for edit mode.",
        ),
      size: z
        .enum(["1024x1024", "1792x1024", "1024x1792"])
        .optional()
        .describe(
          "Explicit output size. If provided, this overrides aspect_ratio.",
        ),
    }),
    execute: async (
      {
        prompt,
        mode: inputMode,
        aspect_ratio: inputAspectRatio,
        model: inputModel,
        image_url: inputImageUrl,
        size: inputSize,
      },
      { messages, abortSignal },
    ) => {
      try {
        // Use provided prompt or extract from messages
        const latestUserPrompt = extractLatestUserPrompt(messages);
        let finalPrompt = prompt || latestUserPrompt;
        const explicitImageRef = inputImageUrl?.trim()
          ? createImageRefFromUrl(inputImageUrl)
          : null;
        if (inputImageUrl?.trim() && !explicitImageRef) {
          logger.warn(
            `Ignoring invalid image_url tool input: ${inputImageUrl.trim()}`,
          );
        }
        const latestUserImage =
          explicitImageRef || extractLatestUserImage(messages);

        const mode = inferMode(
          inputMode,
          finalPrompt,
          Boolean(latestUserImage),
        );
        const userId = executionContext?.userId;
        const enforceFreeLimits =
          Boolean(userId) && isFreeTier(executionContext?.userTier);

        const requestedModel =
          extractRequestedModel(prompt || "") ||
          extractRequestedModel(latestUserPrompt) ||
          extractRequestedModelFromMessages(messages) ||
          normalizeRequestedModel(inputModel);
        const resolvedSize =
          size ||
          inputSize ||
          resolveSizeFromPrompt(finalPrompt, inputAspectRatio || "square");

        if (mode === "edit") {
          if (enforceFreeLimits && userId) {
            const check = await canUseFreeTierImageEdit(userId);
            if (!check.allowed) {
              const limits = await getFreeTierLimits();
              throw new Error(
                `Free plan allows ${limits.dailyImageEdits} image edits per day. Upgrade to continue.`,
              );
            }
          }

          if (!latestUserImage) {
            throw new Error(
              "Please upload an image first, then ask for edits.",
            );
          }

          const selectedEditModel = resolveEditModel(
            requestedModel || modelId || targetModel,
          );
          const editProvider =
            IMAGE_EDIT_MODEL_MAP[selectedEditModel]?.provider || "flare";
          const imagePayload = await fetchImageAsBase64(latestUserImage);

          logger.info(
            `Editing image: model=${selectedEditModel}, provider=${editProvider}, size=${resolvedSize}`,
          );

          const editResult = await editImageWithFlare({
            imageBase64: imagePayload.base64,
            imageMimeType: imagePayload.mimeType,
            prompt: finalPrompt,
            model: selectedEditModel,
            size: resolvedSize,
            abortSignal,
          });

          const resultImages = await uploadEditedImages(editResult.images);
          if (enforceFreeLimits && userId && resultImages.length > 0) {
            await recordFreeTierImageEditSuccess(userId);
          }

          return {
            images: resultImages,
            mode: "edit",
            model: selectedEditModel,
            provider: editProvider,
            guide:
              resultImages.length > 0
                ? `Image edited successfully with ${selectedEditModel}.`
                : "Image edit failed. Please try again.",
          } as ImageToolResult;
        }

        const selectedGenerationModel = resolveGenerationModel(
          requestedModel || modelId || targetModel,
        );
        if (enforceFreeLimits && userId) {
          const check = await canUseFreeTierImageGeneration(userId);
          if (!check.allowed) {
            const limits = await getFreeTierLimits();
            throw new Error(
              `Free plan allows ${limits.dailyImageGenerations} image generations per day. Upgrade to continue.`,
            );
          }
        }
        const modelDetails =
          IMAGE_GENERATION_MODEL_MAP[selectedGenerationModel] ||
          IMAGE_GENERATION_MODEL_MAP[DEFAULT_IMAGE_GENERATION_MODEL];

        if (optimize) {
          logger.info(`Optimizing prompt with Gemini 2.5 Flash Lite...`);
          try {
            const { text } = await generateText({
              model: google("gemini-2.5-flash-lite"),
              system:
                "You are an expert prompt engineer for AI image generation models. Your task is to analyze the user's request and generate a highly detailed, improved prompt that will result in the best possible image. Focus on visual details, style, lighting, and composition. Output ONLY the refined prompt text, no explanations.",
              prompt: finalPrompt,
            });
            if (text) {
              logger.info(`Optimized prompt: ${text.substring(0, 50)}...`);
              finalPrompt = text;
            }
          } catch (err) {
            logger.error("Prompt optimization failed", err);
            // Continue with original prompt if optimization fails
          }
        }

        logger.info(
          `Generating image with Flare API (${selectedGenerationModel}): ${finalPrompt.substring(0, 50)}...`,
        );

        const imageSize = resolvedSize;

        const result = await generateImageWithFlare({
          prompt: finalPrompt,
          model: selectedGenerationModel,
          size: imageSize,
          abortSignal,
        });

        const resultImages = await uploadGeneratedImages(result.images);
        if (enforceFreeLimits && userId && resultImages.length > 0) {
          await recordFreeTierImageGenerationSuccess(userId);
        }

        return {
          images: resultImages,
          mode: "create",
          model: selectedGenerationModel,
          provider: "flare",
          guide:
            resultImages.length > 0
              ? `Image generated successfully with ${modelDetails?.name || selectedGenerationModel}. The image is displayed above.`
              : "Image generation failed. Please try again with a different prompt or model.",
        } as ImageToolResult;
      } catch (e) {
        logger.error(e);
        throw e;
      }
    },
  });
}

// Default Flare API tool
export const flareImageTool = createFlareImageTool();

// Alias for backward compatibility
export const nanoBananaTool = createFlareImageTool();
export const createNanoBananaTool = (optimize: boolean = false) =>
  createFlareImageTool("nbpro", optimize);
