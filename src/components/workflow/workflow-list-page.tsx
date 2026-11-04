"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import useSWR, { mutate } from "swr";
import { fetcher } from "lib/utils";
import { toast } from "sonner";
import { notify } from "lib/notify";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ArrowUpRight, Play, Trash2, Workflow as WorkflowIcon } from "lucide-react";
import { Button } from "ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "ui/card";
import { Skeleton } from "ui/skeleton";
import { BackgroundPaths } from "ui/background-paths";

export type N8nWorkflowSummary = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  updatedAt: string;
};

export default function WorkflowListPage({ userRole }: { userRole?: string | null } = {}) {
  const t = useTranslations();
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<string | null>(null);

  const { data: workflows, isLoading } = useSWR<N8nWorkflowSummary[]>(
    "/api/workflow",
    fetcher,
    { fallbackData: [] },
  );

  const createWorkflow = async () => {
    try {
      setIsCreating(true);
      const res = await fetch("/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: t("Workflow.newWorkflow") }),
      });
      if (!res.ok) throw new Error("Failed to create workflow");
      const workflow = await res.json();
      mutate("/api/workflow");
      router.push(`/workflow/${workflow.id}`);
    } catch {
      toast.error(t("Common.error"));
    } finally {
      setIsCreating(false);
    }
  };

  const deleteWorkflow = async (id: string) => {
    const ok = await notify.confirm({
      description: t("Workflow.deleteConfirm"),
    });
    if (!ok) return;
    try {
      setIsDeleting(id);
      const res = await fetch(`/api/workflow/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      mutate("/api/workflow");
      toast.success(t("Workflow.deleted"));
    } catch {
      toast.error(t("Common.error"));
    } finally {
      setIsDeleting(null);
    }
  };

  const runWorkflow = async (id: string) => {
    try {
      setIsRunning(id);
      const res = await fetch(`/api/workflow/${id}/execute`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to run");
      toast.success(t("Workflow.runSuccess"));
    } catch {
      toast.error(t("Workflow.runError"));
    } finally {
      setIsRunning(null);
    }
  };

  return (
    <div className="w-full flex flex-col gap-4 p-8">
      <div className="flex flex-row gap-2 items-center justify-between">
        <h2 className="text-lg font-semibold">{t("Workflow.myWorkflows")}</h2>
        <Button onClick={createWorkflow} disabled={isCreating}>
          {t("Workflow.createWorkflow")}
          <ArrowUpRight className="size-3.5" />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array(6)
              .fill(null)
              .map((_, index) => (
                <Skeleton key={index} className="w-full h-[176px]" />
              ))
          : workflows?.map((workflow) => (
              <Card
                key={workflow.id}
                className="relative bg-secondary overflow-hidden w-full hover:bg-input transition-colors h-[176px] cursor-pointer group"
                onClick={() => router.push(`/workflow/${workflow.id}`)}
              >
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <WorkflowIcon className="size-4 text-muted-foreground" />
                    <CardTitle className="flex-1 truncate text-base">
                      {workflow.name}
                    </CardTitle>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        workflow.active
                          ? "bg-green-500/15 text-green-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {workflow.active
                        ? t("Workflow.active")
                        : t("Workflow.inactive")}
                    </span>
                  </div>
                  {workflow.description && (
                    <CardDescription className="line-clamp-2">
                      {workflow.description}
                    </CardDescription>
                  )}
                  <div className="mt-auto pt-4 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(workflow.updatedAt), {
                        addSuffix: true,
                      })}
                    </span>
                    <div
                      className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("Workflow.run")}
                        onClick={() => runWorkflow(workflow.id)}
                        disabled={isRunning === workflow.id}
                      >
                        <Play className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("Workflow.delete")}
                        onClick={() => deleteWorkflow(workflow.id)}
                        disabled={isDeleting === workflow.id}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
      </div>

      {!isLoading && workflows?.length === 0 && (
        <Card className="col-span-full bg-transparent border-none">
          <CardHeader className="text-center py-12 items-center gap-4">
            <div className="relative w-full max-w-md h-32 opacity-60">
              <BackgroundPaths />
            </div>
            <div className="flex flex-col gap-2">
              <CardTitle>{t("Workflow.noAvailableWorkflows")}</CardTitle>
              <CardDescription>
                {t("Workflow.noAvailableWorkflowsDescription")}
              </CardDescription>
              <Button className="mt-4 mx-auto" onClick={createWorkflow}>
                {t("Workflow.createWorkflow")}
              </Button>
            </div>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}