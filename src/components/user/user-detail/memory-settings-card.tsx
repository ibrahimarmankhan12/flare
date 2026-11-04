"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { fetcher } from "lib/utils";
import { Button } from "ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "ui/select";
import {
  Brain,
  Pencil,
  Trash2,
  Plus,
  Search,
  Loader2,
  Check,
  Sparkles,
  Download,
  Copy,
  ClipboardCheck,
  ExternalLink,
  Undo2,
} from "lucide-react";
import { Input } from "ui/input";
import { Textarea } from "ui/textarea";
import { toast } from "sonner";
import {
  buildSourceLink,
  getCategoryColor,
  getCategoryLabel,
  getScopeColor,
  getScopeLabel,
  MEMORY_CATEGORY_OPTIONS,
  truncateForPreview,
} from "./memory-ui-helpers";

/** Mirrors `MemoryWithSource` from `lib/ai/memory/memory-source.ts`. We
 *  keep this duplicate type local so the client bundle does not have to
 *  drag in the server-only helpers. */
interface MemorySource {
  threadId: string;
  preview: string;
}

interface Memory {
  id: string;
  content: string;
  category: string | null;
  scope: "user" | "agent" | "thread" | string;
  scopeId: string | null;
  sourceMessageId: string | null;
  confidence: number | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  source?: MemorySource;
}

const IMPORT_PROMPT = `Export all of my stored memories and any context you've learned about me from past conversations. Preserve my words verbatim where possible, especially for instructions and preferences.

## Categories (output in this order):

1. **Instructions**: Rules I've explicitly asked you to follow going forward — tone, format, style, "always do X", "never do Y", and corrections to your behavior. Only include rules from stored memories, not from conversations.

2. **Identity**: Name, age, location, education, family, relationships, languages, and personal interests.

3. **Career**: Current and past roles, companies, and general skill areas.

4. **Projects**: Projects I meaningfully built or committed to. Ideally ONE entry per project. Include what it does, current status, and any key decisions. Use the project name or a short descriptor as the first words of the entry.

5. **Preferences**: Opinions, tastes, and working-style preferences that apply broadly.

## Format:

Use section headers for each category. Within each category, list one entry per line, sorted by oldest date first. Format each line as:

[YYYY-MM-DD] - Entry content here.

If no date is known, use [unknown] instead.

## Output:
- Wrap the entire export in a single code block for easy copying.
- After the code block, state whether this is the complete set or if more remain.`;

function parseImportedMemories(
  text: string,
): { content: string; category: string }[] {
  const memories: { content: string; category: string }[] = [];
  const lines = text.split("\n");

  let currentCategory = "general";

  // Category header patterns
  const categoryPatterns: Record<string, RegExp> = {
    instructions: /^#{1,3}\s*(instructions|rules)/i,
    identity: /^#{1,3}\s*(identity|personal|about\s*me)/i,
    career: /^#{1,3}\s*(career|work|employment|professional)/i,
    projects: /^#{1,3}\s*(projects?|portfolio)/i,
    preferences: /^#{1,3}\s*(preferences?|opinions?|tastes?)/i,
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip code fence markers
    if (trimmed.startsWith("```")) continue;

    // Check if it's a category header
    let isHeader = false;
    for (const [cat, pattern] of Object.entries(categoryPatterns)) {
      if (pattern.test(trimmed)) {
        currentCategory = cat;
        isHeader = true;
        break;
      }
    }
    if (isHeader) continue;

    // Skip lines that are just numbered category labels (e.g., "1. **Instructions**:")
    if (/^\d+\.\s*\*\*\w+\*\*:?\s*$/.test(trimmed)) continue;

    // Parse memory entry: [date] - content OR - content OR just content
    let content = trimmed;

    // Strip leading bullet/list markers
    content = content.replace(/^[-*•]\s*/, "");

    // Strip date prefix like [2024-01-15] - or [unknown] -
    content = content.replace(/^\[[\w-]+\]\s*[-–—]\s*/, "");

    // Skip empty after stripping
    if (!content.trim()) continue;

    // Skip lines that look like instructions/meta
    if (
      content.toLowerCase().startsWith("this is the complete") ||
      content.toLowerCase().startsWith("no more remain") ||
      content.toLowerCase().startsWith("the above")
    )
      continue;

    memories.push({
      content: content.trim(),
      category: currentCategory,
    });
  }

  return memories;
}

