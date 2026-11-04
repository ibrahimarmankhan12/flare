import type { ChatModel } from "app-types/chat";

export interface StreamCallbacks {
  onChunk: (text: string, tokenIndex: number) => void;
  onThinking?: (text: string) => void;
  onDone: (
    fullText: string,
    usage: { input_tokens: number | string; output_tokens: number | string },
  ) => void;
  onError: (error: Error) => void;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: any[] | string;
}

interface CanvasGenerateRequest {
  model: ChatModel;
  messages: Message[];
}

function parseDataLine(line: string): any | null {
  if (!line.startsWith("data: ")) return null;
  const payload = line.slice(6).trim();
  if (!payload || payload === "[DONE]") return null;

  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

async function readCanvasStream(
  response: Response,
  callbacks: StreamCallbacks,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing response stream");

  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let tokenCount = 0;
  let usage = {
    input_tokens: 0 as number | string,
    output_tokens: 0 as number | string,
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const event = parseDataLine(line);
      if (!event) continue;

      if (event.type === "thinking" && typeof event.text === "string") {
        callbacks.onThinking?.(event.text);
        continue;
      }

      if (event.type === "chunk" && typeof event.text === "string") {
        fullText += event.text;
        tokenCount += 1;
        callbacks.onChunk(event.text, tokenCount);
        continue;
      }

      if (event.type === "done") {
        usage = {
          input_tokens: event.usage?.input_tokens ?? 0,
          output_tokens: event.usage?.output_tokens ?? 0,
        };
      }

      if (event.type === "error") {
        throw new Error(event.message || "Canvas generation failed");
      }
    }
  }

  callbacks.onDone(fullText, usage);
}

export async function streamChat(
  modelId: string,
  canvasId: string,
  messages: Message[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
) {
  const [provider, model] = modelId.split("/", 2);
  if (!provider || !model) {
    throw new Error("Invalid model selection");
  }

  const payload: CanvasGenerateRequest = {
    model: { provider, model },
    messages,
  };

  const response = await fetch(
    `/api/ecanvas/${encodeURIComponent(canvasId)}/generate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    },
  );

  if (!response.ok) {
    let message = `Canvas API ${response.status}`;
    try {
      const data = await response.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      const text = await response.text().catch(() => "");
      if (text) message = `${message}: ${text}`;
    }
    throw new Error(message);
  }

  return readCanvasStream(response, callbacks);
}

function cleanSyntaxArtifacts(html: string): string {
  let cleaned = html;

  cleaned = cleaned.replace(/<span\s+class="s-[^"]*">/gi, "");
  cleaned = cleaned.replace(/<span\s+class="hljs-[^"]*">/gi, "");
  cleaned = cleaned.replace(/<span\s+class="token\s[^"]*">/gi, "");

  const openSpans = (cleaned.match(/<span[\s>]/gi) || []).length;
  const closeSpans = (cleaned.match(/<\/span>/gi) || []).length;
  let surplus = closeSpans - openSpans;
  if (surplus > 0) {
    cleaned = cleaned.replace(/<\/span>/gi, (match) => {
      if (surplus > 0) {
        surplus -= 1;
        return "";
      }
      return match;
    });
  }

  cleaned = cleaned.replace(/class=class="s-[^"]*">"s-[^"]*">/g, "");
  cleaned = cleaned.replace(/"s-(tag|attr|str|kw|num|comment|meta)">/g, "");
  cleaned = cleaned.replace(
    / class="s-(tag|attr|str|kw|num|comment|meta)"/g,
    "",
  );

  return cleaned;
}

export function extractHTML(text: string): string | null {
  const fenceMatch = text.match(/```(?:html)?\s*\n([\s\S]*?)```/);
  if (fenceMatch) return cleanSyntaxArtifacts(fenceMatch[1].trim());

  const htmlMatch = text.match(/(<!DOCTYPE html[\s\S]*<\/html>)/i);
  if (htmlMatch) return cleanSyntaxArtifacts(htmlMatch[1].trim());

  const tagMatch = text.match(/(<html[\s\S]*<\/html>)/i);
  if (tagMatch) return cleanSyntaxArtifacts(tagMatch[1].trim());

  if (text.trim().startsWith("<")) return cleanSyntaxArtifacts(text.trim());
  return null;
}
