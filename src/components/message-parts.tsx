"use client";

import { useCopy } from "@/hooks/use-copy";
import type { UseChatHelpers } from "@ai-sdk/react";
import {
  FileUIPart,
  ToolUIPart,
  UIMessage,
  getToolName,
  isToolUIPart,
} from "ai";
import { cn, safeJSONParse, toAny, truncateString } from "lib/utils";
import {
  Check,
  ChevronDownIcon,
  ChevronRight,
  ChevronUp,
  Copy,
  CornerRightUp,
  Download,
  ExternalLink,
  FileIcon,
  GitBranch,
  HammerIcon,
  Loader,
  Pencil,
  RefreshCw,
  Trash2,
  TriangleAlert,
  X,
  ZoomIn,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import JsonView from "ui/json-view";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";
import { CitationList } from "./chat/citation";
import { Markdown } from "./markdown";
import { MessageEditor } from "./message-editor";

import {
  deleteMessageAction,
  deleteMessagesByChatIdAfterTimestampAction,
} from "@/app/api/chat/actions";
import { AnimatePresence, motion } from "framer-motion";
import { SelectModel } from "./select-model";

import { ChatModel, ManualToolConfirmTag } from "app-types/chat";
import type { RetrievedChunk } from "lib/rag/format";
import { toast } from "sonner";
import { safe } from "ts-safe";

import { extractMCPToolId } from "lib/ai/mcp/mcp-tool-id";
import { useTranslations } from "next-intl";
import { Separator } from "ui/separator";

import {
  VercelAIWorkflowToolStreamingResult,
  VercelAIWorkflowToolStreamingResultTag,
} from "app-types/workflow";
import { DefaultToolName, ImageToolName } from "lib/ai/tools";
import equal from "lib/equal";
import {
  Shortcut,
  getShortcutKeyList,
  isShortcutEvent,
} from "lib/keyboard-shortcuts";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import { TextShimmer } from "ui/text-shimmer";

import { SavedNoteCitation } from "app-types/user";
import { forkThread as forkThreadRequest } from "lib/chat/fork-thread";
import {
  buildSavedNoteMarkdown,
  downloadMarkdownFile,
  getNoteTitleFromMarkdown,
} from "lib/notes";
import { notify } from "lib/notify";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "ui/dialog";
import { Input } from "ui/input";
import { WorkflowInvocation } from "./tool-invocation/workflow-invocation";

type MessagePart = UIMessage["parts"][number];
type TextMessagePart = Extract<MessagePart, { type: "text" }>;
type AssistMessagePart = Extract<MessagePart, { type: "text" }>;

interface UserMessagePartProps {
  part: TextMessagePart;
  isLast: boolean;
  message: UIMessage;
  setMessages?: UseChatHelpers<UIMessage>["setMessages"];
  sendMessage?: UseChatHelpers<UIMessage>["sendMessage"];
  status?: UseChatHelpers<UIMessage>["status"];
  isError?: boolean;
  readonly?: boolean;
}

interface AssistMessagePartProps {
  part: AssistMessagePart;
  isLast?: boolean;
  isLoading?: boolean;
  message: UIMessage;
  prevMessage?: UIMessage;
  showActions: boolean;
  threadId?: string;
  setMessages?: UseChatHelpers<UIMessage>["setMessages"];
  sendMessage?: UseChatHelpers<UIMessage>["sendMessage"];
  isError?: boolean;
  readonly?: boolean;
}

interface ToolMessagePartProps {
  part: ToolUIPart;
  messageId: string;
  showActions: boolean;
  isLast?: boolean;
  isManualToolInvocation?: boolean;
  addToolResult?: UseChatHelpers<UIMessage>["addToolResult"];
  isError?: boolean;
  setMessages?: UseChatHelpers<UIMessage>["setMessages"];
  readonly?: boolean;
}

const MAX_TEXT_LENGTH = 600;
const MAX_INLINE_SOURCE_CARDS = 3;

type CitationEntry = {
  id: number;
  url: string;
  title: string;
};

const citationMarkerRegex = /\[(\d+)\](?!\()/g;
const markdownImageRegex = /!\[[^\]]*]\((?:[^)(]|\([^)]*\))*\)/g;
const htmlImageRegex = /<img[^>]*>/gi;

const extractCitationMapFromMessage = (message: UIMessage) => {
  const citationMap = new Map<number, CitationEntry>();

  for (const part of message.parts) {
    if (!isToolUIPart(part) || !part.state.startsWith("output")) continue;

    const toolName = getToolName(part);
    if (
      toolName !== DefaultToolName.WebSearch &&
      toolName !== DefaultToolName.WebContent
    ) {
      continue;
    }

    const output = toAny(part.output);
    const citations = Array.isArray(output?.citations) ? output.citations : [];

    if (citations.length > 0) {
      for (const citation of citations) {
        const id = Number(citation?.id);
        const url = typeof citation?.url === "string" ? citation.url : "";
        const title =
          typeof citation?.title === "string" && citation.title.trim()
            ? citation.title.trim()
            : url;

        if (!Number.isFinite(id) || id <= 0 || !url) continue;
        citationMap.set(id, { id, url, title });
      }
      continue;
    }

    const results = Array.isArray(output?.results) ? output.results : [];
    results.forEach((result: any, index: number) => {
      const id = index + 1;
      const url = typeof result?.url === "string" ? result.url : "";
      const title =
        typeof result?.title === "string" && result.title.trim()
          ? result.title.trim()
          : url;
      if (!url) return;
      citationMap.set(id, { id, url, title });
    });
  }

  return citationMap;
};

const hasSourcesSection = (text: string) => {
  return /(^|\n)\s{0,3}(#{1,6}\s*)?(sources|references)\b/i.test(text);
};

const collapseStandaloneCitationMarkerLines = (text: string) => {
  if (!text) return text;

  const lines = text.split("\n");
  const merged: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine ?? "";
    const trimmed = line.trim();

    const isCitationOnlyLine = /^(\[\d+\]\s*)+\.?$/.test(trimmed);
    if (!isCitationOnlyLine) {
      merged.push(line);
      continue;
    }

    let targetIndex = merged.length - 1;
    while (targetIndex >= 0 && merged[targetIndex].trim().length === 0) {
      targetIndex -= 1;
    }

    if (targetIndex >= 0) {
      const punctuation = trimmed.endsWith(".") ? "." : "";
      const citationText = punctuation ? trimmed.slice(0, -1).trim() : trimmed;
      merged[targetIndex] =
        `${merged[targetIndex].trimEnd()} ${citationText}${punctuation}`.trimEnd();
    } else {
      merged.push(line);
    }
  }

  return merged.join("\n");
};

