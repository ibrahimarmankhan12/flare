"use client";

import { appStore } from "@/app/store";
import { encryptChatPayload } from "@/lib/security/chat-payload-obfuscation";
import {
  createChatRequestSecurityPayload,
  prewarmChatRequestSecurity,
} from "@/lib/security/chat-request-guard.client";
import { useChat } from "@ai-sdk/react";
import { Turnstile, TurnstileInstance } from "@marsidev/react-turnstile";
import clsx from "clsx";
import { cn, generateUUID, truncateString } from "lib/utils";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { ChatGreeting } from "./chat-greeting";
import { ThreadInsightsPanel } from "./chat/thread-insights-panel";
import { ErrorMessage, PreviewMessage } from "./message";
import PromptInput from "./prompt-input";

import {
  DefaultChatTransport,
  TextUIPart,
  UIMessage,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useShallow } from "zustand/shallow";

import { deleteThreadAction } from "@/app/api/chat/actions";
import { useGenerateThreadTitle } from "@/hooks/queries/use-generate-thread-title";
import { useFileDragOverlay } from "@/hooks/use-file-drag-overlay";
import { useToRef } from "@/hooks/use-latest";
import { useThreadFileUploader } from "@/hooks/use-thread-file-uploader";
import {
  ChatApiSchemaRequestBody,
  ChatAttachment,
  ChatModel,
} from "app-types/chat";
import { AnimatePresence, motion } from "framer-motion";
import { getStorageManager } from "lib/browser-stroage";
import { Shortcuts, isShortcutEvent } from "lib/keyboard-shortcuts";
import { ArrowDown, FilePlus, GitBranch, Loader } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { safe } from "ts-safe";
import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
import { Think } from "ui/think";

type Props = {
  threadId: string;
  initialMessages: Array<UIMessage>;
  selectedChatModel?: string;
  /**
   * Phase 1+#8 — when the current thread is itself a fork, the parent
   * thread's id is passed in so we can render a "Forked from ..." badge
   * at the top of the chat. Null when the thread is a root.
   */
  parentThreadId?: string | null;
  /**
   * P2.4 follow-up — initial insights for the thread (if any). The
   * `<ThreadInsightsPanel />` uses this to skip the "Generate" step on
   * direct nav / refresh. Null when insights have not been generated
   * yet, OR when the thread is empty (insights are regenerated on
   * demand by the user).
   */
  initialInsights?: {
    summary: string;
    decisions: Array<{ text: string; done?: boolean }>;
    actionItems: Array<{ text: string; done?: boolean }>;
    generatedAt?: string | null;
  } | null;
};

const firstTimeStorage = getStorageManager("IS_FIRST");
firstTimeStorage.set(false);

