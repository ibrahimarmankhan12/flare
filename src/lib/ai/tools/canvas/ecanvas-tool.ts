import { generateText, tool } from "ai";
import { randomUUID } from "node:crypto";
import z from "zod";
import { customModelProvider } from "lib/ai/models";
import { getSession } from "auth/server";
import { setCanvasContent } from "lib/ecanvas/content-store";

export const canvasDesignTool = tool({
  description:
    "Create or reuse a visual canvas session for sketching, wireframing, and AI-powered HTML/CSS/JS page generation. Use this when the user wants to design a UI, landing page, or mockup. The tool generates a complete HTML page from your prompt and makes it available inside the canvas preview panel so you can iterate visually. IMPORTANT: If the user already has a canvas open, pass its canvasId to continue working on it instead of creating a new one.",
  inputSchema: z.object({
    prompt: z
      .string()
      .min(1)
      .describe("Detailed description of the page or design to generate."),
    canvasId: z
      .string()
      .optional()
      .describe(
        "Optional existing canvas ID to continue working on. Only omit this if the user hasn't started a canvas yet.",
      ),
  }),
  execute: async ({ prompt, canvasId }) => {
    const id = canvasId || randomUUID();

    // Generate the HTML page
    let generatedHtml = "";
    try {
      const systemPrompt =
        "You are an expert frontend developer. Generate a COMPLETE, self-contained HTML file. " +
        "Use Tailwind CSS via CDN, Google Fonts, and Lucide Icons. " +
        "Make it production-quality with smooth animations, responsive design, and polished visuals. " +
        "Output ONLY valid HTML inside a single ```html code fence. Nothing before or after.";

      const result = await generateText({
        model: customModelProvider.getModel({
          provider: "flare",
          model: "deepseek/v3.2",
        }),
        system: systemPrompt,
        prompt: prompt,
      });

      // Extract HTML from the response
      const raw = result.text?.trim() || "";
      const fenced = raw.match(/```(?:html)?\s*\n?([\s\S]*?)```/i);
      generatedHtml = fenced ? fenced[1].trim() : raw;

      // Store the generated HTML directly in the shared in-process store.
      // (The previous loopback HTTP POST never carried session cookies, so
      // the authenticated route always 401'd and previews came up empty.)
      try {
        const session = await getSession();
        if (session?.user?.id) {
          setCanvasContent(session.user.id, id, generatedHtml);
        }
      } catch {
        // best-effort; preview falls back to sketch mode without stored html
      }
    } catch {
      generatedHtml = "<p>Failed to generate content</p>";
    }

    return {
      canvasUrl: `/ecanvas/${id}`,
      canvasId: id,
      html: generatedHtml,
      message: generatedHtml
        ? `Landing page generated! [Open Canvas](/ecanvas/${id}) to see the result and iterate.`
        : `E Canvas session created. [Open E Canvas](/ecanvas/${id}) to start sketching and generating.`,
    };
  },
});
