"use client";

import { ToolUIPart } from "ai";
import equal from "lib/equal";
import { DownloadIcon, VideoIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { Button } from "ui/button";
import LetterGlitch from "ui/letter-glitch";
import { TextShimmer } from "ui/text-shimmer";

interface VideoGeneratorToolInvocationProps {
  part: ToolUIPart;
}

interface VideoGenerationResult {
  videos: Array<{
    url: string;
  }>;
  model: string;
  provider?: string;
}

function PureVideoGeneratorToolInvocation({
  part,
}: VideoGeneratorToolInvocationProps) {
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);

  const isGenerating = useMemo(() => {
    return !part.state.startsWith("output");
  }, [part.state]);

  const result = useMemo(() => {
    if (!part.state.startsWith("output")) return null;
    return part.output as VideoGenerationResult;
  }, [part.state, part.output]);

  const videos = useMemo(() => result?.videos || [], [result]);

  const hasError = useMemo(() => {
    return (
      part.state === "output-error" ||
      (part.state === "output-available" && videos.length === 0)
    );
  }, [part.state, videos.length]);

  const downloadVideo = async (videoUrl: string, index: number) => {
    try {
      setDownloadingUrl(videoUrl);
      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error("Failed to download video");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const extension = blob.type.split("/")[1] || "mp4";
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `generated-video-${index + 1}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } finally {
      setDownloadingUrl(null);
    }
  };

  if (isGenerating) {
    return (
      <div className="flex flex-col gap-4">
        <TextShimmer>Generating video...</TextShimmer>
        <div className="w-full h-96 overflow-hidden rounded-lg">
          <LetterGlitch />
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Video generation may take up to 1 minute.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {!hasError && <VideoIcon className="size-4" />}
        <span className="text-sm font-semibold">
          {hasError ? "Video generation failed" : "Video generated"}
        </span>
        <span className="text-xs text-muted-foreground">{result?.model}</span>
      </div>

      {hasError ? (
        <div className="bg-card text-muted-foreground p-6 rounded-lg text-xs border border-border/20">
          {part.errorText ??
            (videos.length === 0
              ? "No videos generated"
              : "Failed to generate video. Please try again.")}
        </div>
      ) : (
        <div className="w-full flex flex-col gap-3 pb-2 max-w-[820px]">
          {videos.map((video, index) => (
            <div
              key={video.url}
              className="relative group rounded-lg overflow-hidden border border-border hover:border-primary transition-all shadow-sm hover:shadow-md bg-muted/20"
            >
              <video
                src={video.url}
                controls
                preload="metadata"
                className="w-full h-[360px] object-cover bg-black"
              />
              <div className="absolute top-2 right-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-xs font-medium hover:scale-105 transition-transform"
                >
                  Open
                </a>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => downloadVideo(video.url, index)}
                  disabled={downloadingUrl === video.url}
                  className="rounded-full h-7 px-3 text-xs"
                >
                  <DownloadIcon className="size-3.5" />
                  Download
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const VideoGeneratorToolInvocation = memo(
  PureVideoGeneratorToolInvocation,
  (prev, next) => {
    return equal(prev.part, next.part);
  },
);
