import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "lib/auth/permissions";
import { siteConfigRepository } from "lib/db/repository";
import { buildDefaultPaymentsConfig } from "lib/admin/site-config-defaults";
import logger from "lib/logger";
import {
  PAID_TIER_DODO_PRODUCT_ID_ENV,
  getDodoConfig,
} from "lib/payments/dodo";

export const dynamic = "force-dynamic";

const DodoPaymentsConfigSchema = z.object({
  enabled: z.boolean().optional(),
  environment: z.enum(["test_mode", "live_mode"]).optional(),
  productIds: z
    .object({
      "flare-pro": z.string().max(128).optional(),
      "flare-max": z.string().max(128).optional(),
      "flare-enterprises": z.string().max(128).optional(),
      "flare-enterprises-pro": z.string().max(128).optional(),
      "flare-enterprises-max": z.string().max(128).optional(),
    })
    .partial()
    .optional(),
});

export type DodoPaymentsConfigPayload = z.infer<
  typeof DodoPaymentsConfigSchema
>;

export const GET = async (_request: NextRequest) => {
  try {
    await requireAdminPermission("manage settings");
    const config = await getDodoConfig();
    const stored = await siteConfigRepository.getConfig("payments");
    const defaults = buildDefaultPaymentsConfig();
    const dodo = (() => {
      if (
        stored &&
        typeof (stored as Record<string, unknown>).dodo === "object" &&
        (stored as Record<string, unknown>).dodo !== null
      ) {
        return {
          ...defaults.dodo,
          ...((stored as Record<string, unknown>).dodo as Record<
            string,
            unknown
          >),
        };
      }
      return defaults.dodo;
    })();

    // Merge env-var product IDs with DB overrides so the admin can see
    // which source is currently winning for each tier.
    const productIds: Record<string, { env: string | null; db: string | null }> =
      {};
    for (const [tier, envKey] of Object.entries(PAID_TIER_DODO_PRODUCT_ID_ENV)) {
      productIds[tier] = {
        env: process.env[envKey]?.trim() || null,
        db:
          (dodo as { productIds?: Record<string, string> }).productIds?.[
            tier
          ]?.trim() || null,
      };
    }

    return NextResponse.json({
      success: true,
      dodo: {
        enabled:
          (dodo as { enabled?: boolean }).enabled ?? defaults.dodo.enabled,
        environment:
          (dodo as { environment?: "test_mode" | "live_mode" }).environment ??
          defaults.dodo.environment,
        productIds,
      },
      runtime: {
        apiKeyConfigured: Boolean(config.apiKey),
        webhookSecretConfigured: Boolean(config.webhookSecret),
        environment: config.environment,
        apiKeySource: config.apiKeySource,
        webhookSecretSource: config.webhookSecretSource,
      },
    });
  } catch (e) {
    logger.error("[admin/payments] load failed", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
};

export const POST = async (request: NextRequest) => {
  try {
    await requireAdminPermission("manage settings");
    const json = await request.json();
    const payload = DodoPaymentsConfigSchema.parse(json);

    const existing = await siteConfigRepository.getConfig("payments");
    const defaults = buildDefaultPaymentsConfig();
    const existingDodo =
      existing &&
      typeof (existing as Record<string, unknown>).dodo === "object" &&
      (existing as Record<string, unknown>).dodo !== null
        ? ((existing as Record<string, unknown>).dodo as Record<
            string,
            unknown
          >)
        : {};

    const nextDodo: Record<string, unknown> = {
      ...defaults.dodo,
      ...existingDodo,
      ...(payload.enabled !== undefined ? { enabled: payload.enabled } : {}),
      ...(payload.environment !== undefined
        ? { environment: payload.environment }
        : {}),
    };
    if (payload.productIds) {
      const existingProducts =
        typeof existingDodo.productIds === "object" &&
        existingDodo.productIds !== null
          ? (existingDodo.productIds as Record<string, string>)
          : {};
      const merged: Record<string, string> = {
        ...defaults.dodo.productIds,
        ...existingProducts,
        ...payload.productIds,
      };
      // Strip empty strings so the runtime falls back to env.
      for (const [tier, value] of Object.entries(merged)) {
        if (typeof value === "string" && value.trim().length === 0) {
          delete merged[tier];
        }
      }
      nextDodo.productIds = merged;
    }

    await siteConfigRepository.upsert("payments", {
      ...(existing ?? {}),
      dodo: nextDodo,
    });

    return NextResponse.json({ success: true, dodo: nextDodo });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", issues: e.issues },
        { status: 400 },
      );
    }
    logger.error("[admin/payments] save failed", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
};