export default function ChatBot({
  threadId,
  initialMessages,
  parentThreadId,
  initialInsights,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

  const getCaptchaToken = useCallback(
    async (_action: string) => {
      if (!turnstileSiteKey) {
        throw new Error(
          "Security verification is not configured (missing Turnstile site key).",
        );
      }

      const waitForWidget = async (maxWaitMs: number) => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < maxWaitMs) {
          const widget = turnstileRef.current;
          if (widget) return widget;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return null;
      };

      const widget = await waitForWidget(15_000);
      if (!widget) {
        throw new Error(
          "Security verification is still loading. Please wait a moment and retry.",
        );
      }

      let lastError: unknown = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          widget.reset();
          widget.execute();
          const token = await widget.getResponsePromise(15_000, 250);
          widget.reset();
          if (token) return token;
        } catch (error) {
          lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      throw (
        lastError ||
        new Error(
          "Security verification failed to initialize. Please refresh and retry.",
        )
      );
    },
    [turnstileSiteKey],
  );

  const { uploadFiles } = useThreadFileUploader(threadId);
  const handleFileDrop = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      await uploadFiles(files);
    },
    [uploadFiles],
  );
  const { isDragging } = useFileDragOverlay({
    onDropFiles: handleFileDrop,
  });

  const [
    appStoreMutate,
    model,
    toolChoice,
    allowedAppDefaultToolkit,
    allowedMcpServers,
    threadList,
    threadMentions,
    pendingThreadMention,
    threadImageToolModel,
    threadImageToolSize,
  ] = appStore(
    useShallow((state) => [
      state.mutate,
      state.chatModel,
      state.toolChoice,
      state.allowedAppDefaultToolkit,
      state.allowedMcpServers,
      state.threadList,
      state.threadMentions,
      state.pendingThreadMention,
      state.threadImageToolModel,
      state.threadImageToolSize,
    ]),
  );

  const generateTitle = useGenerateThreadTitle({
    threadId,
  });

  const onFinish = useCallback(() => {
    const messages = latestRef.current.messages;
    const prevThread = latestRef.current.threadList.find(
      (v) => v.id === threadId,
    );
    const isNewThread =
      !prevThread?.title &&
      messages.filter((v) => v.role === "user" || v.role === "assistant")
        .length < 3;
    if (isNewThread) {
      const part = messages
        .slice(0, 2)
        .flatMap((m) =>
          m.parts
            .filter((v) => v.type === "text")
            .map(
              (p) =>
                `${m.role}: ${truncateString((p as TextUIPart).text, 500)}`,
            ),
        );
      if (part.length > 0) {
        generateTitle(part.join("\n\n"));
      }
    } else if (latestRef.current.threadList[0]?.id !== threadId) {
      mutate("/api/thread");
    }
    window.setTimeout(() => {
      void prewarmChatRequestSecurity().catch(() => {});
    }, 800);
  }, []);

  const [input, setInput] = useState("");

  // Defer the message list so that the expensive `react-markdown`
  // re-parse on the streaming assistant text doesn't block the main
  // thread on every text-delta. React renders the previous (cached)
  // version with low priority, so a long markdown re-parse can't stall
  // the UI and make streaming feel frozen.
  const {
    messages: rawMessages,
    status,
    setMessages: setRawMessages,
    addToolResult: _addToolResult,
    error,
    sendMessage,
    stop,
  } = useChat({
    id: threadId,
    sendAutomaticallyWhen: (options) =>
      stopRequestedRef.current
        ? false
        : lastAssistantMessageIsCompleteWithToolCalls(options),
    transport: new DefaultChatTransport({
      prepareSendMessagesRequest: async ({ messages, body, id }) => {
        if (window.location.pathname !== `/chat/${threadId}`) {
          window.history.replaceState({}, "", `/chat/${threadId}`);
        }
        const lastMessage = messages.at(-1)!;
        if (lastMessage.role === "user") {
          stopRequestedRef.current = false;
        }
        // Filter out UI-only parts (e.g., source-url) so the model doesn't receive unknown parts
        const attachments: ChatAttachment[] = lastMessage.parts.reduce(
          (acc: ChatAttachment[], part: any) => {
            if (part?.type === "file") {
              acc.push({
                type: "file",
                url: part.url,
                mediaType: part.mediaType,
                filename: part.filename,
              });
            } else if (part?.type === "source-url") {
              acc.push({
                type: "source-url",
                url: part.url,
                mediaType: part.mediaType,
                filename: part.title,
              });
            }
            return acc;
          },
          [],
        );

        const sanitizedLastMessage = {
          ...lastMessage,
          parts: lastMessage.parts.filter((p: any) => p?.type !== "source-url"),
        } as typeof lastMessage;
        const hasFilePart = lastMessage.parts?.some(
          (p) => (p as any)?.type === "file",
        );

        const requestBody: ChatApiSchemaRequestBody = {
          ...body,
          id,
          chatModel:
            (body as { model: ChatModel })?.model ?? latestRef.current.model,
          toolChoice: latestRef.current.toolChoice,
          allowedAppDefaultToolkit:
            latestRef.current.mentions?.length || hasFilePart
              ? []
              : latestRef.current.allowedAppDefaultToolkit,
          allowedMcpServers: latestRef.current.mentions?.length
            ? {}
            : latestRef.current.allowedMcpServers,
          mentions: latestRef.current.mentions,
          message: sanitizedLastMessage,
          imageTool: {
            model: latestRef.current.threadImageToolModel[threadId],
            size: latestRef.current.threadImageToolSize[threadId],
          },
          attachments,
        };

        try {
          const securityPayload = await createChatRequestSecurityPayload({
            requestBody: requestBody as unknown as Record<string, unknown>,
            getCaptchaToken,
          });
          if (securityPayload) {
            const encryptedPayload = await encryptChatPayload({
              payload: requestBody as unknown as Record<string, unknown>,
              challengeToken: securityPayload.challengeToken,
            });
            return {
              body: {
                encryptedPayload,
                security: securityPayload,
              },
            };
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Security verification failed. Please retry.";
          toast.error(message);
          throw error;
        }

        return { body: requestBody };
      },
    }),
    messages: initialMessages,
    generateId: generateUUID,
    // Real-time streaming: no throttle so every text-delta from the
    // server triggers an immediate React re-render. The server-side
    // smoothStream is also set to delayInMs: 0 so the user sees the
    // response appear word-by-word as the LLM produces it.
    experimental_throttle: 0,
    onFinish,
  });
  const [isDeleteThreadPopupOpen, setIsDeleteThreadPopupOpen] = useState(false);
  // Set when the user hits Stop; sendAutomaticallyWhen returns false while
  // set, so the SDK never auto-resends (which would otherwise re-execute the
  // pending server-side tool calls and duplicate the assistant message after
  // an abort). Reset on the next genuine user message.
  const stopRequestedRef = useRef(false);

  const addToolResult = useCallback(
    async (result: Parameters<typeof _addToolResult>[0]) => {
      await _addToolResult(result);
      // sendMessage();
    },
    [_addToolResult],
  );

  // Defer the messages list so the heavy `react-markdown` re-parse on
  // the streaming assistant text doesn't block paint on every chunk.
  // The user keeps seeing a fluid scroll + caret, and the markdown
  // rendering catches up between chunks instead of stalling them.
  const messages = useDeferredValue(rawMessages);
  const setMessages = setRawMessages;

  const latestRef = useToRef({
    toolChoice,
    model,
    allowedAppDefaultToolkit,
    allowedMcpServers,
    messages: rawMessages,
    threadList,
    threadId,
    mentions: threadMentions[threadId],
    threadImageToolModel,
    threadImageToolSize,
  });


  const handleStop = useCallback(() => {
    // Abort the in-flight stream AND break the tool-call auto-resend loop:
    // the SDK re-checks sendAutomaticallyWhen after an abort, and since the
    // last assistant message still holds completed tool calls, it would
    // immediately resend. Marking the pending tool parts as providerExecuted
    // makes lastAssistantMessageIsCompleteWithToolCalls return false.
    stopRequestedRef.current = true;
    stop();
    setMessages((messages) => {
      const last = messages.at(-1);
      if (!last || last.role !== "assistant") return messages;
      return messages.map((m, i) => {
        if (i !== messages.length - 1) return m;
        return {
          ...m,
          parts: m.parts.map((part) =>
            isToolUIPart(part) && !part.providerExecuted
              ? { ...part, providerExecuted: true }
              : part,
          ),
        };
      });
    });
  }, [stop, setMessages]);

  const isLoading = useMemo(
    () => status === "streaming" || status === "submitted",
    [status],
  );

  const emptyMessage = useMemo(
    () => messages.length === 0 && !error,
    [messages.length, error],
  );

  const isInitialThreadEntry = useMemo(
    () =>
      initialMessages.length > 0 &&
      initialMessages.at(-1)?.id === messages.at(-1)?.id,
    [messages],
  );

  const isPendingToolCall = useMemo(() => {
    if (status != "ready") return false;
    const lastMessage = messages.at(-1);
    if (lastMessage?.role != "assistant") return false;
    const lastPart = lastMessage.parts.at(-1);
    if (!lastPart) return false;
    if (!isToolUIPart(lastPart)) return false;
    if (lastPart.state.startsWith("output")) return false;
    return true;
  }, [status, messages]);

  const space = useMemo(() => {
    if (!isLoading || error) return false;
    const lastMessage = messages.at(-1);
    if (lastMessage?.role == "user") return "think";
    const lastPart = lastMessage?.parts.at(-1);
    if (!lastPart) return "think";
    const secondPart = lastMessage?.parts[1];
    if (secondPart?.type == "text" && secondPart.text.length == 0)
      return "think";
    if (lastPart?.type == "step-start") {
      return lastMessage?.parts.length == 1 ? "think" : "space";
    }
    return false;
  }, [isLoading, messages.at(-1)]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isScrollAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    setIsAtBottom(isScrollAtBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    containerRef.current?.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    appStoreMutate({ currentThreadId: threadId });
    return () => {
      appStoreMutate({ currentThreadId: null });
    };
  }, [threadId]);

  useEffect(() => {
    if (pendingThreadMention && threadId) {
      appStoreMutate((prev) => ({
        threadMentions: {
          ...prev.threadMentions,
          [threadId]: [pendingThreadMention],
        },
        pendingThreadMention: undefined,
      }));
    }
  }, [pendingThreadMention, threadId, appStoreMutate]);

  useEffect(() => {
    if (isInitialThreadEntry)
      containerRef.current?.scrollTo({
        top: containerRef.current?.scrollHeight,
        behavior: "instant",
      });
  }, [isInitialThreadEntry]);

  // P1.5 follow-up — scroll to a specific message when the URL carries
  // `?message=<id>`. The memory UI source-link builds this URL; the
  // receiving end is this effect. We:
  //   1. parse `?message=<id>` from the current URL (browser-only);
  //   2. wait one tick for the message wrapper to mount (with
  //      `data-message-id={message.id}`);
  //   3. call `scrollIntoView` with a highlight for ~1.5s so the
  //      user can see which message was jumped to;
  //   4. clean the URL so a manual refresh does not re-jump.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get("message");
    if (!targetId) return;

    const timer = window.setTimeout(() => {
      const el = document.querySelector(
        `[data-message-id="${CSS.escape(targetId)}"]`,
      ) as HTMLElement | null;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add(
        "ring-2",
        "ring-primary/40",
        "ring-offset-2",
        "ring-offset-background",
        "rounded-lg",
        "transition",
      );
      window.setTimeout(() => {
        el.classList.remove(
          "ring-2",
          "ring-primary/40",
          "ring-offset-2",
          "ring-offset-background",
          "rounded-lg",
          "transition",
        );
      }, 1500);

      // Strip ?message= so a manual refresh does not re-jump.
      const url = new URL(window.location.href);
      url.searchParams.delete("message");
      window.history.replaceState({}, "", url.toString());
    }, 200);

    return () => window.clearTimeout(timer);
  }, [isInitialThreadEntry]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const messages = latestRef.current.messages;
      if (messages.length === 0) return;
      const isLastMessageCopy = isShortcutEvent(e, Shortcuts.lastMessageCopy);
      const isDeleteThread = isShortcutEvent(e, Shortcuts.deleteThread);
      if (!isDeleteThread && !isLastMessageCopy) return;
      e.preventDefault();
      e.stopPropagation();
      if (isLastMessageCopy) {
        const lastMessage = messages.at(-1);
        const lastMessageText = lastMessage!.parts
          .filter((part): part is TextUIPart => part.type == "text")
          ?.at(-1)?.text;
        if (!lastMessageText) return;
        navigator.clipboard.writeText(lastMessageText);
        toast.success("Last message copied to clipboard");
      }
      if (isDeleteThread) {
        setIsDeleteThreadPopupOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    // if (mounted) {
    //   handleFocus();
    // }
  }, [input]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void prewarmChatRequestSecurity().catch(() => {});
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <>
      <div
        className={cn(
          emptyMessage && "justify-center pb-24",
          "flex flex-col min-w-0 relative h-full z-40 overflow-hidden",
        )}
      >
        {isDragging && (
          <div className="absolute inset-0 z-40 bg-background/70 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="rounded-2xl px-6 py-5 bg-background/80 shadow-xl border border-border flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <FilePlus className="size-6" />
              </div>
              <span className="text-sm text-muted-foreground">
                Drop files to upload
              </span>
            </div>
          </div>
        )}
        {emptyMessage ? (
          <ChatGreeting />
        ) : (
          <>
            {parentThreadId && (
              <div
                data-testid="forked-from-badge"
                className="mx-auto mt-4 w-full max-w-3xl px-6 flex items-center gap-2"
              >
                <Link
                  href={`/chat/${parentThreadId}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors"
                  title="Open the parent thread"
                >
                  <GitBranch className="size-3" />
                  <span>Forked from parent thread</span>
                </Link>
                <ThreadInsightsPanel
                  threadId={threadId}
                  initial={
                    initialInsights
                      ? {
                          ...initialInsights,
                          generatedAt: initialInsights.generatedAt ?? null,
                        }
                      : null
                  }
                />
              </div>
            )}
            {!parentThreadId && initialInsights !== undefined && (
              <div
                data-testid="insights-standalone"
                className="mx-auto mt-4 w-full max-w-3xl px-6 flex justify-end"
              >
                <ThreadInsightsPanel
                  threadId={threadId}
                  initial={
                    initialInsights
                      ? {
                          ...initialInsights,
                          generatedAt: initialInsights.generatedAt ?? null,
                        }
                      : null
                  }
                />
              </div>
            )}
            <div
              className={
                "chat-thread-scroll min-h-0 flex flex-col gap-2 overflow-y-auto py-6 z-10 pr-1"
              }
              ref={containerRef}
              onScroll={handleScroll}
            >
              {messages.map((message, index) => {
                const isLastMessage = messages.length - 1 === index;
                return (
                  <PreviewMessage
                    threadId={threadId}
                    messageIndex={index}
                    prevMessage={messages[index - 1]}
                    key={message.id}
                    message={message}
                    status={status}
                    addToolResult={addToolResult}
                    isLoading={isLoading || isPendingToolCall}
                    isLastMessage={isLastMessage}
                    setMessages={setMessages}
                    sendMessage={sendMessage}
                    className={
                      isLastMessage &&
                      message.role != "user" &&
                      !space &&
                      message.parts.length > 1
                        ? "min-h-[calc(55dvh-40px)]"
                        : ""
                    }
                  />
                );
              })}
              {space && (
                <>
                  <div className="w-full mx-auto max-w-3xl px-6 relative">
                    <div className={space == "space" ? "opacity-0" : ""}>
                      <Think />
                    </div>
                  </div>
                  <div className="min-h-[calc(55dvh-56px)]" />
                </>
              )}

              {error && <ErrorMessage error={error} />}
              <div className="min-w-0 min-h-52" />
            </div>
          </>
        )}

        <div
          className={clsx(
            messages.length && "absolute md:bottom-6 bottom-0",
            !messages.length && "md:relative absolute bottom-0",
            "w-full z-10",
          )}
        >
          <div className="max-w-3xl mx-auto relative flex justify-center items-center">
            <ScrollToBottomButton
              show={!isAtBottom && messages.length > 0}
              onClick={scrollToBottom}
            />
          </div>

          <PromptInput
            input={input}
            threadId={threadId}
            sendMessage={sendMessage}
            setMessages={setMessages}
            setInput={setInput}
            isLoading={isLoading || isPendingToolCall}
            onStop={handleStop}
          />
        </div>
        <DeleteThreadPopup
          threadId={threadId}
          onClose={() => setIsDeleteThreadPopupOpen(false)}
          open={isDeleteThreadPopupOpen}
        />
      </div>
      {turnstileSiteKey ? (
        <div className="pointer-events-none absolute size-px opacity-0">
          <Turnstile
            ref={turnstileRef}
            siteKey={turnstileSiteKey}
            options={{
              theme: "auto",
              execution: "execute",
              appearance: "execute",
              action: "chat_send",
              size: "invisible",
            }}
          />
        </div>
      ) : null}
    </>
  );
}

function DeleteThreadPopup({
  threadId,
  onClose,
  open,
}: { threadId: string; onClose: () => void; open: boolean }) {
  const t = useTranslations();
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const handleDelete = useCallback(() => {
    setIsDeleting(true);
    safe(() => deleteThreadAction(threadId))
      .watch(() => setIsDeleting(false))
      .ifOk(() => {
        toast.success(t("Chat.Thread.threadDeleted"));
        router.push("/dashboard");
      })
      .ifFail(() => toast.error(t("Chat.Thread.failedToDeleteThread")))
      .watch(() => onClose());
  }, [threadId, router]);
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Chat.Thread.deleteChat")}</DialogTitle>
          <DialogDescription>
            {t("Chat.Thread.areYouSureYouWantToDeleteThisChatThread")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("Common.cancel")}
          </Button>
          <Button variant="destructive" onClick={handleDelete} autoFocus>
            {t("Common.delete")}
            {isDeleting && <Loader className="size-3.5 ml-2 animate-spin" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ScrollToBottomButtonProps {
  show: boolean;
  onClick: () => void;
  className?: string;
}

function ScrollToBottomButton({
  show,
  onClick,
  className,
}: ScrollToBottomButtonProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className={className}
        >
          <Button
            onClick={onClick}
            className="shadow-lg backdrop-blur-sm border transition-colors"
            size="icon"
            variant="ghost"
          >
            <ArrowDown />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
