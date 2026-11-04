import "server-only";

// ---------------------------------------------------------------------------
// Prompt assembly — DeepSeek Harness style.
// ---------------------------------------------------------------------------
// Modeled on dsh's `system-prompt` subsystem: named, ordered sections that
// plugins register and one assembly call turns into the model's system
// prompt. Sections are ordered so the harness identity leads, the persona
// follows, and tool guidance trails (dsh convention: -100 harness identity,
// 0 persona, 100-199 tool guidance).
//
// Unlike dsh we don't have a plugin tree — but the registry gives the same
// composition guarantee: contributors declare themselves, assembly orders
// them, and nothing can be forgotten or duplicated by hand-editing a giant
// template string.
// ---------------------------------------------------------------------------

export interface PromptSection {
  /** Unique name — registering the same name twice throws. */
  name: string;
  /**
   * Concatenation order. Convention:
   *   -100      harness identity (what the runtime is)
   *   0         persona (who the assistant is)
   *   50        capabilities (what it can do right now)
   *   100-199   tool guidance (how to use the tools well)
   *   200+      dynamic contexts (memory, retrieval, inventory)
   */
  order: number;
  /** Static text or a provider evaluated per assembly. May be async. */
  text:
    | string
    | (() => string | false | undefined | Promise<string | false | undefined>);
}

const sections = new Map<string, PromptSection>();

/**
 * Register a section. Scoped duplicates throw — like dsh, a duplicate is a
 * programming error, not a preference.
 */
export const registerSection = (section: PromptSection): void => {
  if (sections.has(section.name)) {
    throw new Error(
      `Prompt section "${section.name}" is already registered.`,
    );
  }
  sections.set(section.name, section);
};

/** Assemble the system prompt from all registered sections, ordered. */
export const assembleSystemPrompt = async (): Promise<string> =>
  assemblePromptSections([...sections.values()]);

/**
 * Order and join any set of sections — including per-request ones that must
 * not touch the module-level registry (concurrent requests would collide).
 * This is the dsh assembly step: order, render, join.
 */
export const assemblePromptSections = async (
  parts: PromptSection[],
): Promise<string> => {
  const rendered = await Promise.all(
    [...parts]
      .sort((a, b) => a.order - b.order)
      .map(async (s) =>
        typeof s.text === "function" ? await s.text() : s.text,
      ),
  );
  return rendered
    .filter((s): s is string => Boolean(s))
    .map((s) => s.trim())
    .join("\n\n");
};

/** Named dynamic context — materialized per assembly like dsh PromptContext. */
const contexts = new Map<string, PromptSection>();

export const registerContext = (ctx: PromptSection): void => {
  if (contexts.has(ctx.name)) {
    throw new Error(`Prompt context "${ctx.name}" is already registered.`);
  }
  contexts.set(ctx.name, ctx);
};

/** Dynamic runtime facts appended after the static sections. */
export const assembleDynamicContexts = async (): Promise<string> =>
  assemblePromptSections([...contexts.values()]);

/** Reset both registries — tests and hot-reload safety. */
export const resetPromptRegistry = (): void => {
  sections.clear();
  contexts.clear();
};