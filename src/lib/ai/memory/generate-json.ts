import "server-only";
import { generateText, type LanguageModel } from "ai";
import type { z } from "zod";

/**
 * Run a strict-JSON generation pass over a language model that may not
 * honor `response_format`/structured output (Flare gateway models ignore
 * it and reply in prose/markdown). We therefore:
 *   1. instruct the model (in the system prompt) to reply with raw JSON only,
 *   2. call generateText,
 *   3. tolerate code fences / prose around the JSON block,
 *   4. zod-parse the extracted object.
 *
 * Returns `undefined` on any failure so callers can fall back to their
 * empty-result sentinel.
 */
export async function generateJsonObject<T>(
  model: LanguageModel,
  schema: z.ZodType<T>,
  system: string,
  prompt: string,
  temperature = 0.2,
): Promise<T | undefined> {
  try {
    const { text } = await generateText({
      model,
      system: `${system}

Reply with ONLY a single raw JSON object — no markdown code fences, no
prose, no commentary. The JSON must match the schema described above.
Example of an acceptable reply:
{"summary": "...", "decisions": [...], "actionItems": [...]}`,
      prompt,
      temperature,
    });

    const parsed = extractAndValidateJson(text, schema);
    if (parsed === undefined) {
      throw new Error(
        `Could not extract valid JSON from model reply. Reply was:\n${text.slice(0, 500)}`,
      );
    }
    return parsed;
  } catch (error) {
    console.error("[generateJsonObject] failed", error);
    return undefined;
  }
}

/**
 * Pull the first balanced JSON object out of a model reply, tolerating
 * markdown code fences and prose before/after, then validate with the
 * given zod schema. Returns undefined if no valid object is found.
 */
function extractAndValidateJson<T>(
  text: string,
  schema: z.ZodType<T>,
): T | undefined {
  const candidates: string[] = [];

  // 1. Raw JSON object (may be wrapped in ```json fences).
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    candidates.push(fenceMatch[1]);
  }

  // 2. First {...} span in the whole reply (balanced-brace aware).
  const start = text.indexOf("{");
  if (start !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
      } else if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          candidates.push(text.slice(start, i + 1));
          break;
        }
      }
    }
  }

  for (const candidate of candidates) {
    try {
      const obj = schema.parse(JSON.parse(candidate));
      return obj;
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
}