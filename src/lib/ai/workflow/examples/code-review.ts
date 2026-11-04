import { DBEdge, DBNode } from "app-types/workflow";
import { generateUUID } from "lib/utils";

const INPUT_ID = generateUUID();
const ANALYZER_ID = generateUUID();
const SUMMARIZER_ID = generateUUID();
const OUTPUT_ID = generateUUID();
const NOTE_ID = generateUUID();

/**
 * Code Review — review a code patch and produce a structured critique.
 *
 *   INPUT (code, language, focus?)  →
 *     ANALYZER (issues[], score, severity)  →
 *     SUMMARIZER (markdown review)  →
 *     OUTPUT (issues, score, severity, review)
 *
 * Two-stage pipeline:
 *   1. ANALYZER produces structured JSON (issues, score 0-10, severity).
 *   2. SUMMARIZER turns that JSON into a human-readable markdown review.
 */
export const codeReviewNodes: Partial<DBNode>[] = [
  {
    id: INPUT_ID,
    kind: "input",
    name: "INPUT",
    description: "Receive code to review",
    uiConfig: { position: { x: 0, y: 0 }, type: "default" },
    nodeConfig: {
      kind: "input",
      outputSchema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "The code or diff to review",
          },
          language: {
            type: "string",
            description:
              "Programming language (e.g. 'typescript', 'python'). Optional.",
          },
          focus: {
            type: "string",
            description:
              "Optional focus area: 'security' | 'performance' | 'style' | 'all'.",
          },
        },
        required: ["code"],
      },
    },
  },
  {
    id: ANALYZER_ID,
    kind: "llm",
    name: "ANALYZER",
    description: "Extract issues, score, and severity from the code",
    uiConfig: { position: { x: 360, y: 0 }, type: "default" },
    nodeConfig: {
      kind: "llm",
      model: { provider: "google", model: "Gemini 3 Flash" },
      outputSchema: {
        type: "object",
        properties: {
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                severity: {
                  type: "string",
                  enum: ["info", "minor", "major", "critical"],
                },
                title: { type: "string" },
                description: { type: "string" },
                lineHint: {
                  type: "string",
                  description: "Optional line number or range, as a string",
                },
              },
            },
          },
          score: {
            type: "number",
            description: "Overall quality score from 0 (worst) to 10 (best)",
          },
          severity: {
            type: "string",
            enum: ["info", "minor", "major", "critical"],
            description: "Worst severity found across the issues",
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
                      "You are a strict, fair senior code reviewer. Identify real " +
                      "bugs, security flaws, performance issues, and style problems. " +
                      "Do not invent issues. Be specific.",
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
                content: [{ type: "text", text: "Review the following code:" }],
              },
              {
                type: "paragraph",
                content: [
                  {
                    type: "mention",
                    attrs: {
                      id: "5b9e0a7c-1a2b-4c3d-9e4f-5a6b7c8d9e10",
                      label: `{"nodeId":"${INPUT_ID}","path":["code"]}`,
                    },
                  },
                ],
              },
              {
                type: "paragraph",
                content: [
                  {
                    type: "mention",
                    attrs: {
                      id: "5b9e0a7c-1a2b-4c3d-9e4f-5a6b7c8d9e11",
                      label: `{"nodeId":"${INPUT_ID}","path":["language"]}`,
                    },
                  },
                  {
                    type: "mention",
                    attrs: {
                      id: "5b9e0a7c-1a2b-4c3d-9e4f-5a6b7c8d9e12",
                      label: `{"nodeId":"${INPUT_ID}","path":["focus"]}`,
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
    id: SUMMARIZER_ID,
    kind: "llm",
    name: "REVIEW WRITER",
    description: "Write a markdown review from the analyzer output",
    uiConfig: { position: { x: 720, y: 0 }, type: "default" },
    nodeConfig: {
      kind: "llm",
      model: { provider: "anthropic", model: "Claude Opus 4.6" },
      outputSchema: {
        type: "object",
        properties: {
          review: {
            type: "string",
            description: "Markdown review with sections per issue",
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
                      "You are a code review writer. Turn the structured issues " +
                      "into a concise markdown review with headings per severity. " +
                      "Include the overall score prominently. Be direct.",
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
                    text: "Write the markdown review from this JSON:",
                  },
                ],
              },
              {
                type: "paragraph",
                content: [
                  {
                    type: "mention",
                    attrs: {
                      id: "7d1b2c3e-4f5a-6b7c-8d9e-0f1a2b3c4d11",
                      label: `{"nodeId":"${ANALYZER_ID}","path":["issues"]}`,
                    },
                  },
                ],
              },
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "Score: " },
                  {
                    type: "mention",
                    attrs: {
                      id: "7d1b2c3e-4f5a-6b7c-8d9e-0f1a2b3c4d12",
                      label: `{"nodeId":"${ANALYZER_ID}","path":["score"]}`,
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
    description: `# 🔍 Code Review Workflow

Two-stage review: structured analysis → markdown review.

### ➡️ Pipeline

1. **Input** — caller passes \`code\` (and optional \`language\`, \`focus\`).
2. **Analyzer** — produces \`issues[]\`, \`score\` (0–10), and worst-case \`severity\`.
3. **Review Writer** — turns that into a markdown \`review\` string.
4. **Output** — issues, score, severity, and the prose review.

### 📤 Example output

\`\`\`json
{
  "issues": [
    { "severity": "major", "title": "SQL injection risk",
      "description": "User input concatenated into query …", "lineHint": "42" }
  ],
  "score": 6.5,
  "severity": "major",
  "review": "## Code Review — score 6.5/10\\n\\n### Major\\n- **SQL injection risk** …"
}
\`\`\`
`,
    uiConfig: {
      position: { x: -360, y: -540 },
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
    description: "Return the structured review",
    uiConfig: { position: { x: 1080, y: 0 }, type: "default" },
    nodeConfig: {
      kind: "output",
      outputSchema: { type: "object", properties: {} },
      outputData: [
        {
          key: "issues",
          source: { nodeId: ANALYZER_ID, path: ["issues"] },
        },
        {
          key: "score",
          source: { nodeId: ANALYZER_ID, path: ["score"] },
        },
        {
          key: "severity",
          source: { nodeId: ANALYZER_ID, path: ["severity"] },
        },
        {
          key: "review",
          source: { nodeId: SUMMARIZER_ID, path: ["review"] },
        },
      ],
    },
  },
];

export const codeReviewEdges: Partial<DBEdge>[] = [
  { source: INPUT_ID, target: ANALYZER_ID, uiConfig: {} },
  { source: ANALYZER_ID, target: SUMMARIZER_ID, uiConfig: {} },
  { source: SUMMARIZER_ID, target: OUTPUT_ID, uiConfig: {} },
];
