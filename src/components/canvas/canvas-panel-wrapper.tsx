"use client";

import { appStore } from "@/app/store";
import { CanvasPanel } from "@/components/canvas/canvas-panel";
import { useShallow } from "zustand/shallow";
import { cn } from "lib/utils";

export function CanvasPanelWrapper() {
  const canvas = appStore(useShallow((state) => state.activeCanvas));

  return (
    <div
      className={cn(
        "h-full border-l border-border bg-background transition-all duration-300 overflow-hidden",
        canvas ? "w-[600px] min-w-[400px]" : "w-0 min-w-0",
      )}
    >
      {canvas && <CanvasPanel />}
    </div>
  );
}
