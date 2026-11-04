import "server-only";

import { z } from "zod";
import { customModelProvider } from "lib/ai/models";
import { generateJsonObject } from "./generate-json";
import logger from "logger";

/**
 * Phase 1+#1 — LLM pass that turns a finished chat message into memory
 * candidates. The output is a structured object validated by Zod and is
 * designed to be small (≤ 5 candidates per call) so the LLM cost stays
 * bounded regardless of the chat's length.
 *
 * The model is fixed to a cheap/fast option (Gemini 3 Flash via Flare) so
 * extraction cost doesn't track the user's chosen chat model. The
 * extraction call always uses the cheap model regardless of the user's
 * chat choice.
 *
 * Failure mode: any error here is logged and the caller gets back
 * `{candidates: []}`. Extraction must never crash the chat.
 */

const MemoryCategorySchema = z.enum([
  "identity",
  "career",
  "projects",
  "preferences",
  "instructions",
  "context",
]);

const MemoryScopeSchema = z.enum(["user", "agent", "thread"]);

const MemoryCandidateSchema = z.object({
  content: z
    .string()
    .min(1)
    .max(500)
    .describe(
      "A concise, third-person factual statement. Example: 'User lives in Bangalore.' or 'User prefers TypeScript.'",
    ),
  category: MemoryCategorySchema.describe(
    "Category for organization. Use 'instructions' for explicit 'always/never' rules, 'identity' for personal facts, 'preferences' for opinions/tastes, 'projects' for project context, 'career' for work facts, 'context' for transient facts.",
  ),
  scope: MemoryScopeSchema.describe(
    "Where should this memory surface? 'user' = all threads, 'agent' = only when a specific agent is active, 'thread' = only this thread.",
  ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "How confident are you this is genuinely worth remembering? 0.9+ for explicit user statements, 0.6-0.8 for strong inferences, < 0.5 for speculation.",
    ),
});

const ExtractionResultSchema = z.object({
  candidates: z
    .array(MemoryCandidateSchema)
    .max(5)
    .describe(
      "0 to 5 memory candidates extracted from the conversation. Empty array if nothing is worth remembering.",
    ),
});

export type MemoryCandidate = z.infer<typeof MemoryCandidateSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

const EXTRACTION_PROMPT = `You extract long-term memory candidates from a single chat turn.

A memory is a fact, preference, instruction, or piece of context about the user that is worth recalling in FUTURE conversations. Examples:
  - Identity facts: name, location, languages, family, age
  - Career facts: current role, company, skills, past roles
  - Projects: what they're building, current status, key decisions
  - Preferences: opinions, tastes, working-style preferences
  - Instructions: explicit "always do X", "never do Y", corrections to behavior
  - Context: transient but useful (a flight next week, debugging session, current focus)

DO NOT extract:
  - Transient conversation details ("you just said X")
  - Things the assistant said
  - Generic greetings, small talk
  - Information that is already obvious from the chat context

Be SELECTIVE. Most turns produce 0 candidates. A chat with no personal information yields an empty array. Only extract when the user has clearly shared something genuinely worth remembering.

For each candidate, assign:
  - content: a concise, third-person factual statement (no "the user", just the fact)
  - category: one of identity | career | projects | preferences | instructions | context
  - scope: 'user' (default — surfaces in all threads), 'agent' (only when a specific agent is active), 'thread' (only this thread)
  - confidence: 0.9+ for explicit statements, 0.6-0.8 for strong inferences, < 0.5 should usually be omitted

Today's date: {date}`;

const buildExtractionPrompt = () => {
  return EXTRACTION_PROMPT.replace(
    "{date}",
    new Date().toISOString().slice(0, 10),
  );
};

export interface ExtractionInput {
  userMessage: string;
  assistantMessage: string;
  agentName?: string;
  threadTitle?: string;
}

/**
 * Run the extraction pass. Returns `{candidates: []}` on any failure.
 * Cost-bound: one LLM call per invocation, ≤ 5 candidates returned.
 */
export const extractMemoryCandidates = async (
  input: ExtractionInput,
): Promise<ExtractionResult> => {
  const empty: ExtractionResult = { candidates: [] };
  if (!input.userMessage.trim() && !input.assistantMessage.trim()) {
    return empty;
  }

  try {
    const model = customModelProvider.getModel({
      // bedrock_mantle/google.gemma-3-12b-it prettified to the registry
      // key "google/gemma-3-12b-it" — cheap, fast, and authorized on
      // this deployment. The zen/gemini-3-flash alias the original
      // comment referenced is filtered out of the Flare registry and
      // 401s at the gateway, and "Gemini 3 Flash" via the static google
      // provider 404s, so both previously fell through to the default
      // fallback model (an unrelated, unauthorized Bedrock model) and
      // extraction silently came back empty. Mistral nemotron ignored
      // JSON mode on long prompts; gemma returns fenced JSON that
      // generateJsonObject parses.
      provider: "flare",
      model: "google/gemma-3-12b-it",
    });

    const object = await generateJsonObject(
      model,
      ExtractionResultSchema,
      buildExtractionPrompt(),
      [
        input.agentName ? `Active agent: ${input.agentName}` : null,
        input.threadTitle ? `Thread title: ${input.threadTitle}` : null,
        "",
        "USER MESSAGE:",
        input.userMessage || "(empty)",
        "",
        "ASSISTANT RESPONSE:",
        input.assistantMessage || "(empty)",
      ]
        .filter((line) => line !== null)
        .join("\n"),
      0.2,
    );

    return object ?? empty;
  } catch (error) {
    logger.error("Memory extraction failed; returning empty result", error);
    return empty;
  }
};
