"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import { generateUUID } from "lib/utils";
import { Send, Square } from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "ui/button";
import { Textarea } from "ui/textarea";

type EmbedAgent = {
  id: string;
  name: string;
  description?: string | null;
  icon?: unknown;
};

type Props = {
  agent: EmbedAgent;
  token: string;
};

const getTextFromMessage = (message: UIMessage) =>
  message.parts
    .filter(
      (part): part is Extract<UIMessage["parts"][number], { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("\n\n");

export function EmbedChat({ agent, token }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  const { messages, sendMessage, status, error, stop } = useChat({
    id: `embed-${agent.id}`,
    generateId: generateUUID,
    transport: new DefaultChatTransport({
      api: "/api/embed/session",
      headers: {
        authorization: `Bearer ${token}`,
      },
      prepareSendMessagesRequest: ({ messages }) => ({
        body: { messages },
      }),
    }),
    experimental_throttle: 0,
  });

  const isLoading = useMemo(
    () => status === "streaming" || status === "submitted",
    [status],
  );

  useEffect(() => {
    containerRef.current?.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const greeting = useMemo(() => {
    const description = agent.description?.trim();
    if (description) return description;
    return `Ask ${agent.name} anything.`;
  }, [agent.description, agent.name]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const text = input.trim();
      if (!text || isLoading) return;
      setInput("");
      sendMessage({
        role: "user",
        parts: [{ type: "text", text }],
      });
    },
    [input, isLoading, sendMessage],
  );

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
      <header className="border-border border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
            {agent.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-semibold text-sm">{agent.name}</h1>
            <p className="truncate text-muted-foreground text-xs">
              Powered by Flare
            </p>
          </div>
        </div>
      </header>

      <main
        ref={containerRef}
        className="min-h-0 flex-1 overflow-y-auto py-4"
        aria-label={`${agent.name} chat`}
      >
        {messages.length === 0 && !error ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-sm space-y-3">
              <h2 className="font-semibold text-2xl">{agent.name}</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {greeting}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 px-4">
            {messages.map((message: UIMessage) => {
              const text = getTextFromMessage(message);
              if (!text.trim()) return null;
              const isUser = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={isUser ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={
                      isUser
                        ? "max-w-[85%] rounded-2xl bg-primary px-4 py-2 text-primary-foreground text-sm leading-relaxed"
                        : "max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2 text-foreground text-sm leading-relaxed"
                    }
                  >
                    {text}
                  </div>
                </div>
              );
            })}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-muted px-4 py-2 text-muted-foreground text-sm">
                  Thinking…
                </div>
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive text-sm">
                {error.message || "Something went wrong"}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-border border-t bg-background px-3 py-3">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={`Message ${agent.name}`}
            className="max-h-32 min-h-11 resize-none rounded-2xl"
            disabled={isLoading}
          />
          {isLoading ? (
            <Button type="button" size="icon" onClick={handleStop}>
              <Square className="size-4" />
              <span className="sr-only">Stop</span>
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()}>
              <Send className="size-4" />
              <span className="sr-only">Send</span>
            </Button>
          )}
        </form>
      </footer>
    </div>
  );
}
