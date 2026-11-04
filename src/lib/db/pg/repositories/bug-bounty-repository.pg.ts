import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { pgDb as db } from "../db.pg";
import {
  BugReportCommentEntity,
  BugReportCommentTable,
  BugReportEntity,
  BugReportStatus,
  BugReportTable,
} from "../schema.pg";

// Re-export of `BUG_REPORT_STATUSES` from the schema so callers don't need
// a second import to render status filters.
export { BUG_REPORT_STATUSES } from "../schema.pg";

export interface BugReportInput {
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  category?: string;
  affectedArea?: string | null;
  reproductionSteps?: string;
  impact?: string;
  proofOfConcept?: string | null;
}

export interface BugReportUpdateByUser {
  title?: string;
  description?: string;
  severity?: "low" | "medium" | "high" | "critical";
  category?: string;
  affectedArea?: string | null;
  reproductionSteps?: string;
  impact?: string;
  proofOfConcept?: string | null;
}

export interface BugReportUpdateByAdmin {
  status?: BugReportStatus;
  awardedAmountCents?: number | null;
  awardedCurrency?: string;
  awardedAt?: Date | null;
  resolvedAt?: Date | null;
}

export interface BugReportCommentInput {
  reportId: string;
  userId: string;
  body: string;
  isInternal?: boolean;
}

export interface BugReportLeaderboardEntry {
  userId: string;
  userName: string;
  userEmail: string;
  userImage: string | null;
  acceptedCount: number;
  awardedCount: number;
  totalAwardedCents: number;
  currency: string;
}

export interface BugReportRepository {
  // Reporter-facing
  create: (userId: string, input: BugReportInput) => Promise<BugReportEntity>;
  listByUser: (userId: string) => Promise<BugReportEntity[]>;
  getByIdForUser: (
    id: string,
    userId: string,
  ) => Promise<BugReportEntity | null>;
  updateByUser: (
    id: string,
    userId: string,
    patch: BugReportUpdateByUser,
  ) => Promise<BugReportEntity | null>;
  deleteByUser: (id: string, userId: string) => Promise<boolean>;

  // Admin-facing
  getById: (id: string) => Promise<BugReportEntity | null>;
  listAll: (status?: BugReportStatus) => Promise<BugReportEntity[]>;
  updateByAdmin: (
    id: string,
    patch: BugReportUpdateByAdmin,
  ) => Promise<BugReportEntity | null>;

  // Comments
  listComments: (
    reportId: string,
    options?: { includeInternal?: boolean },
  ) => Promise<
    Array<BugReportCommentEntity & { userName?: string; userImage?: string | null }>
  >;
  addComment: (input: BugReportCommentInput) => Promise<BugReportCommentEntity>;

  // Public
  leaderboard: (limit?: number) => Promise<BugReportLeaderboardEntry[]>;
  stats: () => Promise<{
    totalReports: number;
    acceptedReports: number;
    awardedReports: number;
    totalAwardedCents: number;
  }>;
}

const enrichComment = (rows: any[]) =>
  rows.map((row) => ({
    id: row.id,
    reportId: row.reportId,
    userId: row.userId,
    body: row.body,
    isInternal: row.isInternal,
    createdAt: row.createdAt,
    userName: row.userName ?? undefined,
    userImage: row.userImage ?? null,
  })) as Array<
    BugReportCommentEntity & { userName?: string; userImage?: string | null }
  >;

