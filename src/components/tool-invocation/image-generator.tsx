"use client";

import { ToolUIPart } from "ai";
import equal from "lib/equal";
import { cn } from "lib/utils";
import { DownloadIcon, ImagesIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { Button } from "ui/button";
import LetterGlitch from "ui/letter-glitch";
import { TextShimmer } from "ui/text-shimmer";

interface ImageGeneratorToolInvocationProps {
  part: ToolUIPart;
}

interface ImageGenerationResult {
  images: {
    url: string;
    mimeType?: string;
    originalUrl?: string;
  }[];
  mode?: "create" | "edit" | "composite";
  model: string;
}

function PureImageGeneratorToolInvocation({
  part,
}: ImageGeneratorToolInvocationProps) {
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);

  const isGenerating = useMemo(() => {
    return !part.state.startsWith("output");
  }, [part.state]);

  const result = useMemo(() => {
    if (!part.state.startsWith("output")) return null;
    return part.output as ImageGenerationResult;
  }, [part.state, part.output]);

  const images = useMemo(() => {
    return result?.images || [];
  }, [result]);

  const mode = useMemo(() => {
    return result?.mode || "create";
  }, [result]);

  const hasError = useMemo(() => {
    return (
      part.state === "output-error" ||
      (part.state === "output-available" && result?.images.length === 0)
    );
  }, [part.state, result]);

  const downloadOriginalImage = async (
    imageUrl: string,
    index: number,
    originalUrl?: string,
  ) => {
    const downloadUrl = originalUrl || imageUrl;
    try {
      setDownloadingUrl(downloadUrl);
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error("Failed to download image");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const extension = blob.type.split("/")[1] || "png";
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${mode}-image-${index + 1}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } finally {
      setDownloadingUrl(null);
    }
  };

  // Get mode-specific text
  const getModeText = (mode: string) => {
    switch (mode) {
      case "edit":
        return "Editing image...";
      case "composite":
        return "Compositing images...";
      default:
        return "Generating image...";
    }
  };

  const getModeHeader = (mode: string) => {
    switch (mode) {
      case "edit":
        return "Image edited";
      case "composite":
        return "Images composited";
      default:
        return "Image generated";
    }
  };

  // Simple loading state like web-search
  if (isGenerating) {
    return (
      <div className="flex flex-col gap-4">
        <TextShimmer>{getModeText(mode)}</TextShimmer>
        <div className="w-full h-96 overflow-hidden rounded-lg">
          <LetterGlitch />
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Image generation may take up to 1 minute.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {!hasError && <ImagesIcon className="size-4" />}
        <span className="text-sm font-semibold">
          {hasError ? "Image generation failed" : getModeHeader(mode)}
        </span>
        <span className="text-xs text-muted-foreground">{result?.model}</span>
      </div>

      <div className="w-full flex flex-col gap-3 pb-2">
        {hasError ? (
          <div className="bg-card text-muted-foreground p-6 rounded-lg text-xs border border-border/20">
            {part.errorText ??
              (result?.images.length === 0
                ? "No images generated"
                : "Failed to generate image. Please try again.")}
          </div>
        ) : (
          <>
            <div
              className={cn(
                "grid gap-3",
                images.length === 1
                  ? "grid-cols-1 max-w-[420px]"
                  : "grid-cols-1 sm:grid-cols-2 max-w-[820px]",
              )}
            >
              {images.map((image, index) => (
                <div
                  key={index}
                  className="relative group rounded-lg overflow-hidden border border-border hover:border-primary transition-all shadow-sm hover:shadow-md bg-muted/20"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    loading="lazy"
                    alt={`Generated image ${index + 1}`}
                    className="w-full h-64 object-cover"
                  />
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors opacity-0 group-hover:opacity-100">
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
                      <a
                        href={image.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-xs font-medium hover:scale-105 transition-transform"
                      >
                        Open
                      </a>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          downloadOriginalImage(
                            image.url,
                            index,
                            image.originalUrl,
                          )
                        }
                        disabled={
                          downloadingUrl === (image.originalUrl || image.url)
                        }
                        className="rounded-full h-7 px-3 text-xs"
                      >
                        <DownloadIcon className="size-3.5" />
                        Download
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export const ImageGeneratorToolInvocation = memo(
  PureImageGeneratorToolInvocation,
  (prev, next) => {
    return equal(prev.part, next.part);
  },
);
