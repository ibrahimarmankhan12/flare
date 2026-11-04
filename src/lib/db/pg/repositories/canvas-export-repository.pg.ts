import {
  CanvasExport,
  CanvasExportCreateSchema,
  CanvasExportPublic,
  CanvasExportRepository,
  CanvasExportSummary,
} from "app-types/canvas-export";
import { and, eq, isNull, sql } from "drizzle-orm";
import { pgDb } from "../db.pg";
import { CanvasExportTable, UserTable } from "../schema.pg";
import z from "zod";

function toCanvasExportInsert(
  data: z.infer<typeof CanvasExportCreateSchema>,
): typeof CanvasExportTable.$inferInsert {
  return CanvasExportCreateSchema.parse(data) as CanvasExport;
}

export const pgCanvasExportRepository: CanvasExportRepository = {
  insert: async (data) => {
    const result = await pgDb
      .insert(CanvasExportTable)
      .values(toCanvasExportInsert(data))
      .returning({ id: CanvasExportTable.id });
    return result[0].id;
  },

  selectByIdPublic: async (id) => {
    const [result] = await pgDb
      .select({
        id: CanvasExportTable.id,
        title: CanvasExportTable.title,
        html: CanvasExportTable.html,
        canvasId: CanvasExportTable.canvasId,
        createdAt: CanvasExportTable.createdAt,
        metadata: CanvasExportTable.metadata,
        exporterName: UserTable.name,
        exporterImage: UserTable.image,
      })
      .from(CanvasExportTable)
      .leftJoin(UserTable, eq(CanvasExportTable.exporterId, UserTable.id))
      .where(
        and(eq(CanvasExportTable.id, id), isNull(CanvasExportTable.revokedAt)),
      );

    return (result as CanvasExportPublic) ?? null;
  },

  selectSummaryByExporterId: async (exporterId) => {
    const result = await pgDb
      .select({
        id: CanvasExportTable.id,
        title: CanvasExportTable.title,
        canvasId: CanvasExportTable.canvasId,
        createdAt: CanvasExportTable.createdAt,
        revokedAt: CanvasExportTable.revokedAt,
      })
      .from(CanvasExportTable)
      .where(eq(CanvasExportTable.exporterId, exporterId))
      .orderBy(sql`${CanvasExportTable.createdAt} DESC`);

    return result.map((row) => ({
      ...row,
      revokedAt: row.revokedAt ?? undefined,
    })) as CanvasExportSummary[];
  },

  selectByIdForZip: async (id) => {
    const [result] = await pgDb
      .select({
        id: CanvasExportTable.id,
        title: CanvasExportTable.title,
        canvasId: CanvasExportTable.canvasId,
        html: CanvasExportTable.html,
        scene: CanvasExportTable.scene,
        metadata: CanvasExportTable.metadata,
        createdAt: CanvasExportTable.createdAt,
        revokedAt: CanvasExportTable.revokedAt,
      })
      .from(CanvasExportTable)
      .where(eq(CanvasExportTable.id, id));

    return (
      result
        ? {
            ...result,
            scene: result.scene ?? undefined,
            metadata: result.metadata ?? undefined,
            revokedAt: result.revokedAt ?? undefined,
          }
        : null
    ) as Awaited<ReturnType<CanvasExportRepository["selectByIdForZip"]>>;
  },

  checkAccess: async (id, userId) => {
    const result = await pgDb
      .select({ exporterId: CanvasExportTable.exporterId })
      .from(CanvasExportTable)
      .where(
        and(
          eq(CanvasExportTable.id, id),
          eq(CanvasExportTable.exporterId, userId),
        ),
      );

    return result.length > 0;
  },

  revokeById: async (id) => {
    await pgDb
      .update(CanvasExportTable)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(CanvasExportTable.id, id));
  },
};
