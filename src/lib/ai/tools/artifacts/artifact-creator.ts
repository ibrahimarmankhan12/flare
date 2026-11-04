import { generateText, tool } from "ai";
import z from "zod";
import { DefaultToolName } from "..";
import { getRuntimeSiteConfig } from "lib/site-config";
import { customModelProvider } from "lib/ai/models";

export type ArtifactToolResult = {
  toolName: DefaultToolName.ArtifactCreation;
  format: "html";
  title: string;
  html: string;
  kind: "artifact" | "presentation";
};

const sanitizeHtmlOutput = (raw: string) => {
  const trimmed = raw.trim();
  // Try extracting from a markdown fenced code block (even with text before/after)
  const fenced = trimmed.match(/```(?:html)?\s*\n?([\s\S]*?)```/i);
  let html = fenced ? fenced[1].trim() : trimmed;
  // If no fences found, try extracting the HTML document directly by tag
  if (!fenced) {
    const htmlMatch = trimmed.match(/<!doctype\s+html[\s\S]*<\/html>/i);
    if (htmlMatch) html = htmlMatch[0];
  }
  if (!/<html[\s>]/i.test(html)) {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Artifact</title>
  </head>
  <body>
    ${html}
  </body>
</html>`;
  }
  return html;
};

export const artifactCreationTool = tool({
  description:
    "Create an interactive HTML artifact that renders inline in the chat window. Use this for games, mini-apps, calculators, demos, dashboards, prototypes, and interactive HTML experiences.",
  inputSchema: z.object({
    prompt: z
      .string()
      .min(4)
      .describe("The artifact requirement and desired interactions."),
    title: z
      .string()
      .optional()
      .describe("Optional artifact title shown in chat."),
    kind: z
      .enum(["artifact", "presentation"])
      .optional()
      .describe("Artifact type. Use presentation for slide-like layouts."),
  }),
  execute: async ({ prompt, title, kind = "artifact" }) => {
    try {
      const artifactTitle = title?.trim() || "Interactive Artifact";

      let artifactModel = "gemini-2.5-flash-lite";
      try {
        const siteConfig = await getRuntimeSiteConfig();
        artifactModel = siteConfig.artifacts.model;
      } catch {
        /* use default */
      }

      const model = customModelProvider.getModelWithFailureFallback({
        provider: "google",
        model: artifactModel,
      });

      const { text } = await generateText({
        model,
        system: `You generate complete standalone HTML artifacts.
Return ONLY valid HTML (no markdown fences, no explanation).
Requirements:
- Single self-contained HTML document with embedded CSS/JS.
- Visually polished dark UI.
- Responsive layout for desktop/mobile.
- Must include meaningful interactivity.
- No external network dependencies.`,
        prompt: `Create a ${kind} artifact with title "${artifactTitle}".
User requirement:
${prompt}`,
      });

      return {
        toolName: DefaultToolName.ArtifactCreation,
        format: "html",
        title: artifactTitle,
        html: sanitizeHtmlOutput(text),
        kind,
      } as ArtifactToolResult;
    } catch (error) {
      console.warn(
        `[ArtifactFallback] Artifact creation failed. Returning graceful error.`,
        error,
      );
      return {
        toolName: DefaultToolName.ArtifactCreation,
        format: "html",
        title: title?.trim() || "Interactive Artifact",
        html: `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Artifact Unavailable</title>
    <style>
      body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f0f0f; color: #e0e0e0; }
      .msg { text-align: center; padding: 2rem; }
      h2 { color: #f0f0f0; margin-bottom: 0.5rem; }
      p { color: #888; }
    </style>
  </head>
  <body>
    <div class="msg">
      <h2>Artifact Generation Unavailable</h2>
      <p>The AI model is currently unavailable. Please try again in a moment.</p>
    </div>
  </body>
</html>`,
        kind: kind ?? "artifact",
      } as ArtifactToolResult;
    }
  },
});
