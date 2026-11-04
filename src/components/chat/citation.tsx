"use client";

import { FileIcon, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RetrievedChunk } from "lib/rag/format";
import { cn, truncateString } from "lib/utils";
import { Badge } from "ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

/**
 * P2.3 — Inline citation UI for RAG-grounded answers.
 *
 * The model emits bracketed indices like `[1]`, `[2]` when it grounds
 * an answer in the retrieved chunks. This component turns that into a
 * visual chip: a superscript-style index that, on hover, surfaces the
 * underlying chunk snippet + the source document's filename.
 *
 * Two pieces:
 *  - `<CitationList chunks={...} />` — the chip strip rendered at the
 *    end of an assistant message. Shows one chip per chunk (not per
 *    mention), in retrieval order.
 *  - `<CitationMarker index chunk /> — the inline superscript that
 *    should wrap `[1]` / `[2]` markers inside the answer text.
 *
 * The component is decoupled from the markdown renderer: the parent
 * owns the regex pass that splits out the `[N]` markers and decides
 * which markers to render. We expose both pieces so the parent can
 * pick.
 *
 * Failure modes handled:
 *  - Empty `chunks` — both pieces render nothing.
 *  - Chunk with no filename — falls back to the first 8 chars of the
 *    collectionItemId, then to the source URL, then to "unknown".
 *  - Very long snippet — truncated to 280 chars with an ellipsis.
 */

const SNIPPET_MAX_CHARS = 280;
const TITLE_MAX_CHARS = 78;

const resolveSourceLabel = (chunk: RetrievedChunk): string => {
  const filename = chunk.filename?.trim();
  if (filename) return filename;
  const sourceUrl = chunk.sourceUrl?.trim();
  if (sourceUrl) {
    try {
      return new URL(sourceUrl).hostname || sourceUrl;
    } catch {
      return sourceUrl;
    }
  }
  return `chunk ${chunk.id.slice(0, 8)}`;
};

const truncateSnippet = (text: string): string => {
  return truncateString(text || "", SNIPPET_MAX_CHARS);
};

interface CitationListProps {
  chunks: RetrievedChunk[];
  className?: string;
}

/**
 * Strip of citation chips rendered after the assistant message text.
 * One chip per chunk, in retrieval order. Hovering reveals the chunk
 * content and the source document's filename.
 */
export function CitationList({ chunks, className }: CitationListProps) {
  const t = useTranslations();
  if (!chunks || chunks.length === 0) return null;

  return (
    <div
      data-testid="citation-list"
      className={cn(
        "mt-2 flex flex-wrap items-center gap-1.5",
        className,
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
        {t?.("chat.sources") ?? "Sources"}
      </span>
      {chunks.map((chunk, index) => {
        const source = resolveSourceLabel(chunk);
        const snippet = truncateSnippet(chunk.content);
        const title = `${source}\n${snippet}`;
        return (
          <Tooltip key={chunk.id ?? `${index}`}>
            <TooltipTrigger asChild>
              <Badge
                variant="secondary"
                className="cursor-default gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium hover:bg-secondary/80"
                data-citation-index={index + 1}
                aria-label={`Source ${index + 1}: ${source}`}
              >
                <FileIcon className="size-3 shrink-0" aria-hidden="true" />
                <span className="font-semibold">[{index + 1}]</span>
                <span className="max-w-[120px] truncate text-muted-foreground">
                  {truncateString(source, TITLE_MAX_CHARS)}
                </span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={6}
              className="max-w-sm whitespace-pre-wrap break-words"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-1 text-xs font-semibold">
                  <FileIcon className="size-3" aria-hidden="true" />
                  <span>{source}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  chunk {chunk.position} · score{" "}
                  {chunk.score.toFixed(3)}
                </div>
                {snippet ? (
                  <p
                    className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap"
                    title={title}
                  >
                    {snippet}
                  </p>
                ) : null}
                {chunk.sourceUrl ? (
                  <a
                    href={chunk.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                  >
                    Open source
                    <ExternalLink className="size-2.5" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

interface CitationMarkerProps {
  index: number;
  chunk: RetrievedChunk;
  className?: string;
}

/**
 * Inline `[N]` marker rendered inside the assistant text. Hovering
 * reveals a tooltip with the chunk snippet + source. Use this for
 * per-mention rendering; use `<CitationList />` for the trailing
 * chip strip.
 */
export function CitationMarker({
  index,
  chunk,
  className,
}: CitationMarkerProps) {
  if (!chunk) return null;
  const source = resolveSourceLabel(chunk);
  const snippet = truncateSnippet(chunk.content);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <sup
          data-citation-index={index}
          className={cn(
            "ml-0.5 cursor-help text-[10px] font-semibold text-primary hover:underline",
            className,
          )}
          aria-label={`Source ${index}: ${source}`}
        >
          [{index}]
        </sup>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={4}
        className="max-w-sm whitespace-pre-wrap break-words"
      >
        <div className="space-y-1.5">
          <div className="flex items-center gap-1 text-xs font-semibold">
            <FileIcon className="size-3" aria-hidden="true" />
            <span>{source}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            chunk {chunk.position} · score {chunk.score.toFixed(3)}
          </div>
          {snippet ? (
            <p className="text-xs leading-relaxed text-foreground/90">
              {snippet}
            </p>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
