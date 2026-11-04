"use client";

import { useBuilds, type BuildStatus } from "@/hooks/queries/use-builds";
import { fetcher } from "lib/utils";
import useSWR from "swr";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
import { Label } from "ui/label";
import { Skeleton } from "ui/skeleton";
import { Textarea } from "ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import { Cloud, Hammer, Loader2, Plus, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export const statusVariant = (
  status: BuildStatus,
): "secondary" | "destructive" | "outline" =>
  status === "ready"
    ? "secondary"
    : status === "failed"
      ? "destructive"
      : "outline";

const relativeTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

export default function BuildDashboard({ threadId }: { threadId?: string }) {
  const router = useRouter();
  const { data, isLoading, mutate } = useBuilds();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"static" | "agent" | "vibesdk">("static");
  const [submitting, setSubmitting] = useState(false);
  const [agent, setAgent] = useState<string>("opencode");
  const [agentModel, setAgentModel] = useState<string>("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);

  // Catalogue of coding agents; `available` reflects whether this deployment
  // has the vendor key configured (values are never sent to the client).
  const { data: agentData } = useSWR<{
    agents: {
      id: string;
      label: string;
      description: string;
      available: boolean;
      requiredEnv: string | null;
      models: { id: string; label: string }[];
      defaultModel: string | null;
    }[];
    fetchedAt?: string;
  }>(
    // Only poll while the dialog is open AND agent mode is selected — no
    // background traffic to the gateway when nobody is looking at the picker.
    open && mode === "agent"
      ? "/api/build/agents?fresh=1"
      : "/api/build/agents",
    fetcher,
    {
      revalidateOnFocus: false,
      errorRetryCount: 0,
      refreshInterval: open && mode === "agent" ? 10_000 : 0,
      keepPreviousData: true,
    },
  );
  const agentOptions = agentData?.agents ?? [];
  const selectedAgent = agentOptions.find((a) => a.id === agent);

  const builds = data?.builds ?? [];

  /**
   * Ask whether the prompt is specific enough before spending a sandbox on a
   * guess. Only interrupts when the answer would genuinely change the app;
   * the user can always ignore the questions and build anyway.
   */
  const checkThenCreate = async () => {
    if (!prompt.trim()) {
      toast.error("Describe what you want to build");
      return;
    }
    setChecking(true);
    try {
      const res = await fetch("/api/build/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.readyToBuild === false && data.questions?.length) {
        setQuestions(data.questions);
        return;
      }
    } catch {
      // Clarification is an optimisation, never a gate — fall through.
    } finally {
      setChecking(false);
    }
    await create();
  };

  const create = async () => {
    if (!prompt.trim()) {
      toast.error("Describe what you want to build");
      return;
    }
    if (!threadId) {
      toast.error("Open a chat first — builds are attached to a conversation.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          threadId,
          mode,
          ...(mode === "agent"
            ? { agent, agentModel: agentModel || undefined }
            : {}),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          payload?.message || payload?.error || `Failed (${res.status})`,
        );
      }
      // The API returns 202 as soon as the build is queued — it no longer
      // waits for completion, because Cloudflare kills connections at ~100s
      // and builds routinely run longer. The detail page polls for progress.
      toast.success("Build started");
      setOpen(false);
      setPrompt("");
      setQuestions([]);
      mutate();
      router.push(`/build/${payload.buildId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Build failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Hammer className="size-6" />
            Build
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Generate a working app and run it on a live preview URL.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="shrink-0">
          <Plus className="size-4" />
          New build
        </Button>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {isLoading ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : builds.length === 0 ? (
          <div className="border border-dashed rounded-lg py-16 flex flex-col items-center text-center">
            <Hammer className="size-8 text-muted-foreground mb-3" />
            <p className="font-medium">No builds yet</p>
            <p className="text-muted-foreground text-sm mt-1 max-w-sm">
              Describe an app and it will be generated, run in a sandbox, and
              given a preview link you can open.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setOpen(true)}
            >
              <Plus className="size-4" />
              New build
            </Button>
          </div>
        ) : (
          builds.map((b) => (
            <Link
              key={b.id}
              href={`/build/${b.id}`}
              className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {b.title || b.prompt.slice(0, 70)}
                  </p>
                  {b.summary && (
                    <p className="text-muted-foreground text-sm mt-0.5 line-clamp-1">
                      {b.summary}
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs mt-2">
                    {relativeTime(b.createdAt)}
                    {b.framework ? ` · ${b.framework}` : ""}
                  </p>
                </div>
                <Badge variant={statusVariant(b.status)} className="shrink-0">
                  {b.status}
                </Badge>
              </div>
            </Link>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New build</DialogTitle>
            <DialogDescription>
              Describe the app. It runs in an isolated sandbox and gets its own
              preview URL.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="build-prompt">What should it do?</Label>
              <Textarea
                id="build-prompt"
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  if (questions.length) setQuestions([]);
                }}
                placeholder="A kanban board with drag-and-drop columns and local storage persistence…"
                rows={6}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Mode</Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("static")}
                  className={`border rounded-lg p-3 text-left transition-colors ${
                    mode === "static"
                      ? "border-primary bg-accent/50"
                      : "hover:bg-accent/30"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-medium text-sm">
                    <Zap className="size-3.5" />
                    Fast
                  </span>
                  <span className="text-muted-foreground text-xs mt-1 block">
                    One pass. Seconds.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("vibesdk")}
                  className={`border rounded-lg p-3 text-left transition-colors ${
                    mode === "vibesdk"
                      ? "border-primary bg-accent/50"
                      : "hover:bg-accent/30"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-medium text-sm">
                    <Cloud className="size-3.5" />
                    VibeSDK
                  </span>
                  <span className="text-muted-foreground text-xs mt-1 block">
                    Cloudflare builds & deploys it.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("agent")}
                  className={`border rounded-lg p-3 text-left transition-colors ${
                    mode === "agent"
                      ? "border-primary bg-accent/50"
                      : "hover:bg-accent/30"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-medium text-sm">
                    <Sparkles className="size-3.5" />
                    Agent
                  </span>
                  <span className="text-muted-foreground text-xs mt-1 block">
                    Codes in a terminal. Slower, better.
                  </span>
                </button>
              </div>
            </div>
          </div>

          {mode === "agent" && (
            <div className="flex flex-col gap-3 border rounded-lg p-3 bg-accent/20">
              <div className="flex flex-col gap-2">
                <Label htmlFor="agent-select">Coding agent</Label>
                <Select
                  value={agent}
                  onValueChange={(v) => {
                    setAgent(v);
                    setAgentModel("");
                  }}
                >
                  <SelectTrigger id="agent-select">
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agentOptions.map((a) => (
                      <SelectItem
                        key={a.id}
                        value={a.id}
                        disabled={!a.available}
                      >
                        <span className="flex flex-col items-start">
                          <span>
                            {a.label}
                            {!a.available &&
                              " — needs " + (a.requiredEnv ?? "a key")}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {a.description}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedAgent?.models?.length ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="agent-model">Model</Label>
                  <Select
                    value={agentModel || selectedAgent.defaultModel || ""}
                    onValueChange={setAgentModel}
                  >
                    <SelectTrigger id="agent-model">
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedAgent.models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          )}

          {questions.length > 0 && (
            <div className="border rounded-lg p-3 bg-accent/20 flex flex-col gap-2">
              <p className="text-sm font-medium">
                A few things would change what I build:
              </p>
              <ul className="text-muted-foreground text-sm list-decimal pl-5 flex flex-col gap-1">
                {questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
              <p className="text-muted-foreground text-xs">
                Add the answers to your description above, or build anyway and
                sensible defaults will be chosen.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {questions.length > 0 && (
              <Button variant="outline" onClick={create} disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Build anyway
              </Button>
            )}
            <Button
              onClick={questions.length > 0 ? create : checkThenCreate}
              disabled={submitting || checking}
            >
              {(submitting || checking) && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {checking ? "Checking…" : submitting ? "Starting…" : "Build"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
