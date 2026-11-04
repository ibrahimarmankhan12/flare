import { getSession } from "auth/server";
import pptxgen from "pptxgenjs";
import { z } from "zod";

export const runtime = "nodejs";

const slideSchema = z.object({
  index: z.number(),
  title: z.string(),
  bullets: z.array(z.string()).optional().default([]),
  imagePrompt: z.string().optional().default(""),
  imageUrl: z.string().optional(),
});

const exportSchema = z.object({
  title: z.string().optional().default("Presentation"),
  slides: z.array(slideSchema).min(1),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: z.infer<typeof exportSchema>;
  try {
    const body = await request.json();
    payload = exportSchema.parse(body);
  } catch {
    return new Response("Invalid export payload", { status: 400 });
  }

  const presentation = new pptxgen();
  presentation.layout = "LAYOUT_16x9";
  presentation.title = payload.title;

  for (const slide of payload.slides) {
    const pptSlide = presentation.addSlide();

    pptSlide.addText(slide.title, {
      x: 0.5,
      y: 0.5,
      w: "90%",
      h: 1,
      fontSize: 32,
      bold: true,
      color: "003366",
    });

    if (slide.bullets.length > 0) {
      pptSlide.addText(
        slide.bullets.map((bullet) => ({
          text: bullet,
          options: { bullet: true },
        })),
        {
          x: 0.5,
          y: 1.8,
          w: "45%",
          h: 3.5,
          fontSize: 18,
          color: "333333",
          valign: "top",
        },
      );
    }

    if (slide.imageUrl) {
      try {
        pptSlide.addImage({
          path: slide.imageUrl,
          x: slide.index === 1 ? "10%" : "55%",
          y: slide.index === 1 ? "30%" : 1.8,
          w: slide.index === 1 ? "80%" : "40%",
          h: slide.index === 1 ? "60%" : 3.5,
          sizing: {
            type: "contain",
            w: slide.index === 1 ? "80%" : "40%",
            h: slide.index === 1 ? "60%" : 3.5,
          },
        });
      } catch {
        // Keep export resilient even when one image URL is invalid/unreachable.
      }
    }
  }

  const exported = await presentation.write({ outputType: "nodebuffer" });
  const buffer =
    exported instanceof Uint8Array
      ? Buffer.from(exported)
      : Buffer.from(String(exported));
  const sanitizedTitle = payload.title
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .trim();
  const fileName = `${sanitizedTitle || "Presentation"}.pptx`;

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename=\"${fileName}\"`,
      "Cache-Control": "no-store",
    },
  });
}
