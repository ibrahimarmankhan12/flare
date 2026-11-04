"use client";

import { appStore, ActiveCanvas } from "@/app/store";
import { ToolUIPart } from "ai";
import equal from "lib/equal";
import {
  CheckCircle2Icon,
  Code2Icon,
  LoaderCircleIcon,
  PanelRightOpenIcon,
  PresentationIcon,
  SparklesIcon,
} from "lucide-react";
import { memo, useCallback, useMemo } from "react";
import { Button } from "ui/button";
import { useSidebar } from "ui/sidebar";

interface CanvasResult extends ActiveCanvas {
  actions?: {
    exportLabel?: string;
    editorLabel?: string;
  };
}

function CanvasCreatingAnimation() {
  return (
    <div className="relative flex h-16 w-20 items-center justify-center">
      <div className="absolute inset-0 rounded-2xl bg-cyan-500/10 blur-xl" />
      <div className="relative grid h-12 w-16 gap-1 rounded-xl border border-border bg-background/80 p-2 shadow-sm">
        <div className="h-1.5 w-8 animate-pulse rounded-full bg-cyan-400/80" />
        <div className="h-1.5 w-11 animate-pulse rounded-full bg-blue-400/70 [animation-delay:120ms]" />
        <div className="h-1.5 w-6 animate-pulse rounded-full bg-orange-300/70 [animation-delay:240ms]" />
        <SparklesIcon className="absolute -right-2 -top-2 size-4 animate-pulse text-cyan-300" />
      </div>
    </div>
  );
}

function PureCanvasPptMakerInvocation({ part }: { part: ToolUIPart }) {
  const appStoreMutate = appStore((state) => state.mutate);
  const { setOpen, setOpenMobile } = useSidebar();
  const isGenerating = useMemo(() => !part.state.startsWith("output"), [part]);
  const isError = useMemo(() => part.state === "output-error", [part.state]);
  const result = useMemo(
    () =>
      part.state.startsWith("output")
        ? (part.output as CanvasResult | undefined)
        : undefined,
    [part.state, part.output],
  );

  const handleOpenCanvas = useCallback(() => {
    if (!result) return;
    appStoreMutate({
      activeCanvas: {
        canvasId: result.canvasId,
        title: result.title,
        contentType: result.contentType || "presentation",
        summary: result.summary,
        html: result.html,
        slides: result.slides,
        slideCount: result.slideCount,
        estimatedTime: result.estimatedTime,
      },
    });
    setOpen(false);
    setOpenMobile(false);
  }, [appStoreMutate, result, setOpen, setOpenMobile]);

  if (isGenerating) {
    const input = (part.input as { prompt?: string } | undefined) ?? {};
    return (
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/70 p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <CanvasCreatingAnimation />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <LoaderCircleIcon className="size-4 animate-spin text-cyan-300" />
              Creating canvas content
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {input.prompt || "AI is drafting your canvas."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !result) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        {part.errorText || "Canvas generation failed. Please try again."}
      </div>
    );
  }

  const isHtml = result.contentType === "html";

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card/70 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40">
          {isHtml ? (
            <Code2Icon className="size-5 text-cyan-300" />
          ) : (
            <PresentationIcon className="size-5 text-cyan-300" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2Icon className="size-4 text-emerald-400" />
            Content ready
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {result.title || "Canvas"}
          </p>
        </div>
        <Button
          size="sm"
          className="h-8 rounded-full px-3 text-xs"
          onClick={handleOpenCanvas}
        >
          <PanelRightOpenIcon className="size-3.5" />
          {result.actions?.editorLabel || "Open"}
        </Button>
      </div>
    </div>
  );
}

export const CanvasPptMakerInvocation = memo(
  PureCanvasPptMakerInvocation,
  (prev, next) => equal(prev.part, next.part),
);
