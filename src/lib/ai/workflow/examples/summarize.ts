import { DBEdge, DBNode } from "app-types/workflow";
import { generateUUID } from "lib/utils";

const INPUT_ID = generateUUID();
const LLM_ID = generateUUID();
const OUTPUT_ID = generateUUID();
const NOTE_ID = generateUUID();

/**
 * Summarize — feed long-form text in, get a structured summary out.
 *
 *   INPUT ("text")  →  LLM (structured: summary, keyPoints, tldr)
 *                   →  OUTPUT
 *
 * The LLM uses Gemini 3 Flash (registered name) for fast, cheap summarization
 * and returns JSON matching `outputSchema`, so downstream tools or chat
 * replies can pick whichever field they need.
 */
export const summarizeNodes: Partial<DBNode>[] = [
  {
    id: INPUT_ID,
    kind: "input",
    name: "INPUT",
    description: "Receive the text to summarize",
    uiConfig: { position: { x: 0, y: 0 }, type: "default" },
    nodeConfig: {
      kind: "input",
      outputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The raw text to summarize",
          },
        },
        required: ["text"],
      },
    },
  },
  {
    id: LLM_ID,
    kind: "llm",
    name: "SUMMARIZER",
    description: "Generate a structured summary",
    uiConfig: { position: { x: 360, y: 0 }, type: "default" },
    nodeConfig: {
      kind: "llm",
      model: { provider: "google", model: "Gemini 3 Flash" },
      outputSchema: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "A concise 2-3 sentence summary",
          },
          keyPoints: {
            type: "array",
            items: { type: "string" },
            description: "Bullet-point key takeaways",
          },
          tldr: {
            type: "string",
            description: "One-sentence TL;DR",
          },
        },
      },
      messages: [
        {
          role: "system",
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text:
                      "You are a precise summarizer. Produce a concise summary, " +
                      "3-5 key bullet points, and a one-sentence TL;DR. Be factual; " +
                      "do not invent details that are not in the source.",
                  },
                ],
              },
            ],
          },
        },
        {
          role: "user",
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "Summarize the following text:\n\n" },
                  {
                    type: "mention",
                    attrs: {
                      id: "c1f0b9b0-2c1e-4a5e-9d2e-3a5b9e9b1a01",
                      label: `{"nodeId":"${INPUT_ID}","path":["text"]}`,
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  },
  {
    id: NOTE_ID,
    kind: "note",
    name: "NOTE",
    description: `# 📝 Summarize Workflow

Takes a block of text and returns a structured summary.

### ➡️ Pipeline

1. **Input** — caller passes a \`text\` field.
2. **Summarizer (LLM)** — produces \`summary\`, \`keyPoints[]\`, and \`tldr\`.
3. **Output** — structured result handed back to the caller.

### 📤 Example output

\`\`\`json
{
  "summary": "The article argues that …",
  "keyPoints": ["Point A", "Point B", "Point C"],
  "tldr": "A short one-liner."
}
\`\`\`
`,
    uiConfig: {
      position: { x: -360, y: -420 },
      type: "default",
    },
    nodeConfig: {
      kind: "note",
      outputSchema: { type: "object", properties: {} },
    },
  },
  {
    id: OUTPUT_ID,
    kind: "output",
    name: "OUTPUT",
    description: "Return the structured summary",
    uiConfig: { position: { x: 720, y: 0 }, type: "default" },
    nodeConfig: {
      kind: "output",
      outputSchema: { type: "object", properties: {} },
      outputData: [
        { key: "summary", source: { nodeId: LLM_ID, path: ["summary"] } },
        {
          key: "keyPoints",
          source: { nodeId: LLM_ID, path: ["keyPoints"] },
        },
        { key: "tldr", source: { nodeId: LLM_ID, path: ["tldr"] } },
      ],
    },
  },
];

export const summarizeEdges: Partial<DBEdge>[] = [
  { source: INPUT_ID, target: LLM_ID, uiConfig: {} },
  { source: LLM_ID, target: OUTPUT_ID, uiConfig: {} },
];
