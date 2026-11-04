"use client";

import { ToolUIPart } from "ai";
import equal from "lib/equal";
import { DownloadIcon, ExternalLinkIcon, FileCode2Icon } from "lucide-react";
import { memo, useMemo } from "react";
import { Button } from "ui/button";
import LetterGlitch from "ui/letter-glitch";
import { TextShimmer } from "ui/text-shimmer";

interface ArtifactCreatorToolInvocationProps {
  part: ToolUIPart;
}

interface ArtifactResult {
  title?: string;
  html?: string;
  format?: "html";
  kind?: "artifact" | "presentation";
}

function PureArtifactCreatorToolInvocation({
  part,
}: ArtifactCreatorToolInvocationProps) {
  const isGenerating = useMemo(() => !part.state.startsWith("output"), [part]);

  const result = useMemo(() => {
    if (!part.state.startsWith("output")) return null;
    return part.output as ArtifactResult;
  }, [part]);

  const hasError = useMemo(() => {
    return (
      part.state === "output-error" ||
      (part.state === "output-available" && !result?.html)
    );
  }, [part.state, result?.html]);

  const html = result?.html || "";
  const title = result?.title || "Interactive Artifact";

  const openArtifact = () => {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
  };

  const downloadArtifact = () => {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  };

  if (isGenerating) {
    return (
      <div className="flex flex-col gap-4">
        <TextShimmer>Creating artifact...</TextShimmer>
        <div className="w-full h-96 overflow-hidden rounded-lg">
          <LetterGlitch />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-[920px]">
      <div className="flex items-center gap-2">
        {!hasError && <FileCode2Icon className="size-4" />}
        <span className="text-sm font-semibold">
          {hasError ? "Artifact generation failed" : title}
        </span>
      </div>

      {hasError ? (
        <div className="bg-card text-muted-foreground p-6 rounded-lg text-xs border border-border/20">
          {part.errorText || "Could not generate artifact. Please try again."}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="rounded-full"
              onClick={openArtifact}
            >
              <ExternalLinkIcon className="size-3.5" />
              Open
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="rounded-full"
              onClick={downloadArtifact}
            >
              <DownloadIcon className="size-3.5" />
              Download HTML
            </Button>
          </div>

          <div className="w-full rounded-xl overflow-hidden border border-border/40 bg-background">
            <iframe
              title={title}
              srcDoc={html}
              className="w-full h-[560px] bg-white"
              sandbox="allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock"
            />
          </div>
        </>
      )}
    </div>
  );
}

export const ArtifactCreatorToolInvocation = memo(
  PureArtifactCreatorToolInvocation,
  (prev, next) => equal(prev.part, next.part),
);
