"use client";

import { appStore, ActiveCanvas, CanvasSlide } from "@/app/store";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Code2Icon,
  DownloadIcon,
  MonitorIcon,
  PanelRightCloseIcon,
  PresentationIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "ui/button";
import { cn } from "lib/utils";
import { useShallow } from "zustand/shallow";

function sanitizeFileName(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, " ").trim() || "canvas";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function downloadTextFile(content: string, fileName: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildPresentationHtml(canvas: ActiveCanvas) {
  const slides = canvas.slides ?? [];
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(canvas.title)}</title>
  <style>
    body { margin: 0; font-family: Inter, Arial, sans-serif; background: #111827; color: #111827; }
    .deck { display: grid; gap: 32px; padding: 32px; }
    .slide { aspect-ratio: 16 / 9; background: #f8fafc; border-radius: 18px; padding: 56px; box-sizing: border-box; box-shadow: 0 24px 80px rgba(0,0,0,.28); page-break-after: always; }
    h1 { font-size: 52px; line-height: 1.02; margin: 0 0 24px; letter-spacing: -0.04em; }
    ul { margin: 32px 0 0; padding-left: 24px; font-size: 24px; line-height: 1.45; color: #475569; }
    li { margin: 12px 0; }
  </style>
</head>
<body>
  <main class="deck">
    ${slides
      .map(
        (slide) => `<section class="slide">
      <h1>${escapeHtml(slide.title)}</h1>
      <ul>${slide.bullets
        .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
        .join("")}</ul>
    </section>`,
      )
      .join("\n")}
  </main>
</body>
</html>`;
}

function CanvasHtmlPreview({ canvas }: { canvas: ActiveCanvas }) {
  return (
    <div className="h-full min-h-0 rounded-2xl border border-border bg-background overflow-hidden">
      <iframe
        title={canvas.title}
        srcDoc={canvas.html || ""}
        sandbox="allow-scripts"
        className="h-full min-h-[480px] w-full bg-white"
      />
    </div>
  );
}

function SlidePreview({
  slide,
  slideCount,
  activeIndex,
  setActiveIndex,
}: {
  slide: CanvasSlide;
  slideCount: number;
  activeIndex: number;
  setActiveIndex: (value: number | ((value: number) => number)) => void;
}) {
  return (
    <div className="h-full min-h-0 rounded-2xl border border-slate-800 bg-[#081120] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-300">
        <span>
          Slide {activeIndex + 1} of {slideCount}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 text-slate-200 hover:bg-white/10"
            disabled={activeIndex === 0}
            onClick={() => setActiveIndex((prev) => Math.max(0, prev - 1))}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 text-slate-200 hover:bg-white/10"
            disabled={activeIndex === slideCount - 1}
            onClick={() =>
              setActiveIndex((prev) => Math.min(slideCount - 1, prev + 1))
            }
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      </div>

      <div className="h-[calc(100%-52px)] bg-[radial-gradient(circle_at_1px_1px,rgba(147,197,253,0.28)_1px,transparent_0)] [background-size:16px_16px] p-4 sm:p-8 flex items-center justify-center">
        <div className="aspect-[16/9] w-full max-w-5xl rounded-2xl bg-[#f8fafc] p-8 sm:p-12 shadow-2xl text-slate-950">
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-cyan-600">
              <span className="size-2 rounded-full bg-cyan-500" />
              Canvas slide
            </div>
            <h2 className="mt-6 text-3xl sm:text-5xl font-semibold tracking-[-0.04em] leading-[0.98]">
              {slide.title}
            </h2>
            <div className="mt-6 h-px bg-gradient-to-r from-cyan-500 via-blue-500 to-transparent" />
            <ul className="mt-8 grid gap-3 text-base sm:text-xl text-slate-600">
              {slide.bullets.slice(0, 5).map((bullet) => (
                <li key={bullet} className="flex gap-3">
                  <span className="mt-2.5 size-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            {slide.imagePrompt ? (
              <p className="mt-auto line-clamp-2 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-500">
                Visual direction: {slide.imagePrompt}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function CanvasPresentationPreview({ canvas }: { canvas: ActiveCanvas }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const slides = canvas.slides ?? [];
  const safeIndex = Math.max(0, Math.min(activeIndex, slides.length - 1));
  const activeSlide = slides[safeIndex];

  if (!activeSlide) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
        No canvas slide content is available.
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-[220px_1fr]">
      <div className="min-h-0 overflow-y-auto rounded-2xl border border-border bg-card/50 p-2">
        {slides.map((slide, index) => (
          <button
            key={slide.index}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={cn(
              "mb-2 w-full rounded-xl border px-3 py-2 text-left transition-colors",
              index === safeIndex
                ? "border-primary/60 bg-primary/10"
                : "border-border bg-muted/30 hover:bg-muted/50",
            )}
          >
            <div className="truncate text-sm font-medium">{slide.title}</div>
            <div className="text-xs text-muted-foreground">
              Slide {slide.index}
            </div>
          </button>
        ))}
      </div>

      <SlidePreview
        slide={activeSlide}
        slideCount={slides.length}
        activeIndex={safeIndex}
        setActiveIndex={setActiveIndex}
      />
    </div>
  );
}

export function CanvasPanel() {
  const [canvas, appStoreMutate] = appStore(
    useShallow((state) => [state.activeCanvas, state.mutate]),
  );

  const downloadableContent = useMemo(() => {
    if (!canvas) return "";
    return canvas.contentType === "html"
      ? canvas.html || ""
      : buildPresentationHtml(canvas);
  }, [canvas]);

  if (!canvas) return null;

  const handleDownload = () => {
    downloadTextFile(
      downloadableContent,
      `${sanitizeFileName(canvas.title)}.html`,
      "text/html;charset=utf-8",
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex size-9 items-center justify-center rounded-xl border border-border bg-muted/40">
          {canvas.contentType === "html" ? (
            <Code2Icon className="size-4 text-cyan-400" />
          ) : (
            <PresentationIcon className="size-4 text-cyan-400" />
          )}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{canvas.title}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {canvas.summary ||
              (canvas.contentType === "html"
                ? "HTML canvas artifact"
                : `${canvas.slides?.length ?? 0} slide canvas`)}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={handleDownload}>
            <DownloadIcon className="size-4" />
            HTML
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => appStoreMutate({ activeCanvas: undefined })}
          >
            <PanelRightCloseIcon className="size-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-3">
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <MonitorIcon className="size-3.5" />
          Live canvas preview
        </div>
        {canvas.contentType === "html" ? (
          <CanvasHtmlPreview canvas={canvas} />
        ) : (
          <CanvasPresentationPreview canvas={canvas} />
        )}
      </div>
    </div>
  );
}