export function MemorySettingsCard() {
  const {
    data: memories = [],
    isLoading,
    error,
  } = useSWR<Memory[]>("/api/user/memory", fetcher);

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState<string>("general");
  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState<string>("general");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Import dialog state
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const filteredMemories = memories.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      m.content.toLowerCase().includes(q) ||
      (m.category && m.category.toLowerCase().includes(q)) ||
      (m.scope && m.scope.toLowerCase().includes(q))
    );
  });

  const handleCreate = async () => {
    if (!newContent.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/user/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newContent.trim(),
          category: newCategory,
        }),
      });
      mutate("/api/user/memory");
      setNewContent("");
      setNewCategory("general");
      setIsAdding(false);
      toast.success("Memory saved");
    } catch {
      toast.error("Failed to save memory");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editContent.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/user/memory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          content: editContent.trim(),
          category: editCategory,
        }),
      });
      mutate("/api/user/memory");
      setEditingId(null);
      toast.success("Memory updated");
    } catch {
      toast.error("Failed to update memory");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Delete a memory with a 5-second undo window. The toast stays open for
   * 5s; clicking "Undo" re-creates the memory with the same content +
   * category (scope and sourceMessageId cannot be recovered from the
   * server, but that matches what the user just saw in the UI).
   */
  const handleDelete = (id: string) => {
    const memory = memories.find((m) => m.id === id);
    if (!memory) return;

    setDeletingId(id);

    // Optimistically remove from cache so the row disappears immediately.
    mutate(
      "/api/user/memory",
      async (current: Memory[] | undefined) => {
        return (current ?? []).filter((m) => m.id !== id);
      },
      { revalidate: false },
    );

    toast.success("Memory deleted", {
      description: truncateForPreview(memory.content, 60),
      duration: 5000,
      action: {
        label: (
          <span className="flex items-center gap-1.5">
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </span>
        ),
        onClick: async () => {
          try {
            await fetch("/api/user/memory", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: memory.content,
                category: memory.category ?? "general",
              }),
            });
            mutate("/api/user/memory");
            toast.success("Memory restored");
          } catch {
            toast.error("Failed to restore memory");
            // Refetch to bring the deleted row back in the correct state.
            mutate("/api/user/memory");
          }
        },
      },
    });

    // Fire the actual DELETE in the background. If it fails, refetch.
    fetch(`/api/user/memory?id=${id}`, { method: "DELETE" })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
      })
      .catch(() => {
        toast.error("Failed to delete memory");
        mutate("/api/user/memory");
      })
      .finally(() => {
        setDeletingId(null);
      });
  };

  const handleDeleteAll = async () => {
    if (
      !confirm(
        "Are you sure you want to delete all memories? This cannot be undone.",
      )
    )
      return;
    try {
      await fetch("/api/user/memory?all=true", { method: "DELETE" });
      mutate("/api/user/memory");
      toast.success("All memories deleted");
    } catch {
      toast.error("Failed to delete memories");
    }
  };

  const startEditing = (memory: Memory) => {
    setEditingId(memory.id);
    setEditContent(memory.content);
    setEditCategory(getCategoryLabel(memory.category));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditContent("");
    setEditCategory("general");
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(IMPORT_PROMPT);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      toast.error("Failed to copy prompt");
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);

    const parsed = parseImportedMemories(importText);
    if (parsed.length === 0) {
      toast.error("No memories could be parsed from the input");
      setImporting(false);
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const mem of parsed) {
      try {
        const res = await fetch("/api/user/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: mem.content,
            category: mem.category,
          }),
        });
        if (res.ok) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }

    mutate("/api/user/memory");
    setImporting(false);
    setImportOpen(false);
    setImportText("");

    if (failCount === 0) {
      toast.success(`Imported ${successCount} memories successfully`);
    } else {
      toast.success(`Imported ${successCount} memories (${failCount} failed)`);
    }
  };

  return (
    <>
      <Card className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-600/20">
                <Brain className="h-5 w-5 text-violet-400" />
              </div>
              <div>
                <CardTitle className="text-xl font-semibold">Memory</CardTitle>
                <CardDescription>
                  {memories.length === 0
                    ? "No memories saved yet"
                    : `${memories.length} ${memories.length === 1 ? "memory" : "memories"} saved`}
                </CardDescription>
              </div>
            </div>
          </div>

          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Flare AI automatically remembers important facts from your
            conversations. You can also add, edit, or remove memories manually.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsAdding(true)}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add memory
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setImportOpen(true)}
              className="gap-1.5"
            >
              <Download className="h-4 w-4" />
              Import memory from other
            </Button>
            {memories.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeleteAll}
                className="text-destructive hover:text-destructive ml-auto"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear all
              </Button>
            )}
          </div>

          {/* Search */}
          {memories.length > 3 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search memories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          )}

          {/* Add new memory inline */}
          {isAdding && (
            <div className="p-4 rounded-lg border border-dashed border-violet-500/30 bg-violet-500/5 space-y-3">
              <Textarea
                placeholder="Write a fact to remember (e.g., 'I prefer TypeScript over JavaScript')"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                className="min-h-[80px] resize-none"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Category</span>
                <CategorySelect
                  value={newCategory}
                  onValueChange={setNewCategory}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsAdding(false);
                    setNewContent("");
                    setNewCategory("general");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={!newContent.trim() || saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Check className="h-4 w-4 mr-1" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          )}

          {/* Memory list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading memories...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-destructive">
              Failed to load memories
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Sparkles className="h-8 w-8 mb-3 opacity-40" />
              <p className="text-sm font-medium">
                {search ? "No memories match your search" : "No memories yet"}
              </p>
              <p className="text-xs mt-1 text-center max-w-xs">
                {search
                  ? "Try different keywords"
                  : "Flare will learn about you as you chat, or you can add memories manually"}
              </p>
            </div>
          ) : (
            <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
              {filteredMemories.map((memory) => (
                <div
                  key={memory.id}
                  data-testid="memory-row"
                  data-memory-id={memory.id}
                  className="group flex items-start gap-3 p-3 rounded-lg hover:bg-secondary/30 transition-colors"
                >
                  {editingId === memory.id ? (
                    <div className="flex-1 space-y-2">
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="min-h-[60px] resize-none"
                        autoFocus
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Category
                        </span>
                        <CategorySelect
                          value={editCategory}
                          onValueChange={setEditCategory}
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={cancelEditing}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleUpdate(memory.id)}
                          disabled={!editContent.trim() || saving}
                        >
                          {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <Check className="h-4 w-4 mr-1" />
                          )}
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-relaxed">
                          {memory.content}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span
                            data-testid="memory-category-badge"
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getCategoryColor(memory.category)}`}
                          >
                            {getCategoryLabel(memory.category)}
                          </span>
                          <span
                            data-testid="memory-scope-badge"
                            title={`This memory applies to the ${getScopeLabel(memory.scope)} scope`}
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getScopeColor(memory.scope)}`}
                          >
                            {getScopeLabel(memory.scope)}
                          </span>
                          {memory.isPinned && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-500/15 text-yellow-400">
                              pinned
                            </span>
                          )}
                          {memory.confidence != null && (
                            <span
                              className="text-[10px] text-muted-foreground"
                              title={`Extraction confidence: ${Math.round(memory.confidence * 100)}%`}
                            >
                              {Math.round(memory.confidence * 100)}%
                            </span>
                          )}
                          {memory.sourceMessageId && (
                            <SourceLink memory={memory} />
                          )}
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {new Date(memory.createdAt).toLocaleDateString(
                              undefined,
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              },
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => startEditing(memory)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          data-testid="memory-delete-button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(memory.id)}
                          disabled={deletingId === memory.id}
                        >
                          {deletingId === memory.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import Memory Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg">
              Import memory to Flare
            </DialogTitle>
            <DialogDescription className="sr-only">
              Import memories from another AI provider
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2 overflow-y-auto min-h-0 flex-1">
            {/* Step 1 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary shrink-0">
                  1
                </span>
                <p className="text-sm font-medium">
                  Copy this prompt into a chat with your other AI provider
                </p>
              </div>
              <div className="relative rounded-lg bg-secondary/50 border">
                <div className="p-3 pr-20 max-h-28 overflow-y-auto">
                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {IMPORT_PROMPT.slice(0, 240)}...
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute right-2 top-2 gap-1.5 text-xs"
                  onClick={handleCopyPrompt}
                >
                  {promptCopied ? (
                    <>
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Step 2 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary shrink-0">
                  2
                </span>
                <p className="text-sm font-medium">
                  Paste results below to add to Flare&apos;s memory
                </p>
              </div>
              <Textarea
                placeholder="Paste your memory details here"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="min-h-[140px] max-h-[40vh] overflow-y-auto resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleImport}
              disabled={!importText.trim() || importing}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Plus className="h-4 w-4 mr-1.5" />
              )}
              Add to memory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The "View source" affordance. Two paths:
 *  - When the source message and its thread are still in the DB, render
 *    a link that navigates to the thread with a `?message=<id>` query
 *    param, plus a tooltip showing the preview text.
 *  - When only `sourceMessageId` is set but the source row was deleted
 *    (FK set null behaviour), fall back to a tooltip with a placeholder
 *    so the user understands what the ID was for.
 */
function SourceLink({ memory }: { memory: Memory }) {
  const href = buildSourceLink({
    threadId: memory.source?.threadId,
    sourceMessageId: memory.sourceMessageId,
  });
  const preview = memory.source?.preview ?? "";
  const tooltipText = preview
    ? preview
    : "Source message reference (message may have been deleted)";

  const button = (
    <span
      data-testid="memory-source-link"
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
    >
      <ExternalLink className="h-3 w-3" />
      View source
    </span>
  );

  const content = (
    <TooltipContent
      side="top"
      className="max-w-xs whitespace-pre-wrap break-words"
    >
      {tooltipText}
      {href ? (
        <span className="block mt-1 text-[10px] opacity-70">
          Click to open the thread
        </span>
      ) : null}
    </TooltipContent>
  );

  if (href) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={href}
            className="inline-flex items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {button}
          </a>
        </TooltipTrigger>
        {content}
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center cursor-help">{button}</span>
      </TooltipTrigger>
      {content}
    </Tooltip>
  );
}

/**
 * A small shadcn-style category picker. Used on both the add and edit
 * forms. Renders the fixed taxonomy in `MEMORY_CATEGORY_OPTIONS`.
 */
function CategorySelect({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        size="sm"
        data-testid="memory-category-select"
        className="min-w-[140px]"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MEMORY_CATEGORY_OPTIONS.map((cat) => (
          <SelectItem key={cat} value={cat}>
            <span className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${getCategoryColor(cat)}`}
              />
              {cat}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
