"use client";
import { DefaultToolName } from "lib/ai/tools";
import { cn } from "lib/utils";
import {
  ChartColumnIcon,
  ChartPieIcon,
  ClapperboardIcon,
  CodeIcon,
  FileCode2Icon,
  GlobeIcon,
  HammerIcon,
  HardDriveUploadIcon,
  MousePointer2Icon,
  PresentationIcon,
  TableOfContents,
  TrendingUpIcon,
  YoutubeIcon,
} from "lucide-react";
import { useMemo } from "react";

export function DefaultToolIcon({
  name,
  className,
}: { name: DefaultToolName; className?: string }) {
  return useMemo(() => {
    if (name === DefaultToolName.CreatePieChart) {
      return (
        <ChartPieIcon className={cn("size-3.5 text-blue-500", className)} />
      );
    }
    if (name === DefaultToolName.CreateBarChart) {
      return (
        <ChartColumnIcon className={cn("size-3.5 text-blue-500", className)} />
      );
    }
    if (name === DefaultToolName.CreateLineChart) {
      return (
        <TrendingUpIcon className={cn("size-3.5 text-blue-500", className)} />
      );
    }
    if (name === DefaultToolName.CreateTable) {
      return (
        <TableOfContents className={cn("size-3.5 text-blue-500", className)} />
      );
    }
    if (name === DefaultToolName.WebSearch) {
      return <GlobeIcon className={cn("size-3.5 text-blue-400", className)} />;
    }
    if (name === DefaultToolName.WebContent) {
      return <GlobeIcon className={cn("size-3.5 text-blue-400", className)} />;
    }
    if (name === DefaultToolName.YouTubeSearch) {
      return <YoutubeIcon className={cn("size-3.5 text-red-500", className)} />;
    }
    if (name === DefaultToolName.YouTubeTranscript) {
      return <YoutubeIcon className={cn("size-3.5 text-red-400", className)} />;
    }
    if (name === DefaultToolName.BrowserAgent) {
      return (
        <MousePointer2Icon
          className={cn("size-3.5 text-emerald-400", className)}
        />
      );
    }
    if (name === DefaultToolName.Http) {
      return (
        <HardDriveUploadIcon
          className={cn("size-3.5 text-blue-300", className)}
        />
      );
    }
    if (name === DefaultToolName.JavascriptExecution) {
      return <CodeIcon className={cn("size-3.5 text-yellow-400", className)} />;
    }
    if (name === DefaultToolName.PythonExecution) {
      return <CodeIcon className={cn("size-3.5 text-blue-400", className)} />;
    }
    if (name === DefaultToolName.Canvas) {
      return (
        <PresentationIcon className={cn("size-3.5 text-cyan-400", className)} />
      );
    }
    if (name === DefaultToolName.VideoGeneration) {
      return (
        <ClapperboardIcon
          className={cn("size-3.5 text-indigo-400", className)}
        />
      );
    }
    if (name === DefaultToolName.ArtifactCreation) {
      return (
        <FileCode2Icon className={cn("size-3.5 text-cyan-400", className)} />
      );
    }
    return <HammerIcon className={cn("size-3.5", className)} />;
  }, [name]);
}
