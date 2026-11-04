import { z } from "zod";

export type CanvasExportScene = {
  elements?: unknown[];
  files?: Record<string, unknown>;
};

export type CanvasExportMetadata = {
  modelId?: string;
  modelLabel?: string;
  providerName?: string;
  usage?: {
    input_tokens?: number | string;
    output_tokens?: number | string;
  };
  generatedAt?: string;
  canvasVersion?: number;
  iteration?: number;
};

export type CanvasExport = {
  id: string;
  exporterId: string;
  canvasId: string;
  title: string;
  html: string;
  scene?: CanvasExportScene;
  metadata?: CanvasExportMetadata;
  createdAt: Date;
  updatedAt: Date;
  revokedAt?: Date;
};

export type CanvasExportPublic = {
  id: string;
  title: string;
  html: string;
  canvasId: string;
  createdAt: Date;
  metadata?: CanvasExportMetadata;
  exporterName: string | null;
  exporterImage?: string;
};

export type CanvasExportSummary = {
  id: string;
  title: string;
  canvasId: string;
  createdAt: Date;
  revokedAt?: Date;
};

export const CanvasExportCreateSchema = z.object({
  exporterId: z.string().min(1),
  canvasId: z.string().min(1),
  title: z.string().min(1).max(200),
  html: z.string().min(1),
  scene: z
    .object({
      elements: z.array(z.unknown()).optional(),
      files: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  metadata: z
    .object({
      modelId: z.string().optional(),
      modelLabel: z.string().optional(),
      providerName: z.string().optional(),
      usage: z
        .object({
          input_tokens: z.union([z.number(), z.string()]).optional(),
          output_tokens: z.union([z.number(), z.string()]).optional(),
        })
        .optional(),
      generatedAt: z.string().optional(),
      canvasVersion: z.number().optional(),
      iteration: z.number().optional(),
    })
    .optional(),
});

export const CanvasExportCreateRequestSchema = z.object({
  canvasId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  html: z.string().min(1),
  scene: CanvasExportCreateSchema.shape.scene,
  metadata: CanvasExportCreateSchema.shape.metadata,
});

export type CanvasExportRepository = {
  insert(data: z.infer<typeof CanvasExportCreateSchema>): Promise<string>;
  selectByIdPublic(id: string): Promise<CanvasExportPublic | null>;
  selectSummaryByExporterId(exporterId: string): Promise<CanvasExportSummary[]>;
  selectByIdForZip(
    id: string,
  ): Promise<Pick<
    CanvasExport,
    | "id"
    | "title"
    | "canvasId"
    | "html"
    | "scene"
    | "metadata"
    | "createdAt"
    | "revokedAt"
  > | null>;
  checkAccess(id: string, userId: string): Promise<boolean>;
  revokeById(id: string): Promise<void>;
};
