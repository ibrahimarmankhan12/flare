"use client";

import { ToolUIPart } from "ai";
import { ExaSearchResponse } from "lib/ai/tools/web/web-search";
import equal from "lib/equal";
import { notify } from "lib/notify";
import { cn, toAny } from "lib/utils";
import { AlertTriangleIcon, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import { GlobalIcon } from "ui/global-icon";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "ui/hover-card";
import JsonView from "ui/json-view";
import { Separator } from "ui/separator";
import { TextShimmer } from "ui/text-shimmer";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

interface WebSearchToolInvocationProps {
  part: ToolUIPart;
}

function PureWebSearchToolInvocation({ part }: WebSearchToolInvocationProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const t = useTranslations();

  const result = useMemo(() => {
    if (!part.state.startsWith("output")) return null;
    return part.output as ExaSearchResponse & {
      isError: boolean;
      error?: string;
      citations?: Array<{
        id: number;
        title: string;
        url: string;
        author?: string;
        publishedDate?: string;
      }>;
    };
  }, [part.state]);
  const [errorSrc, setErrorSrc] = useState<string[]>([]);

  const options = useMemo(() => {
    return (
      <HoverCard openDelay={200} closeDelay={0}>
        <HoverCardTrigger asChild>
          <span className="hover:text-primary transition-colors text-xs text-muted-foreground cursor-pointer">
            {t("Chat.Tool.searchOptions")}
          </span>
        </HoverCardTrigger>
        <HoverCardContent className="max-w-xs md:max-w-md! w-full! overflow-auto flex flex-col">
          <p className="text-xs text-muted-foreground px-2 mb-2">
            {t("Chat.Tool.searchOptionsDescription")}
          </p>
          <div className="p-2">
            <JsonView data={part.input} />
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  }, [part.input]);

  const onError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.currentTarget;
    if (errorSrc.includes(target.src)) return;
    setErrorSrc([...errorSrc, target.src]);
  };

  const images = useMemo(() => {
    // Exa doesn't provide separate images array, but individual results may have image property
    return (
      result?.results
        ?.filter((r) => r.image && !errorSrc.includes(r.image))
        .map((r) => ({ url: r.image!, description: r.title })) ?? []
    );
  }, [result?.results, errorSrc]);

  if (!part.state.startsWith("output"))
    return (
      <div className="flex items-center gap-2 text-sm">
        <GlobalIcon className="size-5 wiggle text-muted-foreground" />
        <TextShimmer>{t("Chat.Tool.webSearching")}</TextShimmer>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <GlobalIcon className="size-5 text-muted-foreground" />
        <span className="text-sm font-semibold">
          {t("Chat.Tool.searchedTheWeb")}
        </span>
        {options}
      </div>
      <div className="flex gap-2">
        <div className="px-2.5">
          <Separator
            orientation="vertical"
            className="bg-gradient-to-b from-border to-transparent from-80%"
          />
        </div>
        <div className="flex flex-col gap-2 pb-2 overflow-hidden w-full">
          <div className="flex flex-wrap gap-1">
            {result?.isError ? (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangleIcon className="size-3.5" />
                {result.error || "Error"}
              </p>
            ) : (
              (result as ExaSearchResponse)?.results?.map((result, i) => {
                const citationNumber = i + 1;
                return (
                  <HoverCard key={i} openDelay={200} closeDelay={0}>
                    <HoverCardTrigger asChild>
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group rounded-full bg-secondary pl-1.5 pr-2 py-1.5 text-xs flex items-center gap-1.5 hover:bg-input hover:ring hover:ring-blue-500 transition-all cursor-pointer"
                      >
                        <span className="flex items-center justify-center size-4 rounded-full bg-primary/20 text-primary text-[10px] font-bold">
                          {citationNumber}
                        </span>
                        <div className="rounded-full bg-input ring ring-input">
                          <Avatar className="size-3 rounded-full">
                            <AvatarImage src={result.favicon} />
                            <AvatarFallback>
                              {result.title?.slice(0, 1).toUpperCase() || "?"}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <span className="truncate max-w-40">
                          {result.title || result.url}
                        </span>
                      </a>
                    </HoverCardTrigger>

                    <HoverCardContent className="flex flex-col gap-1 p-6">
                      <div className="flex items-center gap-2">
                        <div className="rounded-full ring ring-input">
                          <Avatar className="size-6 rounded-full">
                            <AvatarImage src={result.favicon} />
                            <AvatarFallback>
                              {result.title?.slice(0, 1).toUpperCase() || "?"}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <span
                          className={cn(
                            "font-medium",
                            !result.title && "truncate",
                          )}
                        >
                          {result.title || result.url}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2 mt-4">
                        <div className="relative">
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-card from-80% " />
                          <p className="text-xs text-muted-foreground max-h-60 overflow-y-auto">
                            {result.text}
                          </p>
                        </div>
                        {result.author && (
                          <div className="text-xs text-muted-foreground mt-2">
                            <span className="font-medium">Author:</span>{" "}
                            {result.author}
                          </div>
                        )}
                        {result.publishedDate && (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Published:</span>{" "}
                            {new Date(
                              result.publishedDate,
                            ).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                );
              })
            )}
          </div>

          {result?.results?.length && (
            <p className="text-xs text-muted-foreground ml-1 flex items-center gap-1">
              {t("Common.resultsFound", {
                count: result?.results?.length,
              })}
            </p>
          )}

          {Boolean(images?.length) && (
            <>
              {isExpanded && (
                <div className="grid grid-cols-3 gap-3 max-w-2xl mt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  {images.map((image, i) => {
                    if (!image.url) return null;
                    return (
                      <Tooltip key={i}>
                        <TooltipTrigger asChild>
                          <div
                            key={image.url}
                            onClick={() => {
                              notify.component({
                                className: "max-w-[90vw]! max-h-[90vh]! p-6!",
                                children: (
                                  <div className="flex flex-col h-full gap-4">
                                    <div className="flex-1 flex items-center justify-center min-h-0 py-6">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={image.url}
                                        className="max-w-[80vw] max-h-[80vh] object-contain rounded-lg"
                                        alt={image.description}
                                        onError={onError}
                                      />
                                    </div>
                                  </div>
                                ),
                              });
                            }}
                            className="block shadow rounded-lg overflow-hidden ring ring-input cursor-pointer"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              loading="lazy"
                              src={image.url}
                              alt={image.description}
                              className="w-full h-36 object-cover hover:scale-120 transition-transform duration-300"
                              onError={onError}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="p-4 max-w-xs whitespace-pre-wrap break-words">
                          <p className="text-xs text-muted-foreground">
                            {image.description || image.url}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit mt-1"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                <div className="flex items-center gap-1 bg-secondary/50 px-2 py-1 rounded-full">
                  {isExpanded ? (
                    <>
                      <span>Hide images</span>
                      <ChevronUp className="size-3" />
                    </>
                  ) : (
                    <>
                      <span>View {images.length} images</span>
                      <ChevronDown className="size-3" />
                    </>
                  )}
                </div>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function areEqual(
  { part: prevPart }: WebSearchToolInvocationProps,
  { part: nextPart }: WebSearchToolInvocationProps,
) {
  if (prevPart.state != nextPart.state) return false;
  if (!equal(prevPart.input, nextPart.input)) return false;
  if (
    prevPart.state.startsWith("output") &&
    !equal(prevPart.output, toAny(nextPart).output)
  )
    return false;
  return true;
}

export const WebSearchToolInvocation = memo(
  PureWebSearchToolInvocation,
  areEqual,
);
