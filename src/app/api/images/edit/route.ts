import { getSession } from "auth/server";
import { editImageWithFlare } from "lib/ai/image/edit-image";
import {
  DEFAULT_IMAGE_EDIT_MODEL,
  IMAGE_EDIT_MODEL_MAP,
} from "lib/ai/image/edit-models";
import { serverFileStorage } from "lib/file-storage";
import {
  canUseFreeTierImageEdit,
  getFreeTierLimits,
  recordFreeTierImageEditSuccess,
} from "lib/rate-limit/free-tier-usage";
import { userRepository } from "lib/db/repository";
import logger from "logger";
import { NextResponse } from "next/server";
import { isFreeTier } from "app-types/subscription";

export const runtime = "nodejs";

// Extend timeout for polling-based models (up to 5 minutes)
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await userRepository.getUserById(session.user.id);
    const enforceFreeLimits = isFreeTier(currentUser?.tier);
    if (enforceFreeLimits) {
      const check = await canUseFreeTierImageEdit(session.user.id);
      if (!check.allowed) {
        const limits = await getFreeTierLimits();
        return NextResponse.json(
          {
            error: `Free plan allows ${limits.dailyImageEdits} image edits per day. Upgrade to continue.`,
            code: "free-tier-image-edit-limit-exceeded",
          },
          { status: 429 },
        );
      }
    }

    const body = await request.json();
    const { imageBase64, imageMimeType, prompt, model, size } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: "imageBase64 is required" },
        { status: 400 },
      );
    }

    if (!prompt) {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 },
      );
    }

    const selectedModel =
      model && IMAGE_EDIT_MODEL_MAP[model] ? model : DEFAULT_IMAGE_EDIT_MODEL;
    const modelConfig = IMAGE_EDIT_MODEL_MAP[selectedModel];
    const provider = modelConfig?.provider || "flare";

    logger.info(
      `Image edit request: model=${selectedModel}, provider=${provider}`,
    );

    // All image edits route through the Flare API
    const result = await editImageWithFlare({
      imageBase64,
      imageMimeType: imageMimeType || "image/png",
      prompt,
      model: selectedModel,
      size,
      abortSignal: request.signal,
    });

    // Upload edited images to storage
    const uploadedImages = await Promise.all(
      result.images.map(async (img) => {
        if (img.base64) {
          try {
            const uploaded = await serverFileStorage.upload(
              Buffer.from(img.base64, "base64"),
              {
                contentType: img.mimeType || "image/png",
              },
            );
            return {
              url: uploaded.sourceUrl,
              mimeType: img.mimeType,
            };
          } catch (err) {
            logger.error("Failed to upload edited image", err);
            // Fall back to original URL if upload fails
            return { url: img.url, mimeType: img.mimeType };
          }
        }
        return { url: img.url, mimeType: img.mimeType };
      }),
    );

    if (enforceFreeLimits && uploadedImages.length > 0) {
      await recordFreeTierImageEditSuccess(session.user.id);
    }

    return NextResponse.json({
      images: uploadedImages,
      model: result.model,
    });
  } catch (error) {
    logger.error("Image edit failed", error);
    const message =
      error instanceof Error ? error.message : "Image edit failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
