import { getSession } from "auth/server";
import { generateObject } from "ai";
import { customModelProvider } from "lib/ai/models";
import { sanitizeSkillName } from "lib/ai/skills";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const SkillDraftSchema = z.object({
  name: z.string().min(2).max(64),
  description: z.string().max(240).optional(),
  markdown: z.string().min(80).max(120_000),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

    if (prompt.length < 6) {
      return NextResponse.json(
        { error: "Prompt is too short. Please describe the skill." },
        { status: 400 },
      );
    }

    const { object } = await generateObject({
      model: customModelProvider.getModelWithFailureFallback(),
      schema: SkillDraftSchema,
      system:
        "You create reusable markdown skills for an AI assistant. Return concise, practical markdown only. The markdown should include: Goal, When to use, Instructions, Constraints, Output format.",
      prompt: `Create a reusable assistant skill based on this request:\n${prompt}\n\nReturn a short slash-command compatible name, optional one-line description, and the markdown content.`,
    });

    const skillName = sanitizeSkillName(object.name);
    if (!skillName) {
      return NextResponse.json(
        { error: "Failed to generate a valid skill name" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      name: skillName,
      description: object.description?.trim() || undefined,
      markdown: object.markdown.trim(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to generate skill" },
      { status: 500 },
    );
  }
}
