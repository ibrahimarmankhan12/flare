export interface ImageEditModel {
  id: string;
  name: string;
  provider: "flare";
  requiresPolling?: boolean;
}

export const IMAGE_EDIT_MODELS: ImageEditModel[] = [
  {
    id: "nano-banana",
    name: "Nano Banana",
    provider: "flare",
    requiresPolling: true,
  },
  {
    id: "nbpro",
    name: "Nano Banana Pro",
    provider: "flare",
    requiresPolling: true,
  },
];

export const IMAGE_EDIT_MODEL_MAP: Record<string, ImageEditModel> =
  IMAGE_EDIT_MODELS.reduce(
    (acc, model) => {
      acc[model.id] = model;
      return acc;
    },
    {} as Record<string, ImageEditModel>,
  );

export const DEFAULT_IMAGE_EDIT_MODEL = "nbpro";
