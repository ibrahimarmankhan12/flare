import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getSession } from "auth/server";
import { customModelProvider } from "lib/ai/models";
import type { ChatModel } from "app-types/chat";

type CanvasMessage = {
  role: "user" | "assistant" | "system";
  content: any[] | string;
};

function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toUIMessage(message: CanvasMessage, id: string): UIMessage {
  if (typeof message.content === "string") {
    return {
      id,
      role: message.role,
      parts: [{ type: "text", text: message.content }],
    };
  }

  const parts: UIMessage["parts"] = [];
  for (const part of message.content) {
    if (part?.type === "text") {
      parts.push({ type: "text", text: toText(part.text) });
      continue;
    }

    if (
      part?.type === "image" &&
      part.source?.data &&
      part.source?.media_type
    ) {
      parts.push({
        type: "file",
        filename: "canvas-image.png",
        mediaType: part.source.media_type,
        url: `data:${part.source.media_type};base64,${part.source.data}`,
      });
      continue;
    }

    if (part?.type === "image_url" && typeof part.image_url?.url === "string") {
      parts.push({
        type: "file",
        filename: "canvas-image.png",
        mediaType: "image/png",
        url: part.image_url.url,
      });
    }
  }

  return {
    id,
    role: message.role,
    parts,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ canvasId: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { canvasId } = await params;
  if (!canvasId) {
    return Response.json({ message: "Missing canvas id" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as {
      model?: ChatModel;
      messages?: CanvasMessage[];
    };

    const model = body.model;
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (!model?.provider || !model?.model) {
      return Response.json(
        { message: "Invalid model payload" },
        { status: 400 },
      );
    }

    if (messages.length === 0) {
      return Response.json({ message: "Missing messages" }, { status: 400 });
    }

    const uiMessages = messages.map((msg, index) =>
      toUIMessage(msg, `canvas-${canvasId}-${index}`),
    );
    const modelMessages = await convertToModelMessages(uiMessages);

    const result = streamText({
      model: customModelProvider.getModel(model),
      messages: modelMessages,
      abortSignal: request.signal,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let inputTokens = 0;
        let outputTokens = 0;

        try {
          for await (const chunk of result.fullStream) {
            if (chunk.type === "text-delta") {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "chunk", text: chunk.text })}\n\n`,
                ),
              );
              continue;
            }

            if (chunk.type === "reasoning-delta") {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "thinking", text: chunk.text })}\n\n`,
                ),
              );
              continue;
            }

            if (chunk.type === "finish") {
              inputTokens = chunk.totalUsage?.inputTokens || 0;
              outputTokens = chunk.totalUsage?.outputTokens || 0;
            }
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "done",
                usage: {
                  input_tokens: inputTokens,
                  output_tokens: outputTokens,
                },
              })}\n\n`,
            ),
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error: any) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                message: error?.message || "Generation failed",
              })}\n\n`,
            ),
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return Response.json(
      { message: "Invalid canvas generation request" },
      { status: 400 },
    );
  }
}
