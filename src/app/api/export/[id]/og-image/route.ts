import { chatExportRepository } from "lib/db/repository";
import { ImageResponse } from "next/og";
import { createElement, type ReactElement } from "react";
import { ExportOgFallback, ExportOgImage } from "./template";

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ExportMessage = {
  role?: string;
  parts?: unknown;
};

function clampText(text: string, max: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}...`;
}

function extractText(value: unknown, depth = 0): string {
  if (depth > 4 || value == null) return "";

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => extractText(item, depth + 1))
      .filter(Boolean)
      .join(" ");
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const prioritizedKeys = [
      "text",
      "content",
      "delta",
      "output",
      "value",
    ] as const;

    for (const key of prioritizedKeys) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate;
      }
    }

    return Object.values(record)
      .map((entry) => extractText(entry, depth + 1))
      .filter(Boolean)
      .join(" ");
  }

  return "";
}

function getTextFromMessages(messages: ExportMessage[]) {
  const userMessage = messages.find((msg) => msg.role === "user");
  const assistantMessage = messages.find((msg) => msg.role === "assistant");

  const userText = clampText(extractText(userMessage?.parts), 170);
  const assistantText = clampText(extractText(assistantMessage?.parts), 360);

  return {
    userText: userText || "Start a conversation...",
    assistantText:
      assistantText ||
      "This shared chat includes the full conversation in Flare AI.",
  };
}

function renderImage(element: ReactElement) {
  return new ImageResponse(element, {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const exportChat = await chatExportRepository.selectByIdWithUser(id);

    if (!exportChat) {
      return renderImage(
        createElement(ExportOgFallback, {
          title: "Shared chat not found",
          subtitle: "This export does not exist or may have been removed.",
        }),
      );
    }

    const isExpired = await chatExportRepository.isExpired(id);
    if (isExpired) {
      return renderImage(
        createElement(ExportOgFallback, {
          title: exportChat.title || "Shared chat expired",
          subtitle: "This exported chat link has expired.",
        }),
      );
    }

    const messages = Array.isArray(exportChat.messages)
      ? (exportChat.messages as ExportMessage[])
      : [];
    const { userText, assistantText } = getTextFromMessages(messages);

    return renderImage(
      createElement(ExportOgImage, {
        data: {
          title: clampText(exportChat.title || "Shared Chat", 62),
          author: clampText(exportChat.exporterName || "Anonymous", 32),
          userText,
          assistantText,
        },
      }),
    );
  } catch {
    return renderImage(
      createElement(ExportOgFallback, {
        title: "Shared chat preview",
        subtitle:
          "Open this export in Flare AI to view the full conversation.",
      }),
    );
  }
}
