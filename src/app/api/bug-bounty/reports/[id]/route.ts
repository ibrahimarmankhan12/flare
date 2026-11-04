import { z } from "zod";

import { getSession } from "auth/server";
import { bugReportRepository } from "lib/db/repository";
import { NextRequest, NextResponse } from "next/server";

const UpdateBugReportSchema = z.object({
  title: z
    .string()
    .trim()
    .min(8)
    .max(160)
    .optional(),
  description: z
    .string()
    .trim()
    .min(20)
    .max(20_000)
    .optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  category: z
    .enum([
      "security",
      "ui-ux",
      "performance",
      "data-loss",
      "auth",
      "billing",
      "ai-output",
      "mcp",
      "build",
      "other",
    ])
    .optional(),
  affectedArea: z.string().trim().max(200).nullable().optional(),
  reproductionSteps: z.string().trim().max(10_000).optional(),
  impact: z.string().trim().max(10_000).optional(),
  proofOfConcept: z.string().trim().max(10_000).nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }
    const { id } = await ctx.params;
    const report = await bugReportRepository.getByIdForUser(id, session.user.id);
    if (!report) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ report });
  } catch (err) {
    console.error("[BugBounty] get error", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }
    const { id } = await ctx.params;
    const existing = await bugReportRepository.getByIdForUser(id, session.user.id);
    if (!existing) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404 },
      );
    }
    // Reporters can only edit reports that are still in `pending` status.
    if (existing.status !== "pending") {
      return NextResponse.json(
        {
          error: "Report is locked",
          message:
            "Reports can only be edited while they are in the `pending` status. Add a comment to share new information with the triage team.",
        },
        { status: 409 },
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = UpdateBugReportSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const updated = await bugReportRepository.updateByUser(
      id,
      session.user.id,
      parsed.data,
    );
    return NextResponse.json({ report: updated });
  } catch (err) {
    console.error("[BugBounty] patch error", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }
    const { id } = await ctx.params;
    const ok = await bugReportRepository.deleteByUser(id, session.user.id);
    if (!ok) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[BugBounty] delete error", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}
