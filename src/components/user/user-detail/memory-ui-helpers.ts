/**
 * Pure helpers for the Memory settings UI. No React, no DB — these are
 * unit-testable in isolation and reusable from the page, the memory card,
 * and any future memory-admin tools.
 *
 * Categories: We surface a small fixed taxonomy in the UI. Memory rows in
 * the DB can still have any string in `category`; we just map the common
 * ones to a color. Unknown categories fall back to the neutral palette so
 * a hand-typed value still renders.
 */

import type { MemoryScope } from "lib/db/pg/repositories/memory-helpers";

export const MEMORY_CATEGORY_OPTIONS = [
  "general",
  "preferences",
  "identity",
  "career",
  "projects",
  "instructions",
  "context",
  "technical",
] as const;

export type MemoryCategoryOption = (typeof MEMORY_CATEGORY_OPTIONS)[number];

/** Default category shown when the row has null/empty category. */
export const DEFAULT_CATEGORY: MemoryCategoryOption = "general";

/** Tailwind class for each category. Keep this list small — the picker is
 *  the source of truth for which categories the user can pick from. */
const CATEGORY_COLOR_MAP: Record<string, string> = {
  preferences: "bg-blue-500/15 text-blue-400",
  preference: "bg-blue-500/15 text-blue-400",
  identity: "bg-green-500/15 text-green-400",
  personal: "bg-green-500/15 text-green-400",
  context: "bg-amber-500/15 text-amber-400",
  context_general: "bg-amber-500/15 text-amber-400",
  instructions: "bg-rose-500/15 text-rose-400",
  instruction: "bg-rose-500/15 text-rose-400",
  career: "bg-orange-500/15 text-orange-400",
  work: "bg-orange-500/15 text-orange-400",
  projects: "bg-violet-500/15 text-violet-400",
  project: "bg-violet-500/15 text-violet-400",
  technical: "bg-cyan-500/15 text-cyan-400",
  general: "bg-secondary/60 text-secondary-foreground",
};

const FALLBACK_CATEGORY_COLOR = "bg-secondary/60 text-secondary-foreground";

/**
 * Return the Tailwind class for a memory's category badge. Falls back to a
 * neutral color for null/empty/unknown categories so the UI never breaks.
 */
export function getCategoryColor(category: string | null | undefined): string {
  if (!category) return FALLBACK_CATEGORY_COLOR;
  return CATEGORY_COLOR_MAP[category.toLowerCase()] ?? FALLBACK_CATEGORY_COLOR;
}

/** Return the display label for a memory's category. Null/empty → "general". */
export function getCategoryLabel(category: string | null | undefined): string {
  if (!category || !category.trim()) return DEFAULT_CATEGORY;
  return category;
}

const SCOPE_LABEL_MAP: Record<MemoryScope, string> = {
  user: "user",
  agent: "agent",
  thread: "thread",
};

const SCOPE_COLOR_MAP: Record<MemoryScope, string> = {
  user: "bg-slate-500/15 text-slate-400",
  agent: "bg-indigo-500/15 text-indigo-400",
  thread: "bg-pink-500/15 text-pink-400",
};

/** Display label for a memory's scope (user / agent / thread). */
export function getScopeLabel(scope: string | null | undefined): string {
  if (!scope) return "user";
  if (scope in SCOPE_LABEL_MAP) return SCOPE_LABEL_MAP[scope as MemoryScope];
  return scope;
}

/** Tailwind class for a memory's scope badge. */
export function getScopeColor(scope: string | null | undefined): string {
  if (!scope || !(scope in SCOPE_COLOR_MAP)) return SCOPE_COLOR_MAP.user;
  return SCOPE_COLOR_MAP[scope as MemoryScope];
}

/** Truncate a string to `max` characters, with an ellipsis if cut. */
export function truncateForPreview(text: string, max = 80): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

/** Build the URL the "View source" link should navigate to. The chat route
 *  accepts a `?message=<id>` query param; the chat page can scroll to the
 *  message in a follow-up. Returns null when there is no source. */
export function buildSourceLink(args: {
  threadId: string | null | undefined;
  sourceMessageId: string | null | undefined;
}): string | null {
  if (!args.threadId || !args.sourceMessageId) return null;
  return `/chat/${args.threadId}?message=${encodeURIComponent(args.sourceMessageId)}`;
}
