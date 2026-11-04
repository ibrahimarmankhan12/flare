"use client";

import { appStore } from "@/app/store";

import { ToolUIPart } from "ai";
import equal from "lib/equal";
import { cn } from "lib/utils";
import { ExternalLink, MousePointer2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "ui/button";
import { TextShimmer } from "ui/text-shimmer";

type BrowserAgentOutput = {
  isError?: boolean;
  error?: string;
  solution?: string;
  sessionId?: string;
  liveViewUrl?: string;
  interactiveLiveViewUrl?: string;
  currentUrl?: string;
  pageTitle?: string;
  threadId?: string;
  initialUrl?: string;
  initialPageTitle?: string;
  task?: string;
  output?: string;
  stdout?: string;
  stderr?: string;
  closedAfterExecution?: boolean;
  reusedSession?: boolean;
  isWriteLocked?: boolean;
};

interface BrowserAgentToolInvocationProps {
  part: ToolUIPart;
}

function PureBrowserAgentToolInvocation({
  part,
}: BrowserAgentToolInvocationProps) {
  const result = useMemo(() => {
    if (!part.state.startsWith("output")) return null;
    return (part.output || {}) as BrowserAgentOutput;
  }, [part.state, part.output]);

  const isRunning = !part.state.startsWith("output");
  const isWriteLocked = result?.isWriteLocked === true;

  // Prefer the live view from the current result; fall back to the persisted
  // store value so the UI shows the browser immediately instead of waiting
  // for the server to return the URL on every turn.
  const liveViewUrl =
    result?.liveViewUrl ||
    result?.interactiveLiveViewUrl ||
    appStore.getState().browserAgent?.liveViewUrl ||
    "";
  const interactiveUrl =
    result?.interactiveLiveViewUrl ||
    result?.liveViewUrl ||
    appStore.getState().browserAgent?.interactiveLiveViewUrl ||
    "";
  const canUseLiveView = Boolean(interactiveUrl);
  const [isLiveViewOpen, setIsLiveViewOpen] = useState(canUseLiveView);
  const [isUserControlling, setIsUserControlling] = useState(false);
  const outputLog = useMemo(() => {
    const raw =
      result?.stderr?.trim() ||
      result?.output?.trim() ||
      result?.stdout?.trim() ||
      "";
    // Strip live-view URLs and session metadata from displayed output
    return raw
      .replace(/https?:\/\/liveview\.firecrawl\.dev[^\s]*/gi, "")
      .replace(/https?:\/\/browser\.firecrawl\.dev[^\s]*/gi, "")
      .replace(/\s*Session[:\s].*$/gm, "")
      .replace(/\s*scrapeId[:\s].*$/gm, "")
      .replace(/Reused an existing sandbox session\./gi, "")
      .trim();
  }, [result?.stderr, result?.output, result?.stdout]);

  // Persist live view state to the global store so it survives across
  // tool invocations — the UI can immediately show the browser without
  // waiting for the server to return the URL on every turn.
  useEffect(() => {
    if (!result) return;
    appStore.getState().mutate((state) => ({
      browserAgent: {
        ...(state.browserAgent ?? {}),
        isActive: !result.closedAfterExecution,
        liveViewUrl: result.liveViewUrl || state.browserAgent?.liveViewUrl || "",
        interactiveLiveViewUrl:
          result.interactiveLiveViewUrl ||
          state.browserAgent?.interactiveLiveViewUrl ||
          "",
        pageTitle: result.pageTitle || result.currentUrl || state.browserAgent?.pageTitle || "",
        sessionId: result.sessionId || state.browserAgent?.sessionId || "",
        isWriteLocked: result.isWriteLocked,
      },
    }));
  }, [result]);

  useEffect(() => {
    setIsLiveViewOpen(canUseLiveView);
    setIsUserControlling(false);
  }, [canUseLiveView, interactiveUrl]);

  const openDetachedView = useCallback(() => {
    if (!interactiveUrl) return;
    const popup = window.open(
      interactiveUrl,
      "flare-browser-agent",
      "popup=yes,width=1280,height=840,noopener,noreferrer",
    );
    popup?.focus();
  }, [interactiveUrl]);

  if (isRunning || isWriteLocked) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm">
          <MousePointer2 className={cn("size-5", isWriteLocked ? "text-amber-400" : "wiggle text-muted-foreground")} />
          <TextShimmer duration={isWriteLocked ? undefined : undefined}>
            {isWriteLocked
              ? "browser Agent paused — user has control. Retrying..."
              : "browser Agent is running in browser sandbox..."}
          </TextShimmer>
        </div>

        {canUseLiveView && isLiveViewOpen && (
          <div className="overflow-hidden rounded-lg border bg-background">
            <div className="flex h-9 items-center justify-between border-b bg-muted/30 px-2">
              <div className="min-w-0 text-xs text-muted-foreground">
                <span className="font-medium text-amber-500">
                  {isUserControlling ? "User control" : "Live browser"}
                </span>
                {result?.currentUrl && (
                  <span className="ml-2 hidden truncate sm:inline">
                    {result.currentUrl}
                  </span>
                )}
              </div>
            </div>
            <iframe
              key={interactiveUrl}
              title="Browser live view"
              src={interactiveUrl}
              className={cn(
                "h-[420px] w-full bg-background",
                !isUserControlling && "pointer-events-none",
              )}
              allow="clipboard-read; clipboard-write; fullscreen; microphone; camera"
              referrerPolicy="no-referrer"
              sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
            />
          </div>
        )}

        {isWriteLocked && outputLog && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-amber-600">
            {outputLog}
          </div>
        )}
      </div>
    );
  }

  if (result?.isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-sm font-semibold text-destructive">browser Agent</p>
        <p className="mt-1 text-sm text-destructive/90">
          {result.error || "Browser agent failed."}
        </p>
        {result.solution && (
          <p className="mt-2 text-xs text-muted-foreground">
            {result.solution}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card/70 p-3">
      <div className="flex items-center gap-2">
        <div className="rounded-md bg-input p-1.5">
          <MousePointer2 className="size-3.5 text-emerald-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-none">browser Agent</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {result?.pageTitle || result?.currentUrl || result?.task || "Ready"}
          </p>
        </div>
      </div>

      {!liveViewUrl && (
        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          Live preview URL was not returned by Firecrawl for this run.
        </div>
      )}

      {canUseLiveView && isLiveViewOpen && (
        <div className="overflow-hidden rounded-lg border bg-background">
          <div className="flex h-9 items-center justify-between border-b bg-muted/30 px-2">
            <div className="min-w-0 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {isUserControlling ? "User control" : "Live browser"}
              </span>
              {result?.currentUrl && (
                <span className="ml-2 hidden truncate sm:inline">
                  {result.currentUrl}
                </span>
              )}
            </div>
          </div>
          <iframe
            key={interactiveUrl}
            title="Browser live view"
            src={interactiveUrl}
            className={cn(
              "h-[420px] w-full bg-background",
              !isUserControlling && "pointer-events-none",
            )}
            allow="clipboard-read; clipboard-write; fullscreen; microphone; camera"
            referrerPolicy="no-referrer"
            sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="h-8"
          onClick={() => {
            setIsLiveViewOpen(true);
            setIsUserControlling((value) => !value);
          }}
          disabled={!canUseLiveView}
        >
          <MousePointer2 className="mr-1.5 size-3.5" />
          {isUserControlling ? "Give back" : "Take control"}
        </Button>

        {canUseLiveView && (
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => setIsLiveViewOpen((value) => !value)}
          >
            {isLiveViewOpen ? "Hide live view" : "Show live view"}
          </Button>
        )}

        {interactiveUrl && (
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={openDetachedView}
          >
            <ExternalLink className="mr-1.5 size-3.5" />
            Open view
          </Button>
        )}
      </div>

      <div className="grid gap-1 text-[11px] text-muted-foreground">
        {result?.sessionId && (
          <p>
            Session:{" "}
            <span className="font-mono text-foreground/90">
              {result.sessionId}
            </span>
          </p>
        )}
        {result?.reusedSession && <p>Reused an existing sandbox session.</p>}
      </div>

      {outputLog && (
        <div className="rounded-lg border bg-muted/20 p-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">
            Logs
          </p>
          <pre
            className={cn(
              "max-h-36 overflow-auto whitespace-pre-wrap break-words text-[11px]",
              "text-muted-foreground",
            )}
          >
            {outputLog}
          </pre>
        </div>
      )}
    </div>
  );
}

function areEqual(
  { part: prevPart }: BrowserAgentToolInvocationProps,
  { part: nextPart }: BrowserAgentToolInvocationProps,
) {
  if (prevPart.state !== nextPart.state) return false;
  if (!equal(prevPart.input, nextPart.input)) return false;
  if (
    prevPart.state.startsWith("output") &&
    !equal(prevPart.output, nextPart.output)
  ) {
    return false;
  }
  return true;
}

export const BrowserAgentToolInvocation = memo(
  PureBrowserAgentToolInvocation,
  areEqual,
);
