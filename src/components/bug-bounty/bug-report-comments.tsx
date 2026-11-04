"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";

import { Button } from "ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "ui/card";
import { Textarea } from "ui/textarea";
import {
  useBugReportComments,
  type BugReportComment,
} from "@/hooks/use-bug-bounty";

export function BugReportComments({
  reportId,
  locked,
}: {
  reportId: string;
  locked?: boolean;
}) {
  const { data, mutate, isLoading } = useBugReportComments(reportId);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const comments = (data?.comments ?? []) as BugReportComment[];

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const trimmed = body.trim();
    if (!trimmed) {
      setError("Add a comment before sending.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/bug-bounty/reports/${reportId}/comments`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ body: trimmed }),
          },
        );
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(json?.error ?? "Failed to send comment.");
          return;
        }
        setBody("");
        toast.success("Comment posted.");
        // Optimistic update
        mutate(
          (current) =>
            current
              ? {
                  comments: [
                    ...current.comments,
                    {
                      id: json.comment.id,
                      reportId,
                      userId: json.comment.userId,
                      body: json.comment.body,
                      isInternal: false,
                      createdAt: json.comment.createdAt,
                    },
                  ],
                }
              : current,
          { revalidate: true },
        );
      } catch (err) {
        console.error(err);
        setError("Network error. Please try again.");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading comments…</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No comments yet. Add context or a follow-up to help the triage
            team.
          </p>
        ) : (
          <ul className="space-y-3">
            {comments.map((c) => (
              <li
                key={c.id}
                className="rounded-md border border-border bg-muted/30 p-3"
              >
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className="font-medium text-foreground">
                    {c.userName ?? "Reporter"}
                  </span>
                  <span>· {new Date(c.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-sm mt-1.5 whitespace-pre-line">{c.body}</p>
              </li>
            ))}
          </ul>
        )}

        {locked ? (
          <p className="text-xs text-muted-foreground italic">
            This report has been closed. New comments are disabled.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={10_000}
              placeholder="Reply with more context, screenshots, or follow-up details…"
            />
            {error ? (
              <p className="text-xs text-destructive">{error}</p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={pending} size="sm">
                {pending ? (
                  <Loader2 className="size-4 mr-1 animate-spin" />
                ) : (
                  <Send className="size-4 mr-1" />
                )}
                Send
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