const toCitationMarkdownTitle = (title: string) => {
  return title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
};

const applyCitationLinks = ({
  text,
  citationMap,
}: {
  text: string;
  citationMap: Map<number, CitationEntry>;
}) => {
  if (!text || citationMap.size === 0) return text;
  const normalizedText = collapseStandaloneCitationMarkerLines(text);

  const linkedText = normalizedText.replace(
    citationMarkerRegex,
    (full, idRaw) => {
      const id = Number(idRaw);
      const citation = citationMap.get(id);
      if (!citation) return full;

      const title = toCitationMarkdownTitle(citation.title || citation.url);
      return `[${id}](${citation.url} "${title}")`;
    },
  );

  return linkedText;
};

const stripMarkdownImageBlocks = (text: string) => {
  if (!text) return text;
  return text
    .replace(markdownImageRegex, "")
    .replace(htmlImageRegex, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const extractUsedCitations = ({
  text,
  citationMap,
}: {
  text: string;
  citationMap: Map<number, CitationEntry>;
}) => {
  if (!text || citationMap.size === 0) return [] as CitationEntry[];
  if (hasSourcesSection(text)) return [] as CitationEntry[];

  const ids = new Set<number>();
  for (const match of text.matchAll(/\[(\d+)\]\(/g)) {
    const id = Number(match[1]);
    if (!Number.isFinite(id)) continue;
    if (!citationMap.has(id)) continue;
    ids.add(id);
  }

  return Array.from(ids)
    .sort((a, b) => a - b)
    .map((id) => citationMap.get(id))
    .filter((citation): citation is CitationEntry => Boolean(citation));
};

const getCitationHost = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const getCitationFaviconUrl = (url: string) => {
  const host = getCitationHost(url);
  if (!host) return "";
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
};

const truncateCitationTitle = (title: string) => {
  return truncateString(title || "", 78);
};

export const UserMessagePart = memo(
  function UserMessagePart({
    part,
    isLast,
    status,
    message,
    setMessages,
    sendMessage,
    readonly,
    isError,
  }: UserMessagePartProps) {
    const { copied, copy } = useCopy();
    const t = useTranslations();
    const [mode, setMode] = useState<"view" | "edit">("view");
    const [isDeleting, setIsDeleting] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const scrolledRef = useRef(false);

    // Check if this is a reply quote part
    const replyQuoteMatch = part.text.match(
      /^\[REPLY_QUOTE\]([\s\S]*)\[\/REPLY_QUOTE\]$/,
    );
    const isReplyQuote = !!replyQuoteMatch;
    const quoteContent = replyQuoteMatch ? replyQuoteMatch[1] : null;

    const actualText = isReplyQuote ? "" : part.text;
    const isLongText = actualText.length > MAX_TEXT_LENGTH;
    const displayText =
      expanded || !isLongText
        ? actualText
        : truncateString(actualText, MAX_TEXT_LENGTH);

    const deleteMessage = useCallback(async () => {
      if (!setMessages) return;
      const ok = await notify.confirm({
        title: "Delete Message",
        description: "Are you sure you want to delete this message?",
      });
      if (!ok) return;
      safe(() => setIsDeleting(true))
        .ifOk(() => deleteMessageAction(message.id))
        .ifOk(() =>
          setMessages((messages) => {
            const index = messages.findIndex((m) => m.id === message.id);
            if (index !== -1) {
              return messages.filter((_, i) => i !== index);
            }
            return messages;
          }),
        )
        .ifFail((error) => toast.error(error.message))
        .watch(() => setIsDeleting(false))
        .unwrap();
    }, [message.id]);

    useEffect(() => {
      if (status === "submitted" && isLast && !scrolledRef.current) {
        scrolledRef.current = true;
        ref.current?.scrollIntoView({ behavior: "smooth" });
      }
    }, [status]);

    if (mode === "edit" && setMessages && sendMessage) {
      return (
        <div className="flex flex-row gap-2 items-start w-full">
          <MessageEditor
            message={message}
            setMode={setMode}
            setMessages={setMessages}
            sendMessage={sendMessage}
          />
        </div>
      );
    }

    // If this is a reply quote, render it differently
    if (isReplyQuote && quoteContent) {
      return (
        <div className="flex flex-col gap-2 items-end mt-2 mb-0.5">
          <div className="flex items-center gap-2 max-w-[80%]">
            <CornerRightUp className="size-4 text-muted-foreground flex-shrink-0 rotate-90" />
            <div
              data-testid="message-content"
              className="bg-muted/50 backdrop-blur-sm border border-border/50 px-3 py-2 rounded-lg text-sm text-muted-foreground"
            >
              <p className="whitespace-pre-wrap break-words line-clamp-3">
                {quoteContent}
              </p>
            </div>
          </div>
        </div>
      );
    }

    // Don't render empty text parts (like when the quote is handled separately)
    if (!displayText.trim()) {
      return null;
    }

    return (
      <div className="flex flex-col gap-2 items-end my-2">
        <div
          data-testid="message-content"
          className={cn(
            "flex flex-col gap-4 max-w-full ring ring-input relative overflow-hidden",
            {
              "bg-accent text-accent-foreground px-4 py-3 rounded-2xl": isLast,
              "opacity-50": isError,
            },
            isError && "border-destructive border",
          )}
        >
          {isLongText && !expanded && (
            <div className="absolute pointer-events-none bg-gradient-to-t from-accent to-transparent w-full h-40 bottom-0 left-0" />
          )}
          <p className={cn("whitespace-pre-wrap text-sm break-words")}>
            {displayText}
          </p>
          {isLongText && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="h-auto p-1 text-xs z-10 text-muted-foreground hover:text-foreground self-start"
            >
              <span className="flex items-center gap-1">
                {t(expanded ? "Common.showLess" : "Common.showMore")}
                {expanded ? (
                  <ChevronUp className="size-3" />
                ) : (
                  <ChevronDownIcon className="size-3" />
                )}
              </span>
            </Button>
          )}
        </div>
        {isLast && (
          <div className="flex w-full justify-end opacity-0 group-hover/message:opacity-100 transition-opacity duration-300">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  data-testid="message-edit-button"
                  variant="ghost"
                  size="icon"
                  className={cn("size-3! p-4!")}
                  onClick={() => copy(part.text)}
                >
                  {copied ? <Check /> : <Copy />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Copy</TooltipContent>
            </Tooltip>
            {!readonly && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      data-testid="message-edit-button"
                      variant="ghost"
                      size="icon"
                      className="size-3! p-4!"
                      onClick={() => setMode("edit")}
                    >
                      <Pencil />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Edit</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      disabled={isDeleting}
                      onClick={deleteMessage}
                      variant="ghost"
                      size="icon"
                      className="size-3! p-4! hover:text-destructive"
                    >
                      {isDeleting ? (
                        <Loader className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-destructive" side="bottom">
                    Delete Message
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        )}
        <div ref={ref} className="min-w-0" />
      </div>
    );
  },
  (prev, next) => {
    if (prev.part.text != next.part.text) return false;
    if (prev.isError != next.isError) return false;
    if (prev.isLast != next.isLast) return false;
    if (prev.status != next.status) return false;
    if (prev.message.id != next.message.id) return false;
    if (!equal(prev.part, next.part)) return false;
    return true;
  },
);
UserMessagePart.displayName = "UserMessagePart";

export const AssistMessagePart = memo(function AssistMessagePart({
  part,
  showActions,
  message,
  prevMessage,
  isError,
  threadId,
  setMessages,
  readonly,
  sendMessage,
}: AssistMessagePartProps) {
  const { copied, copy } = useCopy();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isForking, setIsForking] = useState(false);
  const [isSourcesSheetOpen, setIsSourcesSheetOpen] = useState(false);
  const [isForkDialogOpen, setIsForkDialogOpen] = useState(false);
  const [branchLabel, setBranchLabel] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const stripLegacyToolTranscript = (text: string) => {
    return text
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
      .replace(/<tool_result>[\s\S]*?<\/tool_result>/gi, "")
      .replace(/<tool_call>[\s\S]*$/gi, "")
      .replace(/<tool_result>[\s\S]*$/gi, "")
      .trim();
  };

  const { thinkingText, answerText, isStreaming } = useMemo(() => {
    const cleanedText = stripLegacyToolTranscript(part.text);
    // First try to match complete thinking blocks
    const completeRegex = /<think>([\s\S]*?)(?:<\/think>|<think\/>)/i;
    const completeMatch = cleanedText.match(completeRegex);

    if (completeMatch) {
      const cleanedAnswer = cleanedText.replace(completeMatch[0], "").trim();
      return {
        thinkingText: completeMatch[1].trim(),
        answerText: cleanedAnswer,
        isStreaming: false,
      };
    }

    // Check for incomplete/streaming thinking block (has opening tag but no closing tag yet)
    const streamingRegex = /<think>([\s\S]*)$/i;
    const streamingMatch = cleanedText.match(streamingRegex);

    if (streamingMatch) {
      return {
        thinkingText: streamingMatch[1].trim(),
        answerText: "",
        isStreaming: true,
      };
    }

    return {
      thinkingText: "",
      answerText: cleanedText,
      isStreaming: false,
    };
  }, [part.text]);

  const citationMap = useMemo(() => {
    return extractCitationMapFromMessage(message);
  }, [message.parts]);

  // P2.3 — RAG chunks persisted on the assistant message metadata. The
  // chat route writes `metadata.retrievedChunks` after the retrieval
  // pass completes (see `src/app/api/chat/route.ts`). The chip strip
  // is independent of the web-search citations block above; they
  // coexist (web search has its own UX, RAG has the chip strip).
  const ragChunks = useMemo<RetrievedChunk[]>(() => {
    const raw = (message.metadata as { retrievedChunks?: unknown })
      ?.retrievedChunks;
    if (!Array.isArray(raw) || raw.length === 0) return [];
    return raw.filter((c): c is RetrievedChunk => {
      return (
        c !== null &&
        typeof c === "object" &&
        typeof (c as RetrievedChunk).id === "string" &&
        typeof (c as RetrievedChunk).content === "string" &&
        typeof (c as RetrievedChunk).position === "number" &&
        typeof (c as RetrievedChunk).documentId === "string" &&
        typeof (c as RetrievedChunk).collectionItemId === "string" &&
        typeof (c as RetrievedChunk).score === "number"
      );
    });
  }, [message.metadata]);

  const hasImageToolOutput = useMemo(() => {
    return message.parts.some((messagePart) => {
      if (!isToolUIPart(messagePart)) return false;
      if (getToolName(messagePart) !== ImageToolName) return false;
      if (!messagePart.state.startsWith("output")) return false;

      const output = toAny(messagePart.output);
      return Array.isArray(output?.images) && output.images.length > 0;
    });
  }, [message.parts]);

  const resolvedAnswerText = useMemo(() => {
    return applyCitationLinks({
      text: answerText || part.text,
      citationMap,
    });
  }, [answerText, part.text, citationMap]);

  const renderedAnswerText = useMemo(() => {
    if (!hasImageToolOutput) return resolvedAnswerText;
    return stripMarkdownImageBlocks(resolvedAnswerText);
  }, [resolvedAnswerText, hasImageToolOutput]);

  const shouldRenderAnswer = useMemo(() => {
    if (renderedAnswerText.trim().length > 0) return true;
    return !thinkingText && !hasImageToolOutput;
  }, [renderedAnswerText, thinkingText, hasImageToolOutput]);

  const usedCitations = useMemo(() => {
    return extractUsedCitations({
      text: resolvedAnswerText,
      citationMap,
    });
  }, [resolvedAnswerText, citationMap]);

  const inlineCitations = useMemo(() => {
    return usedCitations.slice(0, MAX_INLINE_SOURCE_CARDS);
  }, [usedCitations]);

  const noteCitations = useMemo(() => {
    return usedCitations.map((citation) => ({
      id: citation.id,
      title: citation.title,
      url: citation.url,
    })) as SavedNoteCitation[];
  }, [usedCitations]);

  const noteTitle = useMemo(() => {
    return getNoteTitleFromMarkdown(renderedAnswerText || part.text);
  }, [renderedAnswerText, part.text]);

  const deleteMessage = useCallback(async () => {
    if (!setMessages) return;
    const ok = await notify.confirm({
      title: "Delete Message",
      description: "Are you sure you want to delete this message?",
    });
    if (!ok) return;
    safe(() => setIsDeleting(true))
      .ifOk(() => deleteMessageAction(message.id))
      .ifOk(() =>
        setMessages((messages) => {
          const index = messages.findIndex((m) => m.id === message.id);
          if (index !== -1) {
            return messages.filter((_, i) => i !== index);
          }
          return messages;
        }),
      )
      .ifFail((error) => toast.error(error.message))
      .watch(() => setIsDeleting(false))
      .unwrap();
  }, [message.id]);

  const handleModelChange = (model: ChatModel) => {
    if (!setMessages || !sendMessage || !prevMessage) return;
    safe(() => setIsLoading(true))
      .ifOk(() =>
        threadId
          ? deleteMessagesByChatIdAfterTimestampAction(message.id)
          : Promise.resolve(),
      )
      .ifOk(() =>
        setMessages((messages) => {
          const index = messages.findIndex((m) => m.id === prevMessage.id);
          if (index !== -1) {
            return [...messages.slice(0, index)];
          }
          return messages;
        }),
      )
      .ifOk(() =>
        sendMessage(prevMessage, {
          body: {
            model,
          },
        }),
      )
      .ifFail((error) => toast.error(error.message))
      .watch(() => setIsLoading(false))
      .unwrap();
  };

  const handleSaveToNotes = useCallback(async () => {
    const markdown = buildSavedNoteMarkdown({
      title: noteTitle,
      markdownBody: renderedAnswerText || part.text,
      citations: noteCitations,
    });

    safe(() => setIsSavingNote(true))
      .ifOk(async () => {
        const response = await fetch("/api/user/notes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: noteTitle,
            markdown,
            citations: noteCitations,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data?.error || "Failed to save note");
        }

        return response.json();
      })
      .ifOk(() => {
        downloadMarkdownFile({
          title: noteTitle,
          markdown,
        });
      })
      .watch((result) => {
        if (result.isOk) {
          toast.success("Saved to notes");
        } else {
          toast.error(result.error.message || "Failed to save note");
        }
      })
      .watch(() => setIsSavingNote(false))
      .unwrap();
  }, [noteTitle, renderedAnswerText, part.text, noteCitations]);

  // Phase 1+#8 — "Fork from here" affordance on assistant messages.
  // Posts to /api/thread/[id]/fork (P1.7) and navigates to the new
  // thread. Disabled in read-only contexts and while a fork is already
  // in flight. The optional `branchLabel` is appended to the new
  // thread's title by the server (see P1.7 fork route).
  const handleFork = useCallback(
    async (label?: string) => {
      if (!threadId) return;
      if (isForking) return;
      setIsForking(true);
      try {
        const newThread = await forkThreadRequest(threadId, {
          forkFromMessageId: message.id,
          ...(label && label.trim().length > 0
            ? { branchLabel: label.trim() }
            : {}),
        });
        router.push(`/chat/${newThread.id}`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to fork thread";
        toast.error(message);
      } finally {
        setIsForking(false);
        setIsForkDialogOpen(false);
        setBranchLabel("");
      }
    },
    [threadId, message.id, isForking, router],
  );

  return (
    <div
      className={cn(
        isLoading && "animate-pulse",
        "flex flex-col gap-2 group/message",
      )}
    >
      <div
        data-testid="message-content"
        className={cn("flex flex-col gap-4 px-2", {
          "opacity-50 border border-destructive bg-card rounded-lg": isError,
        })}
      >
        {(thinkingText || isStreaming) && (
          <ReasoningPart
            reasoningText={thinkingText}
            isThinking={isStreaming}
          />
        )}
        {shouldRenderAnswer && <Markdown>{renderedAnswerText}</Markdown>}
        {ragChunks.length > 0 && <CitationList chunks={ragChunks} />}
        {usedCitations.length > 0 && (
          <div className="mt-1 rounded-xl border border-border/70 bg-muted/35 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsSourcesSheetOpen(true)}
                className="inline-flex items-center rounded-full bg-background/70 border border-border px-3 py-1 text-sm font-semibold hover:bg-accent transition-colors"
              >
                {usedCitations.length} Sources
              </button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => setIsSourcesSheetOpen(true)}
              >
                Open all
              </Button>
            </div>
            <div className="space-y-2">
              {inlineCitations.map((citation) => (
                <a
                  key={citation.id}
                  href={citation.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border border-border/60 bg-background/30 px-3 py-2 hover:bg-accent/60 transition-colors"
                >
                  <div className="flex items-start gap-2 text-sm">
                    <Avatar className="size-5 mt-0.5 ring-1 ring-border/70">
                      <AvatarImage
                        src={getCitationFaviconUrl(citation.url)}
                        alt={getCitationHost(citation.url)}
                      />
                      <AvatarFallback className="text-[10px]">
                        {getCitationHost(citation.url)
                          .slice(0, 1)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-semibold text-muted-foreground mt-0.5">
                      [{citation.id}]
                    </span>
                    <span className="font-medium leading-5 flex-1">
                      {truncateCitationTitle(citation.title)}
                    </span>
                    <ExternalLink className="size-3.5 text-muted-foreground mt-0.5" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate pl-7">
                    {getCitationHost(citation.url)}
                  </p>
                </a>
              ))}
              {usedCitations.length > inlineCitations.length && (
                <button
                  type="button"
                  onClick={() => setIsSourcesSheetOpen(true)}
                  className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
                >
                  + {usedCitations.length - inlineCitations.length} more sources
                </button>
              )}
            </div>

            <Sheet
              open={isSourcesSheetOpen}
              onOpenChange={setIsSourcesSheetOpen}
            >
              <SheetContent
                side="right"
                className="w-full sm:max-w-md p-0 gap-0"
              >
                <SheetHeader className="border-b px-5 py-4">
                  <SheetTitle>Sources</SheetTitle>
                </SheetHeader>
                <div className="p-4 overflow-y-auto space-y-3">
                  {usedCitations.map((citation) => (
                    <a
                      key={`sheet-${citation.id}`}
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-2xl border border-border/70 bg-background/40 px-4 py-3 hover:bg-accent/70 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="size-6 mt-0.5 ring-1 ring-border/70">
                          <AvatarImage
                            src={getCitationFaviconUrl(citation.url)}
                            alt={getCitationHost(citation.url)}
                          />
                          <AvatarFallback className="text-[10px]">
                            {getCitationHost(citation.url)
                              .slice(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2 text-sm">
                            <span className="text-xs font-semibold text-muted-foreground mt-0.5">
                              [{citation.id}]
                            </span>
                            <span className="font-medium leading-5 break-words">
                              {truncateCitationTitle(citation.title)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 truncate pl-5">
                            {getCitationHost(citation.url)}
                          </p>
                        </div>
                        <ExternalLink className="size-3.5 text-muted-foreground mt-1" />
                      </div>
                    </a>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        )}
      </div>
      {showActions && (
        <div className="flex w-full">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                data-testid="message-edit-button"
                variant="ghost"
                size="icon"
                className="size-3! p-4!"
                onClick={() => copy(part.text)}
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy</TooltipContent>
          </Tooltip>
          {threadId && !readonly && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  data-testid="message-fork-button"
                  variant="ghost"
                  size="icon"
                  className="size-3! p-4!"
                  disabled={isForking}
                  onClick={() => setIsForkDialogOpen(true)}
                >
                  {isForking ? (
                    <Loader className="animate-spin" />
                  ) : (
                    <GitBranch />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fork from here</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                data-testid="save-note-button"
                variant="ghost"
                size="icon"
                className="size-3! p-4!"
                disabled={isSavingNote}
                onClick={handleSaveToNotes}
              >
                {isSavingNote ? (
                  <Loader className="animate-spin" />
                ) : (
                  <Download />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save to notes</TooltipContent>
          </Tooltip>
          {!readonly && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <SelectModel onSelect={handleModelChange}>
                      <Button
                        data-testid="message-edit-button data-[state=open]:bg-secondary!"
                        variant="ghost"
                        size="icon"
                        className="size-3! p-4!"
                      >
                        {<RefreshCw />}
                      </Button>
                    </SelectModel>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Change Model</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isDeleting}
                    onClick={deleteMessage}
                    className="size-3! p-4! hover:text-destructive"
                  >
                    {isDeleting ? (
                      <Loader className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-destructive">
                  Delete Message
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      )}
      <div ref={ref} className="min-w-0" />
      <Dialog
        open={isForkDialogOpen}
        onOpenChange={(open) => {
          if (!isForking) {
            setIsForkDialogOpen(open);
            if (!open) setBranchLabel("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Fork from this message</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Creates a new thread that copies the conversation up to and
            including this message. Optionally name the branch.
          </p>
          <div className="space-y-2">
            <label
              htmlFor="branch-label"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Branch label (optional)
            </label>
            <Input
              id="branch-label"
              data-testid="fork-branch-label-input"
              placeholder="e.g. alt-approach, retry, simpler"
              value={branchLabel}
              maxLength={100}
              onChange={(e) => setBranchLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isForking) {
                  e.preventDefault();
                  void handleFork(branchLabel);
                }
              }}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Up to 100 characters. The label is appended to the new
              thread&apos;s title so you can find it later.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isForking}
              onClick={() => {
                setIsForkDialogOpen(false);
                setBranchLabel("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              data-testid="fork-dialog-confirm"
              disabled={isForking}
              onClick={() => void handleFork(branchLabel)}
            >
              {isForking ? (
                <>
                  <Loader className="size-3 animate-spin" />
                  Forking…
                </>
              ) : (
                "Fork"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});
AssistMessagePart.displayName = "AssistMessagePart";
const variants = {
  collapsed: {
    height: 0,
    opacity: 0,
    marginTop: 0,
    marginBottom: 0,
  },
  expanded: {
    height: "auto",
    opacity: 1,
    marginTop: "1rem",
    marginBottom: "0.5rem",
  },
};
export const ReasoningPart = memo(function ReasoningPart({
  reasoningText,
  isThinking,
}: {
  reasoningText: string;
  isThinking?: boolean;
  readonly?: boolean;
}) {
  const hasReasoningText = reasoningText.trim().length > 0;
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!hasReasoningText && isExpanded) {
      setIsExpanded(false);
    }
  }, [hasReasoningText, isExpanded]);

  // Auto-expand while the model is actively streaming reasoning so the
  // user sees the thinking text arrive in real time, not only after a
  // click. The user can still collapse it manually; we don't force it
  // back open once they've closed it.
  useEffect(() => {
    if (isThinking) {
      setIsExpanded(true);
    }
  }, [isThinking]);

  if (!hasReasoningText) return null;

  return (
    <div
      className="flex flex-col cursor-pointer"
      onClick={() => {
        setIsExpanded(!isExpanded);
      }}
    >
      <div className="flex flex-row gap-2 items-center text-ring hover:text-primary transition-colors">
        {isThinking ? (
          <TextShimmer>Thinking details</TextShimmer>
        ) : (
          <div className="font-medium">Thinking details</div>
        )}

        <button
          data-testid="message-reasoning-toggle"
          type="button"
          className="cursor-pointer"
        >
          <ChevronDownIcon size={16} />
        </button>
      </div>

      <div className="pl-4">
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              data-testid="message-reasoning"
              key="content"
              initial="collapsed"
              animate="expanded"
              exit="collapsed"
              variants={variants}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
              className="pl-6 text-muted-foreground border-l flex flex-col gap-4"
            >
              <Markdown>{reasoningText}</Markdown>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});
ReasoningPart.displayName = "ReasoningPart";

const loading = memo(function Loading() {
  return (
    <div className="px-6 py-4">
      <div className="h-44 w-full rounded-md opacity-0" />
    </div>
  );
});

const PieChart = dynamic(
  () => import("./tool-invocation/pie-chart").then((mod) => mod.PieChart),
  {
    ssr: false,
    loading,
  },
);

const BarChart = dynamic(
  () => import("./tool-invocation/bar-chart").then((mod) => mod.BarChart),
  {
    ssr: false,
    loading,
  },
);

const LineChart = dynamic(
  () => import("./tool-invocation/line-chart").then((mod) => mod.LineChart),
  {
    ssr: false,
    loading,
  },
);

const InteractiveTable = dynamic(
  () =>
    import("./tool-invocation/interactive-table").then(
      (mod) => mod.InteractiveTable,
    ),
  {
    ssr: false,
    loading,
  },
);

const WebSearchToolInvocation = dynamic(
  () =>
    import("./tool-invocation/web-search").then(
      (mod) => mod.WebSearchToolInvocation,
    ),
  {
    ssr: false,
    loading,
  },
);

const CodeExecutor = dynamic(
  () =>
    import("./tool-invocation/code-executor").then((mod) => mod.CodeExecutor),
  {
    ssr: false,
    loading,
  },
);

const ImageGeneratorToolInvocation = dynamic(
  () =>
    import("./tool-invocation/image-generator").then(
      (mod) => mod.ImageGeneratorToolInvocation,
    ),
  {
    ssr: false,
    loading,
  },
);

const VideoGeneratorToolInvocation = dynamic(
  () =>
    import("./tool-invocation/video-generator").then(
      (mod) => mod.VideoGeneratorToolInvocation,
    ),
  {
    ssr: false,
    loading,
  },
);

const ArtifactCreatorToolInvocation = dynamic(
  () =>
    import("./tool-invocation/artifact-creator").then(
      (mod) => mod.ArtifactCreatorToolInvocation,
    ),
  {
    ssr: false,
    loading,
  },
);

const CanvasPptMakerInvocation = dynamic(
  () =>
    import("./tool-invocation/canvas-ppt-maker").then(
      (mod) => mod.CanvasPptMakerInvocation,
    ),
  {
    ssr: false,
    loading,
  },
);

const BrowserAgentToolInvocation = dynamic(
  () =>
    import("./tool-invocation/browser-agent").then(
      (mod) => mod.BrowserAgentToolInvocation,
    ),
  {
    ssr: false,
    loading,
  },
);

const MemoryToolInvocation = dynamic(
  () =>
    import("./tool-invocation/memory-action").then(
      (mod) => mod.MemoryToolInvocation,
    ),
  {
    ssr: false,
  },
);

// Local shortcuts for tool invocation approval/rejection
const approveToolInvocationShortcut: Shortcut = {
  description: "approveToolInvocation",
  shortcut: {
    key: "Enter",
    command: true,
  },
};

const rejectToolInvocationShortcut: Shortcut = {
  description: "rejectToolInvocation",
  shortcut: {
    key: "Escape",
    command: true,
  },
};

export const ToolMessagePart = memo(
  ({
    part,
    isLast,
    showActions,
    addToolResult,
    isError,
    messageId,
    setMessages,
    isManualToolInvocation,
  }: ToolMessagePartProps) => {
    const t = useTranslations("");

    const { output, toolCallId, state, input, errorText } = part;
    const rawInput = (part as any).rawInput;

    // output-error parts persist rawInput (not input); the SDK model-conversion
    // falls back the same way, so the renderer must too.
    const resolvedInput = input ?? rawInput;

    const toolName = useMemo(() => getToolName(part), [part.type]);

    const isCompleted = useMemo(() => {
      return state.startsWith("output");
    }, [state]);

    const [expanded, setExpanded] = useState(false);
    const { copied: copiedInput, copy: copyInput } = useCopy();
    const { copied: copiedOutput, copy: copyOutput } = useCopy();
    const [isDeleting, setIsDeleting] = useState(false);

    // Handle keyboard shortcuts for approve/reject actions
    useEffect(() => {
      // Only enable shortcuts when manual tool invocation buttons are shown
      if (!isManualToolInvocation) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        const isApprove = isShortcutEvent(e, approveToolInvocationShortcut);
        const isReject = isShortcutEvent(e, rejectToolInvocationShortcut);

        if (!isApprove && !isReject) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (isApprove) {
          addToolResult?.({
            tool: toolName,
            toolCallId,
            output: ManualToolConfirmTag.create({ confirm: true }),
          });
        }

        if (isReject) {
          addToolResult?.({
            tool: toolName,
            toolCallId,
            output: ManualToolConfirmTag.create({ confirm: false }),
          });
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isManualToolInvocation, isLast]);

    const deleteMessage = useCallback(async () => {
      const ok = await notify.confirm({
        title: "Delete Message",
        description: "Are you sure you want to delete this message?",
      });
      if (!ok) return;
      safe(() => setIsDeleting(true))
        .ifOk(() => deleteMessageAction(messageId))
        .ifOk(() =>
          setMessages?.((messages) => {
            const index = messages.findIndex((m) => m.id === messageId);
            if (index !== -1) {
              return messages.filter((_, i) => i !== index);
            }
            return messages;
          }),
        )
        .ifFail((error) => toast.error(error.message))
        .watch(() => setIsDeleting(false))
        .unwrap();
    }, [messageId]);

    const onToolCallDirect = useCallback(
      (result: any) => {
        addToolResult?.({
          tool: toolName,
          toolCallId,
          output: result,
        });
      },
      [addToolResult, toolCallId],
    );

    const result = useMemo(() => {
      if (state == "output-error") {
        return errorText;
      }
      if (isCompleted) {
        return Array.isArray(output)
          ? {
              ...output,
              content: output.map((node) => {
                // mcp tools
                if (node?.type === "text" && typeof node?.text === "string") {
                  const parsed = safeJSONParse(node.text);
                  return {
                    ...node,
                    text: parsed.success ? parsed.value : node.text,
                  };
                }
                return node;
              }),
            }
          : output;
      }
      return null;
    }, [isCompleted, output, state, errorText]);

    const isWorkflowTool = useMemo(
      () => VercelAIWorkflowToolStreamingResultTag.isMaybe(result),
      [result],
    );

    const CustomToolComponent = useMemo(() => {
      if (
        toolName === DefaultToolName.WebSearch ||
        toolName === DefaultToolName.WebContent
      ) {
        return <WebSearchToolInvocation part={part} />;
      }

      if (toolName === ImageToolName) {
        return <ImageGeneratorToolInvocation part={part} />;
      }

      if (toolName === DefaultToolName.VideoGeneration) {
        return <VideoGeneratorToolInvocation part={part} />;
      }

      if (toolName === DefaultToolName.ArtifactCreation) {
        return <ArtifactCreatorToolInvocation part={part} />;
      }

      if (toolName === DefaultToolName.Canvas) {
        return <CanvasPptMakerInvocation part={part} />;
      }

      if (toolName === DefaultToolName.BrowserAgent) {
        return <BrowserAgentToolInvocation part={part} />;
      }

      if (toolName === DefaultToolName.JavascriptExecution) {
        return (
          <CodeExecutor
            part={part}
            key={part.toolCallId}
            onResult={onToolCallDirect}
            type="javascript"
          />
        );
      }

      if (toolName === DefaultToolName.PythonExecution) {
        return (
          <CodeExecutor
            part={part}
            key={part.toolCallId}
            onResult={onToolCallDirect}
            type="python"
          />
        );
      }

      if (
        toolName === "save_memory" ||
        toolName === "delete_memory" ||
        toolName === "search_memory"
      ) {
        return <MemoryToolInvocation part={part} key={part.toolCallId} />;
      }

      if (state === "output-available") {
        switch (toolName) {
          case DefaultToolName.CreatePieChart:
            return (
              <PieChart key={`${toolCallId}-${toolName}`} {...(resolvedInput as any)} />
            );
          case DefaultToolName.CreateBarChart:
            return (
              <BarChart key={`${toolCallId}-${toolName}`} {...(resolvedInput as any)} />
            );
          case DefaultToolName.CreateLineChart:
            return (
              <LineChart
                key={`${toolCallId}-${toolName}`}
                {...(resolvedInput as any)}
              />
            );
          case DefaultToolName.CreateTable:
            return (
              <InteractiveTable
                key={`${toolCallId}-${toolName}`}
                {...(resolvedInput as any)}
              />
            );
        }
      }
      return null;
    }, [toolName, state, onToolCallDirect, result, input, part]);

    const { serverName: mcpServerName, toolName: mcpToolName } = useMemo(() => {
      return extractMCPToolId(toolName);
    }, [toolName]);

    const isExpanded = useMemo(() => {
      return expanded || result === null || isWorkflowTool;
    }, [expanded, result, isWorkflowTool]);

    const isExecuting = useMemo(() => {
      if (isWorkflowTool)
        return (
          (result as VercelAIWorkflowToolStreamingResult)?.status == "running"
        );
      return !isCompleted && isLast;
    }, [isWorkflowTool, isCompleted, result, isLast]);

    return (
      <div className="group w-full">
        {CustomToolComponent ? (
          CustomToolComponent
        ) : (
          <div className="flex flex-col fade-in duration-300 animate-in">
            <div
              className="flex gap-2 items-center cursor-pointer group/title"
              onClick={() => setExpanded(!expanded)}
            >
              <div className="p-1.5 text-primary bg-input/40 rounded">
                {isExecuting ? (
                  <Loader className="size-3.5 animate-spin" />
                ) : isError ? (
                  <TriangleAlert className="size-3.5 text-destructive" />
                ) : isWorkflowTool ? (
                  <Avatar className="size-3.5">
                    <AvatarImage
                      src={
                        (result as VercelAIWorkflowToolStreamingResult)
                          .workflowIcon?.value
                      }
                    />
                    <AvatarFallback>
                      {toolName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <HammerIcon className="size-3.5" />
                )}
              </div>
              <span className="font-bold flex items-center gap-2">
                {isExecuting ? (
                  <TextShimmer>{mcpServerName}</TextShimmer>
                ) : (
                  mcpServerName
                )}
              </span>
              {mcpToolName && (
                <>
                  <ChevronRight className="size-3.5" />
                  <span className="text-muted-foreground group-hover/title:text-primary transition-colors duration-300">
                    {mcpToolName}
                  </span>
                </>
              )}
              <div className="ml-auto group-hover/title:bg-input p-1.5 rounded transition-colors duration-300">
                <ChevronDownIcon
                  className={cn(isExpanded && "rotate-180", "size-3.5")}
                />
              </div>
            </div>
            <div className="flex gap-2 py-2">
              <div className="w-7 flex justify-center">
                <Separator
                  orientation="vertical"
                  className="h-full bg-gradient-to-t from-transparent to-border to-5%"
                />
              </div>
              <div className="w-full flex flex-col gap-2">
                <div
                  className={cn(
                    "min-w-0 w-full p-4 rounded-lg bg-card px-4 border text-xs transition-colors fade-300",
                    !isExpanded && "hover:bg-secondary cursor-pointer",
                  )}
                  onClick={() => {
                    if (!isExpanded) {
                      setExpanded(true);
                    }
                  }}
                >
                  <div className="flex items-center">
                    <h5 className="text-muted-foreground font-medium select-none transition-colors">
                      Request
                    </h5>
                    <div className="flex-1" />
                    {copiedInput ? (
                      <Check className="size-3" />
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-3 text-muted-foreground"
                        onClick={() => copyInput(JSON.stringify(input))}
                      >
                        <Copy className="size-3" />
                      </Button>
                    )}
                  </div>
                  {isExpanded && (
                    <div className="p-2 max-h-[300px] overflow-y-auto ">
                      <JsonView data={input} />
                    </div>
                  )}
                </div>
                {!result ? null : isWorkflowTool ? (
                  <WorkflowInvocation
                    result={result as VercelAIWorkflowToolStreamingResult}
                  />
                ) : (
                  <div
                    className={cn(
                      "min-w-0 w-full p-4 rounded-lg bg-card px-4 border text-xs mt-2 transition-colors fade-300",
                      !isExpanded && "hover:bg-secondary cursor-pointer",
                    )}
                    onClick={() => {
                      if (!isExpanded) {
                        setExpanded(true);
                      }
                    }}
                  >
                    <div className="flex items-center">
                      <h5 className="text-muted-foreground font-medium select-none">
                        Response
                      </h5>
                      <div className="flex-1" />
                      {copiedOutput ? (
                        <Check className="size-3" />
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-3 text-muted-foreground"
                          onClick={() => copyOutput(JSON.stringify(result))}
                        >
                          <Copy className="size-3" />
                        </Button>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="p-2 max-h-[300px] overflow-y-auto">
                        <JsonView data={result} />
                      </div>
                    )}
                  </div>
                )}

                {isManualToolInvocation && (
                  <div className="flex flex-row gap-2 items-center mt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="rounded-full text-xs hover:ring py-2"
                      onClick={() =>
                        addToolResult?.({
                          tool: toolName,
                          toolCallId,
                          output: ManualToolConfirmTag.create({
                            confirm: true,
                          }),
                        })
                      }
                    >
                      <Check />
                      {t("Common.approve")}
                      <Separator orientation="vertical" className="h-4" />
                      <span className="text-muted-foreground">
                        {getShortcutKeyList(approveToolInvocationShortcut).join(
                          " ",
                        )}
                      </span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full text-xs py-2"
                      onClick={() =>
                        addToolResult?.({
                          tool: toolName,
                          toolCallId,
                          output: ManualToolConfirmTag.create({
                            confirm: false,
                          }),
                        })
                      }
                    >
                      <X />
                      {t("Common.reject")}
                      <Separator orientation="vertical" />
                      <span className="text-muted-foreground">
                        {getShortcutKeyList(rejectToolInvocationShortcut).join(
                          " ",
                        )}
                      </span>
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {showActions && (
              <div className="flex flex-row gap-2 items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      disabled={isDeleting}
                      onClick={deleteMessage}
                      variant="ghost"
                      size="icon"
                      className="size-3! p-4! opacity-0 group-hover/message:opacity-100 hover:text-destructive"
                    >
                      {isDeleting ? (
                        <Loader className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-destructive" side="bottom">
                    Delete Message
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
  (prev, next) => {
    if (prev.isError !== next.isError) return false;
    if (prev.isLast !== next.isLast) return false;
    if (prev.showActions !== next.showActions) return false;
    if (prev.isManualToolInvocation !== next.isManualToolInvocation)
      return false;
    if (prev.messageId !== next.messageId) return false;
    if (!equal(prev.part, next.part)) return false;
    return true;
  },
);

ToolMessagePart.displayName = "ToolMessagePart";

// File Message Part Component
interface FileMessagePartProps {
  part: FileUIPart; // FileUIPart from AI SDK
  isUserMessage: boolean;
}

export const FileMessagePart = memo(
  ({ part, isUserMessage }: FileMessagePartProps) => {
    const isImage = part.mediaType?.startsWith("image/");
    const [isImageOpen, setIsImageOpen] = useState(false);

    const fileExtension =
      part.filename?.split(".").pop()?.toUpperCase() ||
      part.mediaType?.split("/").pop()?.toUpperCase() ||
      "FILE";
    const fileUrl = part.url;
    const filename =
      part.filename || part.url?.split("/").pop() || "Attachment";
    const secondaryLabel =
      part.mediaType && part.mediaType !== "application/octet-stream"
        ? part.mediaType
        : undefined;

    if (isImage && fileUrl) {
      return (
        <>
          <div
            className={cn(
              "max-w-[200px] rounded-lg overflow-hidden border border-border cursor-pointer group relative",
              isUserMessage ? "ml-auto" : "mr-auto",
            )}
            onClick={() => setIsImageOpen(true)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fileUrl}
              alt={part.filename || "Uploaded image"}
              className="w-full h-auto max-h-[200px] object-cover"
            />
            {/* Hover overlay with zoom icon */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <ZoomIn className="size-6 text-white" />
            </div>
            {part.filename && (
              <div className="px-2 py-1 bg-muted text-xs text-muted-foreground truncate">
                {part.filename}
              </div>
            )}
          </div>

          {/* Full-size image popup */}
          <Dialog open={isImageOpen} onOpenChange={setIsImageOpen}>
            <DialogContent className="max-w-[90vw] max-h-[90vh] p-2 overflow-auto">
              <DialogTitle className="sr-only">{filename}</DialogTitle>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl}
                alt={part.filename || "Uploaded image"}
                className="w-auto h-auto max-w-full max-h-[85vh] mx-auto rounded-lg"
              />
              {part.filename && (
                <div className="text-center text-sm text-muted-foreground mt-2">
                  {part.filename}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </>
      );
    }

    // Non-image file
    return (
      <div
        className={cn(
          "max-w-md rounded-2xl border border-border/80 p-4 shadow-sm backdrop-blur-sm",
          isUserMessage
            ? "ml-auto bg-accent text-accent-foreground border-accent/40"
            : "mr-auto bg-muted/60 text-foreground",
        )}
      >
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex-shrink-0 rounded-xl p-3",
              isUserMessage ? "bg-accent-foreground/10" : "bg-muted",
            )}
          >
            <FileIcon
              className={cn(
                "size-6",
                isUserMessage
                  ? "text-accent-foreground/80"
                  : "text-muted-foreground",
              )}
            />
          </div>
          <div className="flex-1 min-w-0 space-y-1 pr-3">
            <p
              className={cn(
                "text-sm font-medium line-clamp-1",
                isUserMessage ? "text-accent-foreground" : "text-foreground",
              )}
              title={filename}
            >
              {filename}
            </p>
            <div
              className={cn(
                "flex flex-wrap items-center gap-2 text-xs",
                isUserMessage
                  ? "text-accent-foreground/70"
                  : "text-muted-foreground",
              )}
            >
              <Badge
                variant="outline"
                className={cn(
                  "uppercase tracking-wide px-2 py-0.5",
                  isUserMessage &&
                    "border-accent-foreground/30 text-accent-foreground/90",
                )}
              >
                {fileExtension}
              </Badge>
              {secondaryLabel && (
                <span
                  className={cn(
                    "truncate max-w-[10rem]",
                    isUserMessage
                      ? "text-accent-foreground/70"
                      : "text-muted-foreground",
                  )}
                  title={secondaryLabel}
                >
                  {secondaryLabel}
                </span>
              )}
            </div>
          </div>
          {fileUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "size-9 flex-shrink-0 hover:text-foreground",
                    isUserMessage
                      ? "text-accent-foreground/70 hover:text-accent-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <a href={fileUrl} download={part.filename ?? filename}>
                    <Download className="size-4" />
                    <span className="sr-only">Download {filename}</span>
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    );
  },
);

FileMessagePart.displayName = "FileMessagePart";

// Source URL (non-model) attachment renderer
export function SourceUrlMessagePart({
  part,
  isUserMessage,
}: {
  part: { type: "source-url"; url: string; title?: string; mediaType?: string };
  isUserMessage: boolean;
}) {
  const name = part.title || part.url?.split("/").pop() || "attachment";
  const ext = name.split(".").pop()?.toUpperCase() || "FILE";
  const mediaType =
    part.mediaType && part.mediaType !== "application/octet-stream"
      ? part.mediaType
      : undefined;
  return (
    <div
      className={cn(
        "max-w-md rounded-2xl border border-border/80 p-4 backdrop-blur-sm shadow-sm",
        isUserMessage
          ? "ml-auto bg-accent text-accent-foreground border-accent/40"
          : "mr-auto bg-muted/60 text-foreground",
      )}
    >
      <div className="flex items-start gap-4 max-w-sm">
        <div
          className={cn(
            "flex-shrink-0 rounded-xl p-3",
            isUserMessage ? "bg-accent-foreground/10" : "bg-muted",
          )}
        >
          <FileIcon
            className={cn(
              "size-6",
              isUserMessage
                ? "text-accent-foreground/80"
                : "text-muted-foreground",
            )}
          />
        </div>
        <div className="flex-1 min-w-0 space-y-1 pr-3">
          <a
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "text-sm font-medium hover:underline line-clamp-1",
              isUserMessage ? "text-accent-foreground" : "text-foreground",
            )}
            title={name}
          >
            {name}
          </a>
          <div
            className={cn(
              "flex flex-wrap items-center gap-2 text-xs",
              isUserMessage
                ? "text-accent-foreground/70"
                : "text-muted-foreground",
            )}
          >
            <Badge
              variant="outline"
              className={cn(
                "uppercase tracking-wide px-2 py-0.5",
                isUserMessage &&
                  "border-accent-foreground/30 text-accent-foreground/90",
              )}
            >
              {ext}
            </Badge>
            {mediaType && (
              <span className="truncate max-w-[10rem]" title={mediaType}>
                {mediaType}
              </span>
            )}
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              size="icon"
              variant="ghost"
              className={cn(
                "size-9 flex-shrink-0 hover:text-foreground",
                isUserMessage
                  ? "text-accent-foreground/70 hover:text-accent-foreground"
                  : "text-muted-foreground",
              )}
            >
              <a href={part.url} target="_blank" rel="noopener noreferrer">
                <Download className="size-4" />
                <span className="sr-only">Open attachment</span>
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open attachment</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
