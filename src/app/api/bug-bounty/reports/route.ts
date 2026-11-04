import { z } from "zod";

import { getSession } from "auth/server";
import { bugReportRepository } from "lib/db/repository";
import { NextRequest, NextResponse } from "next/server";

const CATEGORIES = [
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
] as const;

const CreateBugReportSchema = z.object({
  title: z
    .string()
    .trim()
    .min(8, "Title must be at least 8 characters")
    .max(160, "Title must be 160 characters or fewer"),
  description: z
    .string()
    .trim()
    .min(20, "Description must be at least 20 characters")
    .max(20_000, "Description must be 20,000 characters or fewer"),
  severity: z.enum(["low", "medium", "high", "critical"]),
  category: z
    .enum(CATEGORIES)
    .optional()
    .default("other"),
  affectedArea: z
    .string()
    .trim()
    .max(200, "Affected area must be 200 characters or fewer")
    .optional()
    .nullable(),
  reproductionSteps: z
    .string()
    .trim()
    .max(10_000, "Reproduction steps must be 10,000 characters or fewer")
    .optional()
    .default(""),
  impact: z
    .string()
    .trim()
    .max(10_000, "Impact must be 10,000 characters or fewer")
    .optional()
    .default(""),
  proofOfConcept: z
    .string()
    .trim()
    .max(10_000, "Proof of concept must be 10,000 characters or fewer")
    .optional()
    .nullable(),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const reports = await bugReportRepository.listByUser(session.user.id);
    return NextResponse.json({ reports });
  } catch (err) {
    console.error("[BugBounty] list error", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = CreateBugReportSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid payload",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const report = await bugReportRepository.create(
      session.user.id,
      parsed.data,
    );
    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    console.error("[BugBounty] create error", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}
