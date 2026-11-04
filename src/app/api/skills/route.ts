import { UserPreferences, UserSkill } from "app-types/user";
import { getSession } from "auth/server";
import { getUserSkillsFromPreferences, sanitizeSkillName } from "lib/ai/skills";
import { userRepository } from "lib/db/repository";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_SKILLS = 200;
const MAX_NAME_LENGTH = 64;
const MAX_MARKDOWN_LENGTH = 120_000;
const MAX_DESCRIPTION_LENGTH = 240;

const sanitizeDescription = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_DESCRIPTION_LENGTH);
};

const updateUserSkills = async (userId: string, skills: UserSkill[]) => {
  const preferences = await userRepository.getPreferences(userId);
  const nextPreferences: UserPreferences = {
    ...(preferences ?? {}),
    skills,
  };
  await userRepository.updatePreferences(userId, nextPreferences);
};

const mapApiSkill = (
  skill: ReturnType<typeof getUserSkillsFromPreferences>[number],
) => ({
  id: skill.id,
  name: skill.name,
  markdown: skill.markdown,
  description: skill.description,
  createdAt: skill.createdAt,
  updatedAt: skill.updatedAt,
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const preferences = await userRepository.getPreferences(session.user.id);
    const skills = getUserSkillsFromPreferences(preferences).map(mapApiSkill);
    return NextResponse.json({ skills });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch skills" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const name = sanitizeSkillName(
      typeof body?.name === "string" ? body.name : "",
    );
    const markdown =
      typeof body?.markdown === "string" ? body.markdown.trim() : "";
    const description = sanitizeDescription(body?.description);

    if (!name || !markdown) {
      return NextResponse.json(
        { error: "Skill name and markdown are required" },
        { status: 400 },
      );
    }

    if (name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Skill name is too long. Max ${MAX_NAME_LENGTH} chars.` },
        { status: 400 },
      );
    }

    if (markdown.length > MAX_MARKDOWN_LENGTH) {
      return NextResponse.json(
        {
          error: `Skill markdown is too long. Max ${MAX_MARKDOWN_LENGTH} chars.`,
        },
        { status: 400 },
      );
    }

    const preferences = await userRepository.getPreferences(session.user.id);
    const existingSkills = getUserSkillsFromPreferences(preferences);

    if (existingSkills.some((skill) => skill.name === name)) {
      return NextResponse.json(
        { error: `Skill /${name} already exists` },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const skill = {
      id: crypto.randomUUID(),
      name,
      markdown,
      description,
      createdAt: now,
      updatedAt: now,
    };

    const mergedSkills = [skill, ...existingSkills].slice(0, MAX_SKILLS);
    await updateUserSkills(session.user.id, mergedSkills);

    return NextResponse.json(mapApiSkill(skill), { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create skill" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    const name = sanitizeSkillName(
      typeof body?.name === "string" ? body.name : "",
    );
    const markdown =
      typeof body?.markdown === "string" ? body.markdown.trim() : "";
    const description = sanitizeDescription(body?.description);

    if (!id || !name || !markdown) {
      return NextResponse.json(
        { error: "Skill id, name, and markdown are required" },
        { status: 400 },
      );
    }

    const preferences = await userRepository.getPreferences(session.user.id);
    const skills = getUserSkillsFromPreferences(preferences);
    const targetIndex = skills.findIndex((skill) => skill.id === id);

    if (targetIndex === -1) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const duplicate = skills.find(
      (skill) => skill.name === name && skill.id !== id,
    );
    if (duplicate) {
      return NextResponse.json(
        { error: `Skill /${name} already exists` },
        { status: 409 },
      );
    }

    const updatedSkill = {
      ...skills[targetIndex],
      name: name.slice(0, MAX_NAME_LENGTH),
      markdown: markdown.slice(0, MAX_MARKDOWN_LENGTH),
      description,
      updatedAt: new Date().toISOString(),
    };

    const nextSkills = [...skills];
    nextSkills[targetIndex] = updatedSkill;
    await updateUserSkills(session.user.id, nextSkills);

    return NextResponse.json(mapApiSkill(updatedSkill));
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update skill" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const skillId = searchParams.get("id");

    if (!skillId) {
      return NextResponse.json(
        { error: "Skill id is required" },
        { status: 400 },
      );
    }

    const preferences = await userRepository.getPreferences(session.user.id);
    const skills = getUserSkillsFromPreferences(preferences);
    const nextSkills = skills.filter((skill) => skill.id !== skillId);

    if (nextSkills.length === skills.length) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    await updateUserSkills(session.user.id, nextSkills);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete skill" },
      { status: 500 },
    );
  }
}
