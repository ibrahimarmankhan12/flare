"use client";

import { Loader, RefreshCw, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "ui/sheet";

type InsightActionItem = { text: string; done?: boolean };

type InsightsData = {
  summary: string;
  decisions: InsightActionItem[];
  actionItems: InsightActionItem[];
  generatedAt?: string | null;
};

interface ThreadInsightsPanelProps {
  threadId: string;
  initial: InsightsData | null;
}

/**
 * P2.4 follow-up — Thread insights panel.
 *
 * Renders a "View insights" trigger in the chat header. On click, opens
 * a Sheet with the thread's persisted insights (summary, decisions,
 * action items). If no insights exist yet, shows a "Generate insights"
 * button that POSTs to `/api/thread/[id]/insights` and renders the
 * result. A "Refresh insights" button re-runs the generation.
 *
 * The component is self-contained: it owns its open/closed state, the
 * loading flag (via `useTransition` so React can interrupt), and the
 * in-memory data. The page loader passes the initial insights (when
 * present) so refresh / direct-nav does not re-trigger generation.
 */
export function ThreadInsightsPanel({
  threadId,
  initial,
}: ThreadInsightsPanelProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<InsightsData | null>(initial);
  const [pending, startTransition] = useTransition();

  const hasInsights =
    data !== null &&
    (data.summary.length > 0 ||
      data.decisions.length > 0 ||
      data.actionItems.length > 0);

  const generate = () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/thread/${threadId}/insights`, {
          method: "POST",
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(
            errText || `Failed to generate insights (HTTP ${res.status})`,
          );
        }
        const updated = (await res.json()) as {
          summary?: string | null;
          decisions?: InsightActionItem[] | null;
          actionItems?: InsightActionItem[] | null;
          insightsGeneratedAt?: string | Date | null;
        };
        setData({
          summary: updated.summary ?? "",
          decisions: updated.decisions ?? [],
          actionItems: updated.actionItems ?? [],
          generatedAt:
            updated.insightsGeneratedAt instanceof Date
              ? updated.insightsGeneratedAt.toISOString()
              : (updated.insightsGeneratedAt ?? null),
        });
        toast.success("Insights generated");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Insights generation failed",
        );
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 rounded-full px-3 text-xs"
          data-testid="insights-trigger"
        >
          <Sparkles className="size-3" />
          {hasInsights ? "Insights" : "Generate insights"}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto"
        data-testid="insights-panel"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Thread insights
          </SheetTitle>
          <SheetDescription>
            {hasInsights
              ? data.generatedAt
                ? `Last generated ${formatTimestamp(data.generatedAt)}`
                : "Generated for this thread"
              : "Generate a summary, key decisions, and action items for this conversation."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6 px-4 pb-8">
          {!hasInsights && !pending && (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No insights yet. Generation takes a few seconds for long
                threads.
              </p>
              <Button
                type="button"
                onClick={generate}
                className="mt-4 gap-2"
                data-testid="insights-generate"
              >
                <Sparkles className="size-3.5" />
                Generate insights
              </Button>
            </div>
          )}

          {pending && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-border/70 bg-muted/30 p-6 text-sm text-muted-foreground">
              <Loader className="size-4 animate-spin" />
              Generating insights…
            </div>
          )}

          {hasInsights && data && !pending && (
            <>
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Summary
                </h3>
                <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                  {data.summary}
                </p>
              </section>

              {data.decisions.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Decisions ({data.decisions.length})
                  </h3>
                  <ul className="space-y-1.5 text-sm text-foreground/90">
                    {data.decisions.map((d, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 leading-relaxed"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-1 inline-block size-1.5 shrink-0 rounded-full bg-primary/60"
                        />
                        <span>{d.text}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.actionItems.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Action items ({data.actionItems.length})
                  </h3>
                  <ul className="space-y-1.5 text-sm text-foreground/90">
                    {data.actionItems.map((a, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 leading-relaxed"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-1 inline-block size-3 shrink-0 rounded border border-border"
                        />
                        <span
                          className={a.done ? "line-through opacity-60" : ""}
                        >
                          {a.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="pt-2 border-t border-border/60">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={generate}
                  className="gap-1.5"
                  data-testid="insights-refresh"
                >
                  <RefreshCw className="size-3" />
                  Refresh insights
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
