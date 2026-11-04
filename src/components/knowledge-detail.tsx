"use client";

import { useCollection } from "@/hooks/queries/use-collections";
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
import { Input } from "ui/input";
import { Label } from "ui/label";
import { Skeleton } from "ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "ui/tabs";
import { Textarea } from "ui/textarea";
import {
  ArrowLeft,
  FileText,
  Link2,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

// Ingest is synchronous server-side (chunk -> embed -> store), so the
// submit buttons stay in a pending state until the API returns a chunk
// count rather than optimistically closing.

const statusVariant = (status: string) =>
  status === "ready"
    ? "secondary"
    : status === "failed"
      ? "destructive"
      : "outline";

export default function KnowledgeDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data, isLoading, mutate } = useCollection(id);
  const [text, setText] = useState("");
  const [filename, setFilename] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const items = data?.items ?? [];

  const post = async (body: BodyInit, headers?: HeadersInit) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/collections/${id}/items`, {
        method: "POST",
        headers,
        body,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          payload?.error || payload?.message || `Failed (${res.status})`,
        );
      }
      toast.success(
        `Added — ${payload.chunks} chunk${payload.chunks === 1 ? "" : "s"} indexed`,
      );
      mutate();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ingest failed");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addText = async () => {
    if (!text.trim()) return toast.error("Text is required");
    const ok = await post(
      JSON.stringify({
        text,
        filename: filename.trim() || undefined,
      }),
      { "Content-Type": "application/json" },
    );
    if (ok) {
      setText("");
      setFilename("");
    }
  };

  const addUrl = async () => {
    if (!url.trim()) return toast.error("URL is required");
    const ok = await post(JSON.stringify({ url: url.trim() }), {
      "Content-Type": "application/json",
    });
    if (ok) setUrl("");
  };

  const addFile = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    await post(form);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeCollection = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Collection deleted");
      router.push("/knowledge");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8 flex flex-col gap-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!data?.collection) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
        <p className="font-medium">Collection not found</p>
        <Link href="/knowledge">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="size-4" />
            Back
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        href="/knowledge"
        className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1.5 w-fit"
      >
        <ArrowLeft className="size-4" />
        Knowledge Base
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{data.collection.name}</h1>
          {data.collection.description && (
            <p className="text-muted-foreground text-sm mt-1">
              {data.collection.description}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive shrink-0"
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <Tabs defaultValue="text" className="mt-6">
        <TabsList>
          <TabsTrigger value="text">Paste text</TabsTrigger>
          <TabsTrigger value="file">Upload file</TabsTrigger>
          <TabsTrigger value="url">From URL</TabsTrigger>
        </TabsList>

        <TabsContent value="text" className="flex flex-col gap-3 pt-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="kb-title">Title (optional)</Label>
            <Input
              id="kb-title"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="release-notes.md"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="kb-text">Content</Label>
            <Textarea
              id="kb-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste notes, documentation, meeting minutes…"
              rows={8}
            />
          </div>
          <Button onClick={addText} disabled={busy} className="w-fit">
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileText className="size-4" />
            )}
            Add to collection
          </Button>
        </TabsContent>

        <TabsContent value="file" className="flex flex-col gap-3 pt-4">
          <Input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.markdown,.json,.csv,.tsv,.yaml,.yml,.log,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) addFile(f);
            }}
          />
          <p className="text-muted-foreground text-xs">
            PDF, DOCX, and text files (txt, md, json, csv, yaml), up to
            20&nbsp;MB. Scanned PDFs are read with OCR, which takes longer.
            Legacy .doc isn&apos;t supported — save as .docx.
          </p>
          {busy && (
            <p className="text-muted-foreground text-sm flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Parsing, chunking and embedding…
            </p>
          )}
        </TabsContent>

        <TabsContent value="url" className="flex flex-col gap-3 pt-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="kb-url">URL</Label>
            <Input
              id="kb-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/docs.md"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) addUrl();
              }}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Fetches the raw response — best for plain text, Markdown, or JSON.
            JavaScript-rendered pages won&apos;t extract cleanly.
          </p>
          <Button onClick={addUrl} disabled={busy} className="w-fit">
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Link2 className="size-4" />
            )}
            Fetch and add
          </Button>
        </TabsContent>
      </Tabs>

      <div className="mt-10">
        <h2 className="font-medium text-sm text-muted-foreground">
          Sources ({items.length})
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          {items.length === 0 ? (
            <div className="border border-dashed rounded-lg py-10 flex flex-col items-center text-center">
              <Upload className="size-6 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Nothing indexed yet. Add your first source above.
              </p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="border rounded-lg p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {item.filename || item.sourceUrl || "Untitled"}
                  </p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {item.chunkCount} chunk{item.chunkCount === 1 ? "" : "s"}
                    {item.mediaType ? ` · ${item.mediaType}` : ""}
                  </p>
                  {item.error && (
                    <p className="text-destructive text-xs mt-1">
                      {item.error}
                    </p>
                  )}
                </div>
                <Badge variant={statusVariant(item.status)}>
                  {item.status}
                </Badge>
              </div>
            ))
          )}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this collection?</AlertDialogTitle>
            <AlertDialogDescription>
              {items.length > 0
                ? `This permanently removes ${items.length} source${items.length === 1 ? "" : "s"} and everything indexed from them. This cannot be undone.`
                : "This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={removeCollection}
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
