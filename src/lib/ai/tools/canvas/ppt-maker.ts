import { generateObject, generateText, tool } from "ai";
import { DefaultToolName } from "lib/ai/tools";
import { getRuntimeSiteConfig } from "lib/site-config";
import z from "zod";

import { customModelProvider } from "lib/ai/models";

type CanvasSlide = {
  index: number;
  title: string;
  bullets: string[];
  imagePrompt?: string;
  imageUrl?: string;
};

const inferCanvasKind = (prompt: string) => {
  const normalized = prompt.toLowerCase();
  if (/\b(ppt|powerpoint|slides?|deck|presentation)\b/.test(normalized)) {
    return "presentation" as const;
  }
  return "html" as const;
};

const sanitizeHtmlOutput = (raw: string) => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:html)?\s*\n?([\s\S]*?)```/i);
  let html = fenced ? fenced[1].trim() : trimmed;
  if (!fenced) {
    const htmlMatch = trimmed.match(/<!doctype\s+html[\s\S]*<\/html>/i);
    if (htmlMatch) html = htmlMatch[0];
  }
  return html;
};

export const canvasPptMakerTool = tool({
  description:
    "Create a Canvas artifact that opens in a right-side workspace. Use this for presentations, slide decks, standalone HTML pages, interactive HTML (games, mini-apps, demos), landing pages, reports, mockups, and visual content. For interactive HTML like games, use kind='html'.",
  inputSchema: z.object({
    prompt: z
      .string()
      .min(3)
      .describe("What the user wants to create in Canvas."),
    kind: z
      .enum(["auto", "presentation", "html", "document"])
      .optional()
      .describe(
        "Canvas output type. Use presentation for slides/decks/PPT. Use html for web pages, reports, visual pages, and interactive content.",
      ),
    slideCount: z
      .number()
      .min(3)
      .max(12)
      .optional()
      .describe(
        "Number of slides to generate for presentations, default is 6.",
      ),
    tone: z
      .enum(["professional", "startup", "academic", "creative", "minimal"])
      .optional()
      .describe("Writing and visual style."),
  }),
  execute: async ({
    prompt,
    kind = "auto",
    slideCount = 6,
    tone = "professional",
  }) => {
    try {
      const contentType =
        kind === "auto" || kind === "document" ? inferCanvasKind(prompt) : kind;
      let canvasModel = "DeepSeek V4 Flash";
      try {
        const siteConfig = await getRuntimeSiteConfig();
        canvasModel = siteConfig.canvas.model;
      } catch {
        /* use default */
      }
      const model = customModelProvider.getModelWithFailureFallback({
        provider: "flare",
        model: canvasModel,
      });

      if (contentType === "html") {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 85000);
        try {
          const { text } = await generateText({
            model,
            abortSignal: controller.signal,
            system: `You generate complete standalone HTML canvas artifacts.
Return ONLY valid HTML (no markdown fences, no explanation).
Requirements:
- Single self-contained HTML with embedded CSS/JS.
- Dark UI, responsive, interactive when requested.
- No external deps, remote fonts, or tracking.
- Inline all CSS in <style> and JS in <script>.`,
            prompt: `Create a Canvas HTML artifact for this request: ${prompt}`,
          });

          const sanitized = sanitizeHtmlOutput(text);

          // Extract a title from the HTML
          const titleMatch = sanitized.match(/<title>([^<]*)<\/title>/i);
          const title = titleMatch ? titleMatch[1].trim() : "Canvas";

          clearTimeout(timeoutId);
          return {
            toolName: DefaultToolName.Canvas,
            status: "ready",
            canvasId: `canvas_${Date.now()}`,
            contentType: "html",
            title: title,
            summary: "Canvas HTML artifact created successfully.",
            html: sanitized,
            estimatedTime: "Ready now",
            actions: {
              editorLabel: "Open Canvas",
            },
          };
        } catch (genError) {
          clearTimeout(timeoutId);
          throw genError;
        }
      }

      const clampedSlides = Math.max(3, Math.min(12, slideCount));

      const { object: aiResult } = await generateObject({
        model,
        system: `You create concise, polished slide decks for an in-app Canvas.
Generate exactly ${clampedSlides} slides.
Each slide needs a strong title and 3-4 short bullets.
No image generation is available, so write image prompts only as optional design guidance.
Keep copy clean and useful for an editable presentation canvas.`,
        prompt: `Topic: ${prompt}\nTone: ${tone}`,
        schema: z.object({
          title: z.string().describe("Main title of the presentation."),
          summary: z
            .string()
            .describe("One sentence describing the generated deck."),
          slides: z.array(
            z.object({
              title: z.string().describe("Slide title."),
              bullets: z.array(z.string()).min(1).max(5),
              imagePrompt: z
                .string()
                .optional()
                .describe("Optional visual direction for the slide."),
            }),
          ),
        }),
      });

      const slides: CanvasSlide[] = aiResult.slides
        .slice(0, clampedSlides)
        .map((slide, index) => ({
          index: index + 1,
          title: slide.title,
          bullets: slide.bullets,
          imagePrompt: slide.imagePrompt,
        }));

      return {
        toolName: DefaultToolName.Canvas,
        status: "ready",
        canvasId: `canvas_${Date.now()}`,
        contentType: "presentation",
        title: aiResult.title || prompt,
        summary: aiResult.summary,
        tone,
        slideCount: slides.length,
        estimatedTime: "Ready now",
        slides,
        actions: {
          exportLabel: "Export to Slides",
          editorLabel: "Open Canvas",
        },
      };
    } catch (error) {
      console.warn(
        `[CanvasFallback] Canvas generation failed. Returning graceful error.`,
        error,
      );
      return {
        toolName: DefaultToolName.Canvas,
        status: "error",
        canvasId: `canvas_${Date.now()}`,
        contentType: "presentation",
        title: "Canvas",
        summary:
          "Canvas generation is temporarily unavailable. Please try again.",
        estimatedTime: "Error",
        error:
          "Canvas generation failed. The AI model is currently unavailable. Please try again in a moment.",
      };
    }
  },
});
