"use client";

import { ToolUIPart, getToolName } from "ai";
import { Brain, CheckCircle2, History, Trash2 } from "lucide-react";
import { memo } from "react";
import { TextShimmer } from "ui/text-shimmer";

interface MemoryToolInvocationProps {
  part: ToolUIPart;
}

function PureMemoryToolInvocation({ part }: MemoryToolInvocationProps) {
  const isCompleted = part.state.startsWith("output");
  const isError = part.state === "output-error";

  const toolName = getToolName(part);
  const actionType =
    toolName === "save_memory"
      ? "save"
      : toolName === "delete_memory"
        ? "delete"
        : "search";

  const statusText = isCompleted
    ? isError
      ? `Failed to ${actionType} memory`
      : actionType === "save"
        ? "Saved to memory"
        : actionType === "delete"
          ? "Deleted from memory"
          : "Recalled from memory"
    : actionType === "save"
      ? "Saving to memory"
      : actionType === "delete"
        ? "Deleting from memory"
        : "Recalling from memory";

  const IconComponent =
    isCompleted && !isError
      ? CheckCircle2
      : actionType === "save"
        ? Brain
        : actionType === "delete"
          ? Trash2
          : History;

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-accent/30 w-fit px-3 py-1.5 rounded-full border border-border pb-1.5 pt-1.5">
      <IconComponent
        className="size-4 shrink-0 transition-transform bg-clip-text"
        style={{
          color: isCompleted && !isError ? "#10b981" : "currentColor",
        }}
      />
      {!isCompleted && !isError ? (
        <TextShimmer className="font-medium">{statusText}</TextShimmer>
      ) : (
        <span
          className="font-medium"
          style={{
            color: isCompleted && !isError ? "#10b981" : "currentColor",
          }}
        >
          {statusText}
        </span>
      )}
    </div>
  );
}

function areEqual(
  prevProps: MemoryToolInvocationProps,
  nextProps: MemoryToolInvocationProps,
) {
  return prevProps.part.state === nextProps.part.state;
}

export const MemoryToolInvocation = memo(PureMemoryToolInvocation, areEqual);
