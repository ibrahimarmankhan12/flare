"use client";
import { useObjectState } from "@/hooks/use-object-state";
import { UserPreferences } from "app-types/user";
import { authClient } from "auth/client";
import { fetcher } from "lib/utils";
import {
  AlertCircle,
  ArrowLeft,
  Code2,
  Download,
  LinkIcon,
  Loader,
  Pencil,
  Plus,
  Share2,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { safe } from "ts-safe";

import { useMcpList } from "@/hooks/queries/use-mcp-list";
import { ChatExportSummary } from "app-types/chat-export";
import { MCPServerInfo } from "app-types/mcp";
import { SavedNote } from "app-types/user";
import { formatDistanceToNow } from "date-fns";
import { notify } from "lib/notify";
import { downloadMarkdownFile } from "lib/notes";
import { Button } from "ui/button";
import { ExamplePlaceholder } from "ui/example-placeholder";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { Skeleton } from "ui/skeleton";
import { Textarea } from "ui/textarea";
import { McpServerCustomizationContent } from "./mcp-customization-popup";

export function UserInstructionsContent() {
  const t = useTranslations();

  const responseStyleExamples = useMemo(
    () => [
      t("Chat.ChatPreferences.responseStyleExample1"),
      t("Chat.ChatPreferences.responseStyleExample2"),
      t("Chat.ChatPreferences.responseStyleExample3"),
      t("Chat.ChatPreferences.responseStyleExample4"),
    ],
    [],
  );

  const professionExamples = useMemo(
    () => [
      t("Chat.ChatPreferences.professionExample1"),
      t("Chat.ChatPreferences.professionExample2"),
      t("Chat.ChatPreferences.professionExample3"),
      t("Chat.ChatPreferences.professionExample4"),
      t("Chat.ChatPreferences.professionExample5"),
    ],
    [],
  );

  const { data: session } = authClient.useSession();

  const [preferences, setPreferences] = useObjectState<UserPreferences>({
    displayName: "",
    responseStyleExample: "",
    profession: "",
    botName: "",
  });

  const {
    data,
    mutate: fetchPreferences,
    isLoading,
    isValidating,
  } = useSWR<UserPreferences>("/api/user/preferences", fetcher, {
    fallback: {},
    dedupingInterval: 0,
    onSuccess: (data) => {
      setPreferences(data);
    },
  });

  const [isSaving, setIsSaving] = useState(false);

  const savePreferences = async () => {
    safe(() => setIsSaving(true))
      .ifOk(() =>
        fetch("/api/user/preferences", {
          method: "PUT",
          body: JSON.stringify(preferences),
        }),
      )
      .ifOk(() => fetchPreferences())
      .watch((result) => {
        if (result.isOk)
          toast.success(t("Chat.ChatPreferences.preferencesSaved"));
        else toast.error(t("Chat.ChatPreferences.failedToSavePreferences"));
      })
      .watch(() => setIsSaving(false));
  };

  const isDiff = useMemo(() => {
    if ((data?.displayName || "") !== (preferences.displayName || ""))
      return true;
    if ((data?.profession || "") !== (preferences.profession || ""))
      return true;
    if (
      (data?.responseStyleExample || "") !==
      (preferences.responseStyleExample || "")
    )
      return true;
    if ((data?.botName || "") !== (preferences.botName || "")) return true;
    return false;
  }, [preferences, data]);

  return (
    <div className="flex flex-col">
      <h3 className="text-xl font-semibold">
        {t("Chat.ChatPreferences.userInstructions")}
      </h3>
      <p className="text-sm text-muted-foreground py-2 pb-6">
        {t("Chat.ChatPreferences.userInstructionsDescription")}
      </p>

      <div className="flex flex-col gap-6 w-full">
        <div className="flex flex-col gap-2">
          <Label>{t("Chat.ChatPreferences.whatShouldWeCallYou")}</Label>
          {isLoading ? (
            <Skeleton className="h-9" />
          ) : (
            <Input
              placeholder={session?.user.name || ""}
              value={preferences.displayName}
              onChange={(e) => {
                setPreferences({
                  displayName: e.target.value,
                });
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label>{t("Chat.ChatPreferences.botName")}</Label>
          {isLoading ? (
            <Skeleton className="h-9" />
          ) : (
            <Input
              placeholder="Flare AI"
              value={preferences.botName}
              onChange={(e) => {
                setPreferences({
                  botName: e.target.value,
                });
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-2 text-foreground flex-1">
          <Label>{t("Chat.ChatPreferences.whatBestDescribesYourWork")}</Label>
          <div className="relative w-full">
            {isLoading ? (
              <Skeleton className="h-9" />
            ) : (
              <>
                <Input
                  value={preferences.profession}
                  onChange={(e) => {
                    setPreferences({
                      profession: e.target.value,
                    });
                  }}
                />
                {(preferences.profession?.length ?? 0) === 0 && (
                  <div className="absolute left-0 top-0 w-full h-full py-2 px-4 pointer-events-none">
                    <ExamplePlaceholder placeholder={professionExamples} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 text-foreground">
          <Label>
            {t(
              "Chat.ChatPreferences.whatPersonalPreferencesShouldBeTakenIntoAccountInResponses",
            )}
          </Label>
          <span className="text-xs text-muted-foreground"></span>
          <div className="relative w-full">
            {isLoading ? (
              <Skeleton className="h-60" />
            ) : (
              <>
                <Textarea
                  className="h-60 resize-none"
                  value={preferences.responseStyleExample}
                  onChange={(e) => {
                    setPreferences({
                      responseStyleExample: e.target.value,
                    });
                  }}
                />
                {(preferences.responseStyleExample?.length ?? 0) === 0 && (
                  <div className="absolute left-0 top-0 w-full h-full py-2 px-4 pointer-events-none">
                    <ExamplePlaceholder placeholder={responseStyleExamples} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {isDiff && !isValidating && (
        <div className="flex pt-4 items-center justify-end fade-in animate-in duration-300">
          <Button variant="ghost">{t("Common.cancel")}</Button>
          <Button disabled={isSaving || isLoading} onClick={savePreferences}>
            {t("Common.save")}
            {isSaving && <Loader className="size-4 ml-2 animate-spin" />}
          </Button>
        </div>
      )}
    </div>
  );
}

export function MCPInstructionsContent() {
  const t = useTranslations("");
  const [search, setSearch] = useState("");
  const [mcpServer, setMcpServer] = useState<
    (MCPServerInfo & { id: string }) | null
  >(null);

  const { isLoading, data: mcpList } = useMcpList();

  if (mcpServer) {
    return (
      <McpServerCustomizationContent
        title={
          <div className="flex flex-col">
            <button
              onClick={() => setMcpServer(null)}
              className="flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground transition-colors mb-8"
            >
              <ArrowLeft className="size-3" />
              {t("Common.back")}
            </button>
            {mcpServer.name}
          </div>
        }
        mcpServerInfo={mcpServer}
      />
    );
  }

  return (
    <div className="flex flex-col">
      <h3 className="text-xl font-semibold">
        {t("Chat.ChatPreferences.mcpInstructions")}
      </h3>
      <p className="text-sm text-muted-foreground py-2 pb-6">
        {t("Chat.ChatPreferences.mcpInstructionsDescription")}
      </p>

      <div className="flex flex-col gap-6 w-full">
        <div className="flex flex-col gap-2 text-foreground flex-1">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            placeholder={t("Common.search")}
          />
        </div>
        <div className="flex flex-col gap-2 text-foreground flex-1">
          {isLoading ? (
            Array.from({ length: 10 }).map((_, index) => (
              <Skeleton key={index} className="h-14" />
            ))
          ) : mcpList?.length === 0 ? (
            <div className="flex flex-col gap-2 text-foreground flex-1">
              <p className="text-center py-8 text-muted-foreground">
                {t("MCP.configureYourMcpServerConnectionSettings")}
              </p>
            </div>
          ) : (
            <div className="flex gap-2">
              {mcpList?.map((mcp) => (
                <Button
                  onClick={() => setMcpServer({ ...mcp, id: mcp.id })}
                  variant={"outline"}
                  size={"lg"}
                  key={mcp.id}
                >
                  <p>{mcp.name}</p>
                  {mcp.error ? (
                    <AlertCircle className="size-3.5 text-destructive" />
                  ) : mcp.status == "loading" ? (
                    <Loader className="size-3.5 animate-spin" />
                  ) : null}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ExportsManagementContent() {
  const t = useTranslations();

  const {
    data: exports,
    mutate: refetchExports,
    isLoading,
  } = useSWR<ChatExportSummary[]>("/api/export", fetcher);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (exportId: string) => {
    const answer = await notify.confirm({
      description: t("Chat.ChatPreferences.confirmDeleteExport"),
    });
    if (!answer) {
      return;
    }

    try {
      setDeletingId(exportId);
      const response = await fetch(`/api/export/${exportId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete export");
      }

      toast.success(t("Chat.ChatPreferences.exportDeleted"));
      refetchExports();
    } catch (_error) {
      toast.error(t("Chat.ChatPreferences.failedToDeleteExport"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyLink = (exportId: string) => {
    const link = `${window.location.origin}/export/${exportId}`;
    navigator.clipboard.writeText(link);
    toast.success(t("Chat.ChatPreferences.linkCopied"));
  };

  return (
    <div className="flex flex-col">
      <h3 className="text-xl font-semibold">
        {t("Chat.ChatPreferences.myExports")}
      </h3>
      <p className="text-sm text-muted-foreground py-2 pb-6">
        {t("Chat.ChatPreferences.myExportsDescription")}
      </p>

      <div className="flex flex-col gap-4 w-full">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))
        ) : !exports || exports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Share2 className="size-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              {t("Chat.ChatPreferences.noExportsYet")}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {t("Chat.ChatPreferences.exportHint")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {exports.map((exportItem) => (
              <div
                key={exportItem.id}
                onClick={() => {
                  window.open(`/export/${exportItem.id}`, "_blank");
                }}
                className="border rounded-lg p-4 hover:bg-accent/50 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate">{exportItem.title}</h4>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-2 text-sm text-muted-foreground">
                      <span>
                        {t("Chat.ChatPreferences.exported")}{" "}
                        {formatDistanceToNow(new Date(exportItem.exportedAt), {
                          addSuffix: true,
                        })}
                      </span>
                      {exportItem.expiresAt && (
                        <>
                          <span className="hidden sm:inline">•</span>
                          <span>
                            {t("Chat.ChatPreferences.expires")}{" "}
                            {formatDistanceToNow(
                              new Date(exportItem.expiresAt),
                              {
                                addSuffix: true,
                              },
                            )}
                          </span>
                        </>
                      )}
                      {exportItem.commentCount > 0 && (
                        <>
                          <span className="hidden sm:inline">•</span>
                          <span>
                            {exportItem.commentCount}{" "}
                            {t("Chat.ChatPreferences.comments")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleCopyLink(exportItem.id);
                      }}
                      title={t("Chat.ChatPreferences.copyLink")}
                    >
                      <LinkIcon className="size-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDelete(exportItem.id);
                      }}
                      disabled={deletingId === exportItem.id}
                      title={t("Common.delete")}
                    >
                      {deletingId === exportItem.id ? (
                        <Loader className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4 hover:text-destructive" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type SkillItem = {
  id: string;
  name: string;
  markdown: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

type SkillsApiResponse = {
  skills: SkillItem[];
};

type GenerateSkillResponse = {
  name: string;
  description?: string;
  markdown: string;
};

export function SkillsContent() {
  const {
    data,
    mutate: refetchSkills,
    isLoading,
  } = useSWR<SkillsApiResponse>("/api/skills", fetcher);
  const skills = data?.skills ?? [];

  const [editingSkillId, setEditingSkillId] = useState<string | "new" | null>(
    null,
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const resetEditor = () => {
    setName("");
    setDescription("");
    setMarkdown("");
    setEditingSkillId(null);
  };

  const openNewSkillEditor = () => {
    setName("");
    setDescription("");
    setMarkdown(
      "## Goal\n\n## When to use\n\n## Instructions\n\n## Constraints\n\n## Output format\n",
    );
    setEditingSkillId("new");
  };

  const openExistingSkillEditor = (skill: SkillItem) => {
    setName(skill.name);
    setDescription(skill.description ?? "");
    setMarkdown(skill.markdown);
    setEditingSkillId(skill.id);
  };

  const handleGenerateSkill = async () => {
    if (generatePrompt.trim().length < 6) {
      toast.error("Please describe what this skill should do.");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch("/api/skills/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: generatePrompt }),
      });

      const payload = (await response
        .json()
        .catch(() => ({}))) as GenerateSkillResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to generate skill");
      }

      setName(payload.name || name);
      setDescription(payload.description || "");
      setMarkdown(payload.markdown || "");
      setEditingSkillId((prev) => prev || "new");
      toast.success("Skill draft generated. Review and save.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to generate skill",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveSkill = async () => {
    const payload = {
      id:
        editingSkillId && editingSkillId !== "new" ? editingSkillId : undefined,
      name,
      description,
      markdown,
    };

    setIsSaving(true);
    try {
      const response = await fetch("/api/skills", {
        method: editingSkillId && editingSkillId !== "new" ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || "Failed to save skill");
      }

      await refetchSkills();
      toast.success(
        editingSkillId && editingSkillId !== "new"
          ? "Skill updated"
          : "Skill created",
      );
      resetEditor();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save skill",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSkill = async (skill: SkillItem) => {
    const confirmed = await notify.confirm({
      title: "Delete skill",
      description: `This will remove /${skill.name}.`,
    });
    if (!confirmed) return;

    setDeletingId(skill.id);
    try {
      const response = await fetch(`/api/skills?id=${skill.id}`, {
        method: "DELETE",
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.error || "Failed to delete skill");
      }

      await refetchSkills();
      if (editingSkillId === skill.id) {
        resetEditor();
      }
      toast.success("Skill deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete skill",
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col">
      <h3 className="text-xl font-semibold">Skills</h3>
      <p className="text-sm text-muted-foreground py-2 pb-6">
        Create reusable skills directly here with markdown, or generate a draft
        with AI. Then use them in chat with <code>/skill-name</code>.
      </p>

      <div className="rounded-xl border bg-muted/20 p-4 mb-6 space-y-3">
        <Label>Generate skill with AI</Label>
        <div className="flex gap-2">
          <Input
            value={generatePrompt}
            onChange={(e) => setGeneratePrompt(e.target.value)}
            placeholder="Example: Create a product PRD writing skill"
          />
          <Button onClick={handleGenerateSkill} disabled={isGenerating}>
            {isGenerating ? (
              <Loader className="size-4 animate-spin mr-2" />
            ) : (
              <WandSparkles className="size-4 mr-2" />
            )}
            Generate
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {skills.length} skill{skills.length === 1 ? "" : "s"}
        </p>
        <Button variant="outline" onClick={openNewSkillEditor}>
          <Plus className="size-4 mr-2" />
          New skill
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3 mb-6">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} className="h-14" />
          ))}
        </div>
      ) : !skills.length ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border rounded-xl mb-6">
          <Code2 className="size-10 text-muted-foreground/60 mb-3" />
          <p className="text-muted-foreground">No skills yet.</p>
          <p className="text-xs text-muted-foreground mt-2">
            Create one manually or generate with AI above.
          </p>
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {skills.map((skill) => (
            <div key={skill.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    <code>/{skill.name}</code>
                  </p>
                  {skill.description ? (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {skill.description}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground mt-1">
                    Updated{" "}
                    {formatDistanceToNow(new Date(skill.updatedAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openExistingSkillEditor(skill)}
                    title="Edit skill"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={deletingId === skill.id}
                    onClick={() => handleDeleteSkill(skill)}
                    title="Delete skill"
                  >
                    {deletingId === skill.id ? (
                      <Loader className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4 hover:text-destructive" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingSkillId && (
        <div className="border rounded-xl p-4 space-y-4 bg-muted/10">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-semibold">
              {editingSkillId === "new" ? "Create skill" : "Edit skill"}
            </h4>
            <Button variant="ghost" size="sm" onClick={resetEditor}>
              Cancel
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Skill name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="presentation"
            />
            <p className="text-xs text-muted-foreground">
              Used as slash command: <code>/{name || "skill-name"}</code>
            </p>
          </div>

          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Helps write polished presentations"
            />
          </div>

          <div className="space-y-2">
            <Label>Markdown instructions</Label>
            <Textarea
              className="min-h-[280px] font-mono text-sm"
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              placeholder="Write reusable instructions in markdown..."
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveSkill} disabled={isSaving}>
              {isSaving ? (
                <Loader className="size-4 animate-spin mr-2" />
              ) : null}
              Save skill
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SavedNotesContent() {
  const {
    data: notes,
    mutate: refetchNotes,
    isLoading,
  } = useSWR<SavedNote[]>("/api/user/notes", fetcher);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    const confirmed = await notify.confirm({
      title: "Delete note",
      description: "This note will be removed from your saved notes.",
    });

    if (!confirmed) return;

    setDeletingId(id);
    try {
      const response = await fetch(`/api/user/notes?id=${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to delete note");
      }

      await refetchNotes();
      toast.success("Note deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete note",
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col">
      <h3 className="text-xl font-semibold">Saved Notes</h3>
      <p className="text-sm text-muted-foreground py-2 pb-6">
        Notes saved from assistant responses. Download any note as markdown.
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      ) : !notes?.length ? (
        <div className="rounded-xl border py-10 text-center text-sm text-muted-foreground">
          No notes saved yet. Use <b>Save to notes</b> under any assistant
          reply.
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="rounded-xl border p-4 bg-muted/15 space-y-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-medium truncate">{note.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Saved{" "}
                    {formatDistanceToNow(new Date(note.createdAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      downloadMarkdownFile({
                        title: note.title,
                        markdown: note.markdown,
                      })
                    }
                    title="Download markdown"
                  >
                    <Download className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={deletingId === note.id}
                    onClick={() => handleDelete(note.id)}
                    title="Delete note"
                  >
                    {deletingId === note.id ? (
                      <Loader className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4 hover:text-destructive" />
                    )}
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                {note.markdown}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
