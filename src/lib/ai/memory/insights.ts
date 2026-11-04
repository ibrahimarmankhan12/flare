import "server-only";
import { type UIMessage } from "ai";
import { z } from "zod";
import type { ChatMessage } from "app-types/chat";
import { customModelProvider } from "lib/ai/models";
import { generateJsonObject } from "./generate-json";
import logger from "logger";

/**
 * P2.4 — LLM pass that turns a thread's full message history into a
 * structured "insights" record: a short summary plus a list of decisions
 * and action items. The output is small and bounded so the LLM cost
 * stays predictable regardless of thread length.
 *
 * The model is fixed to the same cheap/fast option the memory extractor
 * uses (Gemini 3 Flash via Flare) so generating insights is independent
 * of whatever chat model the user is paying for. This also keeps the
 * route cheap to call on demand.
 *
 * Failure mode: any error here is logged and the caller receives
 * `{ summary: "", decisions: [], actionItems: [] }`. The route can
 * decide whether to surface 500 or persist an empty record; this
 * function should never crash the request itself.
 */

const InsightsResultSchema = z.object({
  summary: z
    .string()
    .describe(
      "A 2-3 sentence plain-English summary of what the conversation is about and where it ended up. No bullet points, no JSON.",
    ),
  decisions: z
    .array(z.string())
    .describe(
      "List of explicit decisions reached during the conversation (e.g. 'We will use Postgres for the new service', 'Launch is delayed to June 15'). Empty if no real decisions were made.",
    ),
  actionItems: z
    .array(z.string())
    .describe(
      "List of concrete next steps that emerged, written verb-first (e.g. 'Send the design doc to the team', 'File a ticket for the auth bug'). Empty if there are no clear follow-ups.",
    ),
});

export type ThreadInsights = z.infer<typeof InsightsResultSchema>;

const EMPTY_INSIGHTS: ThreadInsights = {
  summary: "",
  decisions: [],
  actionItems: [],
};

const INSIGHTS_PROMPT = `You summarise a chat thread and extract structured insights.

You will receive the full message history of a single thread, with each message labelled by role. Your job is to produce three things:

1. summary: 2-3 sentences describing what the conversation is about and how it ended. Plain English, no bullet points, no JSON.
2. decisions: a list of explicit decisions that were reached. Skip topics that were merely discussed. If a decision was reversed, capture the final one. If no real decision was made, return an empty list.
3. actionItems: a list of concrete follow-up steps that emerged. Each one should be verb-first and specific (avoid vague "follow up on X" — say what to do, by or with whom if known). If there are no clear next steps, return an empty list.

Rules:
  - Stay faithful to the thread. Do not invent details.
  - If the thread is too short or too empty to extract insights (e.g. a single greeting), return an empty summary and empty arrays.
  - The summary is the only field that should be a sentence. decisions and actionItems must be plain strings, not objects.
  - Keep the summary under 60 words. Keep each decision and action item under 20 words.

Today's date: {date}`;

const buildInsightsPrompt = () => {
  return INSIGHTS_PROMPT.replace(
    "{date}",
    new Date().toISOString().slice(0, 10),
  );
};

/**
 * Render a single ChatMessage into a short text line for the prompt.
 * Only text parts are included — tool calls, attachments, and other
 * non-text parts are summarised by their type to keep the prompt small.
 */
const renderMessage = (msg: ChatMessage): string => {
  const role = msg.role.toUpperCase();
  const parts: string[] = [];
  for (const part of msg.parts as UIMessage["parts"]) {
    if (part?.type === "text" && typeof (part as any).text === "string") {
      parts.push((part as any).text);
    } else if (part?.type) {
      parts.push(`[${part.type}]`);
    }
  }
  const body = parts.length > 0 ? parts.join("\n") : "(empty)";
  return `${role}: ${body}`;
};

export interface GenerateInsightsInput {
  messages: ChatMessage[];
  threadTitle?: string;
}

/**
 * Run the insights pass. Returns a populated object on success, or the
 * empty sentinel on any failure. Cost-bound: one LLM call per
 * invocation.
 */
export const generateThreadInsights = async (
  input: GenerateInsightsInput,
): Promise<ThreadInsights> => {
  if (!Array.isArray(input.messages) || input.messages.length === 0) {
    return EMPTY_INSIGHTS;
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
      // insights silently came back empty. Other cheap models ignore
      // JSON mode on long transcripts; gemma returns fenced JSON that
      // generateJsonObject parses.
      provider: "flare",
      model: "google/gemma-3-12b-it",
    });

    const transcript = input.messages.map(renderMessage).join("\n\n");
    const promptSections = [
      input.threadTitle ? `Thread title: ${input.threadTitle}` : null,
      "TRANSCRIPT:",
      transcript,
    ].filter((s): s is string => s !== null);

    const object = await generateJsonObject(
      model,
      InsightsResultSchema,
      buildInsightsPrompt(),
      promptSections.join("\n"),
      0.2,
    );

    return {
      summary: object?.summary ?? "",
      decisions: Array.isArray(object?.decisions) ? object.decisions : [],
      actionItems: Array.isArray(object?.actionItems) ? object.actionItems : [],
    };
  } catch (error) {
    logger.error("Thread insights generation failed; returning empty result", error);
    return EMPTY_INSIGHTS;
  }
};
