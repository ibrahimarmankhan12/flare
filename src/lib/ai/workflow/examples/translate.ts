import { DBEdge, DBNode } from "app-types/workflow";
import { generateUUID } from "lib/utils";

const INPUT_ID = generateUUID();
const LLM_ID = generateUUID();
const OUTPUT_ID = generateUUID();
const NOTE_ID = generateUUID();

/**
 * Translate — take a piece of text + a target language code, return a
 * translation. The LLM node uses Claude Opus 4.6 for high-quality
 * multilingual output, and the structured output guarantees the caller
 * always gets the same shape.
 */
export const translateNodes: Partial<DBNode>[] = [
  {
    id: INPUT_ID,
    kind: "input",
    name: "INPUT",
    description: "Receive text + target language",
    uiConfig: { position: { x: 0, y: 0 }, type: "default" },
    nodeConfig: {
      kind: "input",
      outputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The text to translate",
          },
          targetLanguage: {
            type: "string",
            description:
              'Target language name (e.g. "Spanish", "Japanese", "French")',
          },
        },
        required: ["text", "targetLanguage"],
      },
    },
  },
  {
    id: LLM_ID,
    kind: "llm",
    name: "TRANSLATOR",
    description: "Translate the text to the target language",
    uiConfig: { position: { x: 360, y: 0 }, type: "default" },
    nodeConfig: {
      kind: "llm",
      model: { provider: "anthropic", model: "Claude Opus 4.6" },
      outputSchema: {
        type: "object",
        properties: {
          translation: {
            type: "string",
            description: "The translated text",
          },
          sourceLanguage: {
            type: "string",
            description: "Detected or assumed source language of the input",
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
                      "You are a professional translator. Preserve tone, " +
                      "formatting, and named entities. Return JSON only.",
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
                  {
                    type: "text",
                    text: "Translate the following text into ",
                  },
                  {
                    type: "mention",
                    attrs: {
                      id: "9c7d1b2a-7f2a-4b6c-9f3e-1c2a3b4d5e6f",
                      label: `{"nodeId":"${INPUT_ID}","path":["targetLanguage"]}`,
                    },
                  },
                  { type: "text", text: ":\n\n" },
                  {
                    type: "mention",
                    attrs: {
                      id: "9c7d1b2a-7f2a-4b6c-9f3e-1c2a3b4d5e70",
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
    description: `# 🌐 Translate Workflow

Translate free-form text into a target language with structured output.

### ➡️ Pipeline

1. **Input** — caller passes \`text\` and \`targetLanguage\`.
2. **Translator (LLM)** — produces \`translation\` and \`sourceLanguage\`.
3. **Output** — structured result.

### 📤 Example

- **Input**: \`{ "text": "Hello, world!", "targetLanguage": "Spanish" }\`
- **Output**: \`{ "translation": "¡Hola, mundo!", "sourceLanguage": "English" }\`
`,
    uiConfig: {
      position: { x: -360, y: -380 },
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
    description: "Return the translation",
    uiConfig: { position: { x: 720, y: 0 }, type: "default" },
    nodeConfig: {
      kind: "output",
      outputSchema: { type: "object", properties: {} },
      outputData: [
        {
          key: "translation",
          source: { nodeId: LLM_ID, path: ["translation"] },
        },
        {
          key: "sourceLanguage",
          source: { nodeId: LLM_ID, path: ["sourceLanguage"] },
        },
      ],
    },
  },
];

export const translateEdges: Partial<DBEdge>[] = [
  { source: INPUT_ID, target: LLM_ID, uiConfig: {} },
  { source: LLM_ID, target: OUTPUT_ID, uiConfig: {} },
];