export const bugReportRepository: BugReportRepository = {
  async create(userId, input) {
    const [row] = await db
      .insert(BugReportTable)
      .values({
        userId,
        title: input.title.trim(),
        description: input.description.trim(),
        severity: input.severity,
        category: (input.category ?? "other").trim().slice(0, 64) || "other",
        affectedArea: input.affectedArea?.trim() || null,
        reproductionSteps: (input.reproductionSteps ?? "").trim(),
        impact: (input.impact ?? "").trim(),
        proofOfConcept: input.proofOfConcept?.trim() || null,
      })
      .returning();
    return row;
  },

  async listByUser(userId) {
    return db
      .select()
      .from(BugReportTable)
      .where(eq(BugReportTable.userId, userId))
      .orderBy(desc(BugReportTable.createdAt));
  },

  async getByIdForUser(id, userId) {
    const rows = await db
      .select()
      .from(BugReportTable)
      .where(
        and(eq(BugReportTable.id, id), eq(BugReportTable.userId, userId)),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async updateByUser(id, userId, patch) {
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (patch.title !== undefined) updates.title = patch.title.trim();
    if (patch.description !== undefined)
      updates.description = patch.description.trim();
    if (patch.severity !== undefined) updates.severity = patch.severity;
    if (patch.category !== undefined) updates.category = patch.category;
    if (patch.affectedArea !== undefined)
      updates.affectedArea = patch.affectedArea?.trim() || null;
    if (patch.reproductionSteps !== undefined)
      updates.reproductionSteps = patch.reproductionSteps.trim();
    if (patch.impact !== undefined) updates.impact = patch.impact.trim();
    if (patch.proofOfConcept !== undefined)
      updates.proofOfConcept = patch.proofOfConcept?.trim() || null;

    const [row] = await db
      .update(BugReportTable)
      .set(updates)
      .where(
        and(eq(BugReportTable.id, id), eq(BugReportTable.userId, userId)),
      )
      .returning();
    return row ?? null;
  },

  async deleteByUser(id, userId) {
    const result = await db
      .delete(BugReportTable)
      .where(
        and(eq(BugReportTable.id, id), eq(BugReportTable.userId, userId)),
      )
      .returning({ id: BugReportTable.id });
    return result.length > 0;
  },

  async getById(id) {
    const rows = await db
      .select()
      .from(BugReportTable)
      .where(eq(BugReportTable.id, id))
      .limit(1);
    return rows[0] ?? null;
  },

  async listAll(status) {
    if (status) {
      return db
        .select()
        .from(BugReportTable)
        .where(eq(BugReportTable.status, status))
        .orderBy(desc(BugReportTable.createdAt));
    }
    return db
      .select()
      .from(BugReportTable)
      .orderBy(desc(BugReportTable.createdAt));
  },

  async updateByAdmin(id, patch) {
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (patch.status !== undefined) {
      updates.status = patch.status;
      if (
        patch.status === "accepted" ||
        patch.status === "rejected" ||
        patch.status === "duplicate" ||
        patch.status === "awarded"
      ) {
        updates.resolvedAt = new Date();
      }
    }
    if (patch.awardedAmountCents !== undefined)
      updates.awardedAmountCents = patch.awardedAmountCents;
    if (patch.awardedCurrency !== undefined)
      updates.awardedCurrency = patch.awardedCurrency;
    if (patch.awardedAt !== undefined) updates.awardedAt = patch.awardedAt;
    if (patch.resolvedAt !== undefined) updates.resolvedAt = patch.resolvedAt;

    const [row] = await db
      .update(BugReportTable)
      .set(updates)
      .where(eq(BugReportTable.id, id))
      .returning();
    return row ?? null;
  },

  async listComments(reportId, options) {
    const includeInternal = options?.includeInternal === true;
    // Pull comments joined with user fields when possible. Keep the join
    // optional so the repository works even when the user table is the only
    // source of identity.
    const rows = await db
      .select({
        id: BugReportCommentTable.id,
        reportId: BugReportCommentTable.reportId,
        userId: BugReportCommentTable.userId,
        body: BugReportCommentTable.body,
        isInternal: BugReportCommentTable.isInternal,
        createdAt: BugReportCommentTable.createdAt,
      })
      .from(BugReportCommentTable)
      .where(
        includeInternal
          ? eq(BugReportCommentTable.reportId, reportId)
          : and(
              eq(BugReportCommentTable.reportId, reportId),
              eq(BugReportCommentTable.isInternal, false),
            ),
      )
      .orderBy(BugReportCommentTable.createdAt);
    return enrichComment(rows);
  },

  async addComment(input) {
    const [row] = await db
      .insert(BugReportCommentTable)
      .values({
        reportId: input.reportId,
        userId: input.userId,
        body: input.body.trim(),
        isInternal: input.isInternal === true,
      })
      .returning();
    return row;
  },

  async leaderboard(limit = 10) {
    // Aggregate accepted/awarded reports per user.
    const result = await db.execute(sql`
      SELECT
        u.id           AS "userId",
        u.name         AS "userName",
        u.email        AS "userEmail",
        u.image        AS "userImage",
        COUNT(*) FILTER (WHERE r.status IN ('accepted','awarded')) AS "acceptedCount",
        COUNT(*) FILTER (WHERE r.status = 'awarded')               AS "awardedCount",
        COALESCE(SUM(r.awarded_amount_cents) FILTER (WHERE r.status = 'awarded'), 0)::int AS "totalAwardedCents",
        COALESCE(MIN(r.awarded_currency) FILTER (WHERE r.status = 'awarded'), 'USD')    AS "currency"
      FROM "user" u
      INNER JOIN bug_report r ON r.user_id = u.id
      WHERE r.status IN ('accepted','awarded')
      GROUP BY u.id, u.name, u.email, u.image
      ORDER BY "totalAwardedCents" DESC, "awardedCount" DESC, "acceptedCount" DESC
      LIMIT ${limit}
    `);
    const rows = (result as any).rows ?? result;
    return (Array.isArray(rows) ? rows : []) as BugReportLeaderboardEntry[];
  },

  async stats() {
    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int                                                                AS "totalReports",
        COUNT(*) FILTER (WHERE status IN ('accepted','awarded'))::int               AS "acceptedReports",
        COUNT(*) FILTER (WHERE status = 'awarded')::int                             AS "awardedReports",
        COALESCE(SUM(awarded_amount_cents) FILTER (WHERE status = 'awarded'), 0)::int AS "totalAwardedCents"
      FROM bug_report
    `);
    const row = ((result as any).rows ?? result)?.[0] ?? {
      totalReports: 0,
      acceptedReports: 0,
      awardedReports: 0,
      totalAwardedCents: 0,
    };
    return {
      totalReports: Number(row.totalReports ?? 0),
      acceptedReports: Number(row.acceptedReports ?? 0),
      awardedReports: Number(row.awardedReports ?? 0),
      totalAwardedCents: Number(row.totalAwardedCents ?? 0),
    };
  },
};

// Internal helper: re-export enum to avoid extra imports elsewhere.
export const ALL_BUG_REPORT_STATUSES: readonly BugReportStatus[] = [
  "pending",
  "triaging",
  "accepted",
  "duplicate",
  "rejected",
  "awarded",
];
