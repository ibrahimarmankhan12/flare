"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "ui/button";
import { toast } from "sonner";

const EDITOR_URL =
  process.env.NEXT_PUBLIC_N8N_EDITOR_URL ?? "https://n8n.flare-sh.tech";

interface N8nWorkflowEmbedProps {
  workflowId: string;
  workflowName: string;
  active: boolean;
}

export default function N8nWorkflowEmbed({
  workflowId,
  workflowName,
  active,
}: N8nWorkflowEmbedProps) {
  const t = useTranslations();
  const [isActive, setIsActive] = useState(active);
  const [isToggling, setIsToggling] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const toggleActive = async () => {
    setIsToggling(true);
    try {
      const res = await fetch(`/api/workflow/${workflowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !isActive }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setIsActive(!isActive);
      toast.success(t("Workflow.visibilityUpdated"));
    } catch {
      toast.error(t("Common.error"));
    } finally {
      setIsToggling(false);
    }
  };

  const run = async () => {
    setIsRunning(true);
    try {
      const res = await fetch(`/api/workflow/${workflowId}/execute`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to run");
      toast.success(t("Workflow.runSuccess"));
    } catch {
      toast.error(t("Workflow.runError"));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-2 p-4">
      <div className="flex flex-row items-center gap-3">
        <h1 className="text-lg font-semibold truncate flex-1">
          {workflowName}
        </h1>
        <Button
          variant={isActive ? "default" : "outline"}
          size="sm"
          onClick={toggleActive}
          disabled={isToggling}
        >
          {isActive ? t("Workflow.active") : t("Workflow.inactive")}
        </Button>
        <Button variant="secondary" size="sm" onClick={run} disabled={isRunning}>
          {t("Workflow.run")}
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a
            href={`${EDITOR_URL}/workflow/${workflowId}`}
            target="_blank"
            rel="noreferrer"
          >
            {t("Workflow.openInNewTab")}
          </a>
        </Button>
      </div>
      <iframe
        src={`/api/n8n/embed/${workflowId}`}
        className="flex-1 w-full border rounded-lg bg-white"
        title={workflowName}
        allow="clipboard-write; clipboard-read"
      />
    </div>
  );
}