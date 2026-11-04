/**
 * Image Generation Models
 * Routed through the Flare Bifrost gateway (api.flare-sh.tech) to the
 * self-hosted image-proxy. Only these model ids resolve a provider.
 */

export interface ImageGenerationModel {
  id: string;
  name: string;
  /** Whether this model requires polling for results */
  requiresPolling?: boolean;
  /** Available sizes for this model */
  sizes?: { id: string; name: string; value: string }[];
}

/** Size options for Nano Banana model */
export const NANO_BANANA_SIZES = [
  { id: "square", name: "Square", value: "1024x1024" },
  { id: "landscape", name: "Landscape", value: "1792x1024" },
  { id: "portrait", name: "Portrait", value: "1024x1792" },
];

export const IMAGE_GENERATION_MODELS: ImageGenerationModel[] = [
  { id: "flux", name: "Flux" },
  { id: "dall-e-3", name: "DALL·E 3" },
  { id: "sdxl", name: "SDXL" },
  {
    id: "nano-banana",
    name: "Nano Banana",
    requiresPolling: true,
    sizes: NANO_BANANA_SIZES,
  },
  {
    id: "nbpro",
    name: "Nano Banana Pro",
    requiresPolling: true,
    sizes: NANO_BANANA_SIZES,
  },
];

export const IMAGE_GENERATION_MODEL_MAP: Record<string, ImageGenerationModel> =
  IMAGE_GENERATION_MODELS.reduce(
    (acc, model) => {
      acc[model.id] = model;
      return acc;
    },
    {} as Record<string, ImageGenerationModel>,
  );

export const DEFAULT_IMAGE_GENERATION_MODEL = "flux";
