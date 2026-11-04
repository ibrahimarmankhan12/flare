import { UIMessage } from "ai";
import { UserPreferences, UserSkill } from "app-types/user";
import { userRepository } from "lib/db/repository";
import { scheduleSkill } from "./schedule";

const SKILL_PREFIX_REGEX = /^\s*\/([a-zA-Z0-9_-]+)\b\s*/;

// Built-in skills shipped with the platform. The /schedule skill is the
// first of these — it's a platform-level capability, not something the
// user authors. Future built-ins (e.g. /search, /remind) will land here.
const BUILT_IN_SKILLS: UserSkill[] = [scheduleSkill];

const findBuiltInSkillByName = (rawName: string): UserSkill | null => {
  const normalized = sanitizeSkillName(rawName);
  if (!normalized) return null;
  const match = BUILT_IN_SKILLS.find(
    (skill) => sanitizeSkillName(skill.name) === normalized,
  );
  return match ?? null;
};

export type SkillInfo = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type ResolvedSkillInvocation = {
  skillName: string;
  skillContent: string;
  cleanedMessage: UIMessage;
  // True when the user invoked a slash skill that does not exist. The chat
  // route replies gracefully instead of failing the whole request (which
  // previously surfaced as a generic "Chat Error" and lost the message).
  notFound?: boolean;
  notFoundMessage?: string;
};

export const sanitizeSkillName = (skillName: string) => {
  return skillName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 64);
};

export const normalizeUserSkills = (value: unknown): UserSkill[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((skill) => {
      const s = skill as Partial<UserSkill> | undefined;
      const id = typeof s?.id === "string" ? s.id : "";
      const name = sanitizeSkillName(typeof s?.name === "string" ? s.name : "");
      const markdown = typeof s?.markdown === "string" ? s.markdown.trim() : "";
      const description =
        typeof s?.description === "string" && s.description.trim().length > 0
          ? s.description.trim()
          : undefined;
      const createdAt =
        typeof s?.createdAt === "string"
          ? s.createdAt
          : new Date().toISOString();
      const updatedAt =
        typeof s?.updatedAt === "string" ? s.updatedAt : createdAt;

      if (!id || !name || !markdown) return null;

      return {
        id,
        name,
        markdown,
        description,
        createdAt,
        updatedAt,
      } as UserSkill;
    })
    .filter((skill): skill is UserSkill => Boolean(skill));
};

export const getUserSkillsFromPreferences = (
  preferences: UserPreferences | null,
): UserSkill[] => {
  return normalizeUserSkills(preferences?.skills).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
};

const findFirstTextPartWithSkill = (message: UIMessage) => {
  if (!Array.isArray(message.parts)) return null;

  for (let i = 0; i < message.parts.length; i += 1) {
    const part = message.parts[i] as any;
    if (part?.type !== "text" || typeof part?.text !== "string") continue;
    const match = part.text.match(SKILL_PREFIX_REGEX);
    if (!match) continue;
    return {
      partIndex: i,
      rawSkillName: match[1],
      matchedPrefix: match[0],
    };
  }

  return null;
};

const readSkillByName = async (userId: string, skillName: string) => {
  const normalized = sanitizeSkillName(skillName);
  if (!normalized) return null;

  const preferences = await userRepository.getPreferences(userId);
  const skills = getUserSkillsFromPreferences(preferences);
  const target = skills.find(
    (skill) => sanitizeSkillName(skill.name) === normalized,
  );
  if (!target) return null;

  return {
    name: target.name,
    content: target.markdown,
  };
};

const readBuiltInSkill = (skillName: string) => {
  const target = findBuiltInSkillByName(skillName);
  if (!target) return null;
  return {
    name: target.name,
    content: target.markdown,
  };
};

export const listSkills = async (userId: string): Promise<SkillInfo[]> => {
  const preferences = await userRepository.getPreferences(userId);
  const skills = getUserSkillsFromPreferences(preferences);
  const builtIn: SkillInfo[] = BUILT_IN_SKILLS.map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  }));
  const userSkillInfos: SkillInfo[] = skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  }));

  return [...builtIn, ...userSkillInfos];
};

export const resolveSlashSkillInvocation = async (
  userId: string,
  message: UIMessage,
): Promise<ResolvedSkillInvocation | null> => {
  const matched = findFirstTextPartWithSkill(message);
  if (!matched) return null;

  // User-authored skills win, but built-in skills (e.g. /schedule) are a
  // fallback so the chat layer can dispatch them without the user having
  // to add a custom skill.
  const skill =
    (await readSkillByName(userId, matched.rawSkillName)) ??
    readBuiltInSkill(matched.rawSkillName);
  if (!skill) {
    const availableSkills = await listSkills(userId);
    const builtInNames = BUILT_IN_SKILLS.map((s) => `/${s.name}`).join(", ");
    const available = [
      builtInNames,
      ...availableSkills.map((v) => `/${v.name}`),
    ]
      .filter(Boolean)
      .join(", ");
    const requestedName = sanitizeSkillName(matched.rawSkillName);
    return {
      skillName: requestedName,
      skillContent: "",
      notFound: true,
      notFoundMessage: available
        ? `Skill \"/${requestedName}\" not found. Available skills: ${available}`
        : `Skill \"/${requestedName}\" not found. Create one in Customize -> Skills.`,
      cleanedMessage: message,
    };
  }

  const cleanedParts = [...(message.parts || [])];
  const targetPart = cleanedParts[matched.partIndex] as any;
  const cleanedText = targetPart.text
    .replace(matched.matchedPrefix, "")
    .trimStart();
  cleanedParts[matched.partIndex] = {
    ...targetPart,
    text: cleanedText.length ? cleanedText : "Apply this skill.",
  };

  return {
    skillName: skill.name,
    skillContent: skill.content,
    cleanedMessage: {
      ...message,
      parts: cleanedParts,
    },
  };
};

export const buildSkillSystemPrompt = (
  skill: ResolvedSkillInvocation | null,
) => {
  if (!skill) return "";
  return `
<active_skill>
Skill name: ${skill.skillName}
The user explicitly selected this skill via /${skill.skillName}. Follow the skill instructions below with high priority, while still respecting system and policy constraints.

${skill.skillContent}
</active_skill>
`.trim();
};
