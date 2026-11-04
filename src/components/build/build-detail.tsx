"use client";

import { useBuild, isSettled } from "@/hooks/queries/use-builds";
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
  ArrowLeft,
  ExternalLink,
  FileCode2,
  Loader2,
  RefreshCw,
  Terminal,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { statusVariant } from "./build-dashboard";

export default function BuildDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data, isLoading, mutate } = useBuild(id);
  const [selected, setSelected] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [log, setLog] = useState("");
  const [stage, setStage] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const logRef = useRef<HTMLPreElement | null>(null);

  // Live output over SSE. The endpoint replays buffered history on connect,
  // so opening this page late still shows the build from the beginning.
  useEffect(() => {
    if (!id) return;
    const es = new EventSource(`/api/build/${id}/stream`);
    setStreaming(true);
    es.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data);
        if (event.type === "output")
          setLog((prev) => (prev + event.chunk).slice(-60_000));
        else if (event.type === "stage") {
          setStage(event.stage);
          if (event.detail && event.stage !== "ready") {
            setLog((prev) =>
              `${prev}\n[${event.stage}] ${event.detail}\n`.slice(-60_000),
            );
          }
        } else if (event.type === "file") {
          setLog((prev) => `${prev}\n  + ${event.path}\n`.slice(-60_000));
        } else if (event.type === "done") {
          setStage(event.status);
          setStreaming(false);
          es.close();
          // Pull the final row so files/preview appear without waiting for
          // the next poll tick.
          mutate();
        }
      } catch {
        /* ignore malformed frame */
      }
    };
    es.onerror = () => {
      // EventSource retries on its own; only reflect that we are not live.
      setStreaming(false);
    };
    return () => es.close();
  }, [id, mutate]);

  // Keep the console pinned to the newest output.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const build = data?.build;
  const files = build?.files ?? [];

  // Default to index.html — it's the entry point of every generated app.
  useEffect(() => {
    if (!selected && files.length > 0) {
      const entry = files.find((f) => f.path.endsWith("index.html"));
      setSelected(entry?.path ?? files[0].path);
    }
  }, [files, selected]);

  const resume = async () => {
    setResuming(true);
    try {
      const res = await fetch(`/api/build/${id}/resume`, { method: "POST" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Failed (${res.status})`);
      // 202 — the resume runs in the background, same as a build.
      toast.success("Resuming — this page will update");
      setLog("");
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resume");
    } finally {
      setResuming(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/build/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Build deleted");
      router.push("/build");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
      setDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-8 flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!build) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
        <p className="font-medium">Build not found</p>
        <Link href="/build">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="size-4" />
            Back
          </Button>
        </Link>
      </div>
    );
  }

  const working = !isSettled(build.status);
  const selectedFile = files.find((f) => f.path === selected);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <Link
        href="/build"
        className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1.5 w-fit"
      >
        <ArrowLeft className="size-4" />
        Build
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold truncate">
              {build.title || build.prompt.slice(0, 60)}
            </h1>
            <Badge variant={statusVariant(build.status)}>
              {working && <Loader2 className="size-3 animate-spin mr-1" />}
              {build.status}
            </Badge>
          </div>
          {build.summary && (
            <p className="text-muted-foreground text-sm mt-1">
              {build.summary}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {build.status === "ready" && build.previewUrl && (
            <a
              href={build.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <ExternalLink className="size-4" />
                Open
              </Button>
            </a>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={resume}
            disabled={resuming}
          >
            {resuming ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Resume
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {build.status === "failed" && (
        <div className="mt-6 border border-destructive/40 bg-destructive/10 rounded-lg p-4">
          <p className="font-medium flex items-center gap-2 text-sm">
            <TriangleAlert className="size-4" />
            This build failed
          </p>
          <p className="text-muted-foreground text-sm mt-1 break-words">
            {build.error || "No error detail was recorded."}
          </p>
        </div>
      )}

      {build.status === "ready" && build.previewUrl && (
        <div className="mt-6">
          <p className="text-muted-foreground text-xs mb-2">
            Live preview · {build.previewUrl}
          </p>
          <div className="border rounded-lg overflow-hidden bg-white">
            <iframe
              src={build.previewUrl}
              title="Build preview"
              className="w-full h-[560px]"
              sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
            />
          </div>
        </div>
      )}

      {(working || log) && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-muted-foreground text-xs flex items-center gap-1.5">
              <Terminal className="size-3.5" />
              Live output
              {stage && <span className="text-foreground/70">· {stage}</span>}
            </p>
            {working && (
              <span className="text-muted-foreground text-xs flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" />
                {streaming ? "streaming" : "reconnecting…"}
              </span>
            )}
          </div>
          <pre
            ref={logRef}
            className="border rounded-lg bg-muted/30 text-xs p-3 overflow-auto h-[280px] leading-relaxed whitespace-pre-wrap break-words"
          >
            <code>{log || "Waiting for output…"}</code>
          </pre>
          {working && (
            <p className="text-muted-foreground text-xs mt-2">
              This runs in the background — you can leave this page and come
              back.
            </p>
          )}
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-8">
          <h2 className="font-medium text-sm text-muted-foreground">
            Files ({files.length})
          </h2>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3">
            <div className="border rounded-lg p-2 flex flex-col gap-1 max-h-[420px] overflow-y-auto">
              {files.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => setSelected(f.path)}
                  className={`text-left text-xs px-2 py-1.5 rounded flex items-center gap-1.5 transition-colors ${
                    selected === f.path
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/50"
                  }`}
                >
                  <FileCode2 className="size-3.5 shrink-0" />
                  <span className="truncate">{f.path}</span>
                </button>
              ))}
            </div>
            <div className="border rounded-lg overflow-hidden">
              <pre className="text-xs p-3 overflow-auto max-h-[420px] leading-relaxed">
                <code>{selectedFile?.content ?? "Select a file"}</code>
              </pre>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this build?</AlertDialogTitle>
            <AlertDialogDescription>
              The sandbox is shut down and the generated files are removed. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
