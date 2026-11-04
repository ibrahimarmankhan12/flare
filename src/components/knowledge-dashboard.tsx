"use client";

import { useCollections } from "@/hooks/queries/use-collections";
import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { Skeleton } from "ui/skeleton";
import { Textarea } from "ui/textarea";
import { Library, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

// P2.1 follow-up — knowledge base UI. The ingest API landed first
// (/api/collections); this is the surface for it.

export default function KnowledgeDashboard() {
  const { data, isLoading, mutate } = useCollections();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const collections = data?.collections ?? [];

  const create = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Collection created");
      setOpen(false);
      setName("");
      setDescription("");
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Library className="size-6" />
            Knowledge Base
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Collections of documents your assistant can search and cite.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="shrink-0">
          <Plus className="size-4" />
          New collection
        </Button>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {isLoading ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : collections.length === 0 ? (
          <div className="border border-dashed rounded-lg py-16 flex flex-col items-center text-center">
            <Library className="size-8 text-muted-foreground mb-3" />
            <p className="font-medium">No collections yet</p>
            <p className="text-muted-foreground text-sm mt-1 max-w-sm">
              Create a collection, then add notes, text files, or URLs. Your
              assistant will search them when answering.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setOpen(true)}
            >
              <Plus className="size-4" />
              New collection
            </Button>
          </div>
        ) : (
          collections.map((c) => (
            <Link
              key={c.id}
              href={`/knowledge/${c.id}`}
              className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
            >
              <p className="font-medium">{c.name}</p>
              {c.description && (
                <p className="text-muted-foreground text-sm mt-0.5 line-clamp-1">
                  {c.description}
                </p>
              )}
              <p className="text-muted-foreground text-xs mt-2">
                Created {new Date(c.createdAt).toLocaleDateString()}
              </p>
            </Link>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>
              A collection groups related documents together.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="kb-name">Name</Label>
              <Input
                id="kb-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Product docs"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !saving) create();
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="kb-desc">Description (optional)</Label>
              <Textarea
                id="kb-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What lives in this collection?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
