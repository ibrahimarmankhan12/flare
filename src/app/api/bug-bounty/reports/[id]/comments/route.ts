import { z } from "zod";

import { getSession } from "auth/server";
import { bugReportRepository } from "lib/db/repository";
import { NextRequest, NextResponse } from "next/server";

const AddCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Comment cannot be empty")
    .max(10_000, "Comment must be 10,000 characters or fewer"),
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
    const comments = await bugReportRepository.listComments(id, {
      includeInternal: false,
    });
    return NextResponse.json({ comments });
  } catch (err) {
    console.error("[BugBounty] list comments error", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
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
    const json = await req.json().catch(() => null);
    const parsed = AddCommentSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const comment = await bugReportRepository.addComment({
      reportId: id,
      userId: session.user.id,
      body: parsed.data.body,
      isInternal: false,
    });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    console.error("[BugBounty] add comment error", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}
