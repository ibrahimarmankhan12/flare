"use client";

import {
  type SandboxSummary,
  useSandboxes,
} from "@/hooks/queries/use-sandboxes";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "ui/alert-dialog";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import { Skeleton } from "ui/skeleton";
import {
  Box,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

// Sandbox manager.
//
// Paused sandboxes are free and do not count toward the concurrent limit, so
// pausing is the right default for anything you are not using right now — the
// filesystem is kept and resuming takes about half a second. Deleting is the
// only destructive action, so it is the only one behind a confirm.

const relative = (iso: string | null): string => {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(Math.abs(diff) / 60_000);
  const suffix = diff >= 0 ? "ago" : "from now";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ${suffix}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ${suffix}`;
  return `${Math.round(hours / 24)}d ${suffix}`;
};

const featureLabel = (feature: string | null) =>
  feature === "build" ? "App builder" : feature === "tool" ? "Chat" : "Sandbox";

export default function SandboxDashboard() {
  const { data, isLoading, mutate } = useSandboxes();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmKill, setConfirmKill] = useState<SandboxSummary | null>(null);

  const sandboxes = data?.sandboxes ?? [];
  const running = sandboxes.filter((s) => s.state === "running").length;

  const act = async (sandbox: SandboxSummary, action: "resume" | "pause") => {
    setBusy(sandbox.sandboxId);
    try {
      const res = await fetch(`/api/sandbox/${sandbox.sandboxId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Failed (${res.status})`);
      toast.success(
        action === "resume"
          ? "Resumed — your files and installed packages are as you left them."
          : "Paused. It costs nothing while paused.",
      );
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const kill = async (sandbox: SandboxSummary) => {
    setBusy(sandbox.sandboxId);
    try {
      const res = await fetch(`/api/sandbox/${sandbox.sandboxId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Sandbox deleted");
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusy(null);
      setConfirmKill(null);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8 flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (data && !data.configured) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
        <p className="font-medium">Sandboxes aren&apos;t configured</p>
        <p className="text-muted-foreground text-sm mt-1">
          Set E2B_API_KEY on this deployment to enable them.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Sandboxes</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {sandboxes.length === 0
              ? "Linux environments your conversations create."
              : `${sandboxes.length} sandbox${sandboxes.length === 1 ? "" : "es"}, ${running} running. Paused ones are free and keep their files.`}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => mutate()}
          className="shrink-0"
        >
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        {sandboxes.length === 0 ? (
          <div className="border border-dashed rounded-lg py-12 flex flex-col items-center text-center">
            <Box className="size-6 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground max-w-sm">
              No sandboxes yet. One is created the first time the assistant runs
              code, builds a project, or installs a package for you.
            </p>
          </div>
        ) : (
          sandboxes.map((s) => {
            const isBusy = busy === s.sandboxId;
            const isPaused = s.state === "paused";
            return (
              <div
                key={s.sandboxId}
                className="border rounded-lg p-4 flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={isPaused ? "outline" : "secondary"}>
                      {isPaused ? "Paused" : "Running"}
                    </Badge>
                    {s.envLabel && (
                      <Badge variant="outline">{s.envLabel}</Badge>
                    )}
                    <span className="text-sm font-medium">
                      {featureLabel(s.feature)}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs mt-1.5 font-mono truncate">
                    {s.sandboxId}
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Started {relative(s.startedAt)}
                    {s.expiresAt
                      ? ` · auto-pauses ${relative(s.expiresAt)}`
                      : ""}
                  </p>
                  {s.threadId && (
                    <Link
                      href={`/chat/${s.threadId}`}
                      className="text-xs mt-2 inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <MessageSquare className="size-3" />
                      Open conversation
                    </Link>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => act(s, isPaused ? "resume" : "pause")}
                  >
                    {isBusy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : isPaused ? (
                      <Play className="size-4" />
                    ) : (
                      <Pause className="size-4" />
                    )}
                    {isPaused ? "Resume" : "Pause"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isBusy}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmKill(s)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <AlertDialog
        open={Boolean(confirmKill)}
        onOpenChange={(open) => !open && setConfirmKill(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this sandbox?</AlertDialogTitle>
            <AlertDialogDescription>
              Everything inside it — files, installed packages, running servers
              — is destroyed. This cannot be undone. To stop it costing anything
              while keeping the files, pause it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmKill && kill(confirmKill)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
