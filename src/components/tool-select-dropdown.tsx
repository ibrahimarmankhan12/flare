"use client";

import { appStore } from "@/app/store";
import { AllowedMCPServer, MCPServerInfo } from "app-types/mcp";
import { cn } from "lib/utils";
import {
  ArrowUpRightIcon,
  ChartColumn,
  Clapperboard,
  CodeIcon,
  FileCode2,
  GlobeIcon,
  HardDriveUploadIcon,
  ImagesIcon,
  InfoIcon,
  MessageCircle,
  MousePointer2,
  Package,
  Plus,
  PresentationIcon,
  Waypoints,
  Wrench,
  WrenchIcon,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "ui/badge";
import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "ui/dialog";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "ui/dropdown-menu";
import { Input } from "ui/input";

import { useTranslations } from "next-intl";

import { useWorkflowToolList } from "@/hooks/queries/use-workflow-tool-list";
import { ChatMention } from "app-types/chat";
import { WorkflowSummary } from "app-types/workflow";
import { AppDefaultToolkit } from "lib/ai/tools";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import { Switch } from "ui/switch";
import { useShallow } from "zustand/shallow";
import { WorkflowGreeting } from "./workflow/workflow-greeting";

import { AgentSummary } from "app-types/agent";
import { authClient } from "auth/client";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

import { useAgents } from "@/hooks/queries/use-agents";
import { useChatModels } from "@/hooks/queries/use-chat-models";
import { IMAGE_GENERATION_MODELS } from "lib/ai/image/models";

// Re-enabled: image generation now routes through the Bifrost image-proxy.
const IMAGE_TOOLS_SELECTION_DISABLED = false;

export interface ToolSelectDropdownProps {
  align?: "start" | "end" | "center";
  side?: "left" | "right" | "top" | "bottom";
  disabled?: boolean;
  mentions?: ChatMention[];
  onSelectWorkflow?: (workflow: WorkflowSummary) => void;
  onSelectAgent?: (agent: AgentSummary) => void;
  onGenerateImage?: (modelId?: string) => void;
  className?: string;
}

const calculateToolCount = (
  allowedMcpServers: Record<string, AllowedMCPServer>,
  mcpList: (MCPServerInfo & { id: string })[],
) => {
  return mcpList.reduce((acc, server) => {
    const count = allowedMcpServers[server.id]?.tools?.length;
    return acc + count;
  }, 0);
};

export function ToolSelectSubMenu({
  onSelectWorkflow,
  onSelectAgent,
  onGenerateImage,
}: ToolSelectDropdownProps) {
  const t = useTranslations("Chat.Tool");

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <WrenchIcon className="mr-2 size-4" />
        <span>{t("toolsSetup")}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="md:w-72 max-h-[220px] overflow-y-auto scrollbar-slim">
          <ToolSetupMenuContent
            onSelectWorkflow={onSelectWorkflow}
            onSelectAgent={onSelectAgent}
            onGenerateImage={onGenerateImage}
          />
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

export function ToolSetupMenuContent({
  onSelectWorkflow,
  onSelectAgent,
  onGenerateImage,
}: ToolSelectDropdownProps) {
  const { data: providers } = useChatModels();
  const [globalModel] = appStore(useShallow((state) => [state.chatModel]));

  const modelInfo = useMemo(() => {
    const provider = providers?.find(
      (provider) => provider.provider === globalModel?.provider,
    );
    const model = provider?.models.find(
      (model) => model.name === globalModel?.model,
    );
    return model;
  }, [providers, globalModel]);

  useWorkflowToolList({
    refreshInterval: 1000 * 60 * 5,
  });

  const t = useTranslations("Chat.Tool");
  const [toolChoice, appStoreMutate] = appStore(
    useShallow((state) => [state.toolChoice, state.mutate]),
  );

  const nextMode = () => {
    const cycle = {
      auto: "manual" as const,
      manual: "none" as const,
      none: "codemode" as const,
      codemode: "auto" as const,
    };
    appStoreMutate({ toolChoice: cycle[toolChoice] });
  };

  const modeIcons: Record<string, string> = {
    auto: "⚙",
    manual: "✋",
    none: "⛔",
    codemode: "⌨",
  };

  return (
    <div>
      <DropdownMenuGroup>
        <DropdownMenuItem onClick={nextMode} className="cursor-pointer">
          <span className="mr-2 text-lg">{modeIcons[toolChoice]}</span>
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-sm">
              {toolChoice === "codemode"
                ? t("codemode")
                : toolChoice.charAt(0).toUpperCase() +
                  toolChoice.slice(1) +
                  " Mode"}
            </span>
            <span className="text-xs text-muted-foreground">
              {t(toolChoice + "ToolModeDescription")}
            </span>
          </div>
          <span className="ml-auto text-xs text-muted-foreground">
            Click to change
          </span>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <div className="py-1">
        <DropdownMenuSeparator />
      </div>
      <WorkflowToolSelector onSelectWorkflow={onSelectWorkflow} />
      <div className="py-1">
        <DropdownMenuSeparator />
      </div>
      <AgentSelector onSelectAgent={onSelectAgent} />
      <div className="py-1">
        <DropdownMenuSeparator />
      </div>
      <ImageGeneratorSelector
        onGenerateImage={onGenerateImage}
        modelInfo={modelInfo}
      />
      <div className="py-1">
        <DropdownMenuSeparator />
      </div>
      <div className="py-2">
        <ToolPresets />
        <div className="py-1">
          <DropdownMenuSeparator />
        </div>
        <AppDefaultToolKitSelector />
      </div>
    </div>
  );
}

function ToolPresets() {
  const [
    appStoreMutate,
    presets,
    allowedMcpServers,
    allowedAppDefaultToolkit,
    mcpList,
  ] = appStore(
    useShallow((state) => [
      state.mutate,
      state.toolPresets,
      state.allowedMcpServers,
      state.allowedAppDefaultToolkit,
      state.mcpList,
    ]),
  );
  const [open, setOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const t = useTranslations();

  const presetWithToolCount = useMemo(() => {
    return presets.map((preset) => ({
      ...preset,
      toolCount: calculateToolCount(preset.allowedMcpServers ?? {}, mcpList),
    }));
  }, [presets, mcpList]);

  const addPreset = useCallback(
    (name: string) => {
      if (name.trim() === "") {
        toast.error(t("Chat.Tool.presetNameCannotBeEmpty"));
        return;
      }
      if (presets.find((p) => p.name === name)) {
        toast.error(t("Chat.Tool.presetNameAlreadyExists"));
        return;
      }
      appStoreMutate((prev) => {
        return {
          toolPresets: [
            ...prev.toolPresets,
            { name, allowedMcpServers, allowedAppDefaultToolkit },
          ],
        };
      });
      setPresetName("");
      setOpen(false);
      toast.success(t("Chat.Tool.presetSaved"));
    },
    [allowedMcpServers, allowedAppDefaultToolkit, presets],
  );

  const deletePreset = useCallback((index: number) => {
    appStoreMutate((prev) => {
      return {
        toolPresets: prev.toolPresets.filter((_, i) => i !== index),
      };
    });
  }, []);

  const applyPreset = useCallback((preset: (typeof presets)[number]) => {
    appStoreMutate({
      allowedMcpServers: preset.allowedMcpServers,
      allowedAppDefaultToolkit: preset.allowedAppDefaultToolkit,
    });
  }, []);

  return (
    <DropdownMenuGroup className="cursor-pointer">
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="text-xs flex items-center gap-2 font-semibold cursor-pointer">
          <Package className="size-3.5" />
          {t("Chat.Tool.preset")}
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="md:w-80 md:max-h-96 overflow-y-auto">
            <DropdownMenuLabel className="flex items-center text-muted-foreground gap-2 text-xs">
              {t("Chat.Tool.toolPresets")}
              <div className="flex-1" />
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button variant={"secondary"} size={"sm"} className="text-xs">
                    {t("Chat.Tool.saveAsPreset")}
                    <Plus className="size-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("Chat.Tool.saveAsPreset")}</DialogTitle>
                  </DialogHeader>
                  <DialogDescription>
                    {t("Chat.Tool.saveAsPresetDescription")}
                  </DialogDescription>
                  <Input
                    placeholder="Preset Name"
                    value={presetName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        addPreset(presetName);
                      }
                    }}
                    onChange={(e) => setPresetName(e.target.value)}
                  />
                  <Button
                    variant={"secondary"}
                    size={"sm"}
                    className="border"
                    onClick={() => {
                      addPreset(presetName);
                    }}
                  >
                    {t("Common.save")}
                  </Button>
                </DialogContent>
              </Dialog>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {presets.length === 0 ? (
              <div className="text-sm text-muted-foreground w-full h-full flex flex-col items-center justify-center gap-2 py-6">
                <p>{t("Chat.Tool.noPresetsAvailableYet")}</p>
                <p className="text-xs px-4">
                  {t("Chat.Tool.clickSaveAsPresetToGetStarted")}
                </p>
              </div>
            ) : (
              presetWithToolCount.map((preset, index) => {
                return (
                  <DropdownMenuItem
                    onClick={() => {
                      applyPreset(preset);
                    }}
                    key={preset.name}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Badge
                      variant={"secondary"}
                      className="rounded-full border-input"
                    >
                      <Wrench className="size-3.5" />
                      <span className="min-w-6 text-center">
                        {preset.toolCount}
                      </span>
                    </Badge>
                    <span className="font-semibold truncate">
                      {preset.name}
                    </span>

                    <div className="flex-1" />
                    <div
                      className="p-1 hover:bg-input rounded-full cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault();
                        deletePreset(index);
                      }}
                    >
                      <X className="size-3.5" />
                    </div>
                  </DropdownMenuItem>
                );
              })
            )}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    </DropdownMenuGroup>
  );
}

function WorkflowToolSelector({
  onSelectWorkflow,
}: {
  onSelectWorkflow?: (workflow: WorkflowSummary) => void;
}) {
  const t = useTranslations();
  const workflowToolList = appStore((state) => state.workflowToolList);
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;

  // Separate user's workflows from shared workflows
  const myWorkflows = workflowToolList.filter(
    (w) => w.userId === currentUserId,
  );
  const sharedWorkflows = workflowToolList.filter(
    (w) => w.userId !== currentUserId,
  );
  return (
    <DropdownMenuGroup>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="text-xs flex items-center gap-2 font-semibold cursor-pointer">
          <Waypoints className="size-3.5" />
          {t("Workflow.title")}
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="w-80 relative">
            {myWorkflows.length === 0 && sharedWorkflows.length === 0 ? (
              <div className="text-sm text-muted-foreground flex flex-col py-6 px-6 gap-4 items-center">
                <InfoIcon className="size-4" />
                <p className="whitespace-pre-wrap">{t("Workflow.noTools")}</p>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant={"ghost"} className="relative group">
                      {t("Workflow.whatIsWorkflow")}
                      <div className="absolute left-0 -top-1.5 opacity-100 group-hover:opacity-0 transition-opacity duration-300">
                        <MousePointer2 className="rotate-180 text-blue-500 fill-blue-500 size-3 wiggle" />
                      </div>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="md:max-w-3xl!">
                    <DialogTitle className="sr-only">
                      workflow greeting
                    </DialogTitle>
                    <WorkflowGreeting />
                  </DialogContent>
                </Dialog>
              </div>
            ) : (
              <>
                {/* My Workflows */}
                {myWorkflows.map((workflow) => (
                  <DropdownMenuItem
                    key={workflow.id}
                    className="cursor-pointer"
                    onClick={() => onSelectWorkflow?.(workflow)}
                  >
                    {workflow.icon && workflow.icon.type === "emoji" ? (
                      <div
                        style={{
                          backgroundColor:
                            workflow.icon?.style?.backgroundColor,
                        }}
                        className="p-1 rounded flex items-center justify-center ring ring-background border"
                      >
                        <Avatar className="size-3">
                          <AvatarImage src={workflow.icon?.value} />
                          <AvatarFallback>
                            {workflow.name.slice(0, 1)}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    ) : null}
                    <span className="truncate min-w-0">{workflow.name}</span>
                  </DropdownMenuItem>
                ))}

                {myWorkflows.length > 0 && sharedWorkflows.length > 0 && (
                  <DropdownMenuSeparator />
                )}

                {/* Shared Workflows */}
                {sharedWorkflows.map((workflow) => (
                  <DropdownMenuItem
                    key={workflow.id}
                    className="cursor-pointer"
                    onClick={() => onSelectWorkflow?.(workflow)}
                  >
                    {workflow.icon && workflow.icon.type === "emoji" ? (
                      <div
                        style={{
                          backgroundColor:
                            workflow.icon?.style?.backgroundColor,
                        }}
                        className="p-1 rounded flex items-center justify-center ring ring-background border"
                      >
                        <Avatar className="size-3">
                          <AvatarImage src={workflow.icon?.value} />
                          <AvatarFallback>
                            {workflow.name.slice(0, 1)}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between flex-1 min-w-0">
                      <span className="truncate min-w-0">{workflow.name}</span>
                      {workflow.userName && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Avatar className="size-4 ml-2 shrink-0">
                              <AvatarImage src={workflow.userAvatar} />
                              <AvatarFallback className="text-xs text-muted-foreground font-medium">
                                {workflow.userName[0]?.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("Common.sharedBy", {
                              userName: workflow.userName,
                            })}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    </DropdownMenuGroup>
  );
}

function AppDefaultToolKitSelector() {
  const [appStoreMutate, allowedAppDefaultToolkit] = appStore(
    useShallow((state) => [state.mutate, state.allowedAppDefaultToolkit]),
  );
  const t = useTranslations();
  const toggleAppDefaultToolkit = useCallback((toolkit: AppDefaultToolkit) => {
    appStoreMutate((prev) => {
      const newAllowedAppDefaultToolkit = [
        ...(prev.allowedAppDefaultToolkit ?? []),
      ];
      if (newAllowedAppDefaultToolkit.includes(toolkit)) {
        newAllowedAppDefaultToolkit.splice(
          newAllowedAppDefaultToolkit.indexOf(toolkit),
          1,
        );
      } else {
        newAllowedAppDefaultToolkit.push(toolkit);
      }
      return { allowedAppDefaultToolkit: newAllowedAppDefaultToolkit };
    });
  }, []);

  const defaultToolInfo = useMemo(() => {
    const raw = t.raw("Chat.Tool.defaultToolKit");
    return Object.values(AppDefaultToolkit)
      .filter((toolkit) => toolkit !== AppDefaultToolkit.Memory)
      .map((toolkit) => {
        const label =
          raw[toolkit] ||
          (toolkit === AppDefaultToolkit.Canvas
            ? "Canvas"
            : toolkit === AppDefaultToolkit.Video
              ? "Video"
              : toolkit === AppDefaultToolkit.Artifacts
                ? "Artifacts"
                : toolkit === AppDefaultToolkit.Browser
                  ? "browser Agent"
                  : toolkit);
        const id = toolkit;
        let icon = Wrench;
        switch (toolkit) {
          case AppDefaultToolkit.Visualization:
            icon = ChartColumn;
            break;
          case AppDefaultToolkit.WebSearch:
            icon = GlobeIcon;
            break;
          case AppDefaultToolkit.Browser:
            icon = MousePointer2;
            break;
          case AppDefaultToolkit.Http:
            icon = HardDriveUploadIcon;
            break;
          case AppDefaultToolkit.Code:
            icon = CodeIcon;
            break;
          case AppDefaultToolkit.Video:
            icon = Clapperboard;
            break;
          case AppDefaultToolkit.Artifacts:
            icon = FileCode2;
            break;
          case AppDefaultToolkit.Canvas:
            icon = PresentationIcon;
            break;
        }
        return {
          label,
          id,
          icon,
        };
      });
  }, []);

  return (
    <DropdownMenuGroup>
      {defaultToolInfo.map((tool) => {
        return (
          <DropdownMenuItem
            key={tool.id}
            className={cn(
              "cursor-pointer font-semibold text-xs text-muted-foreground",
              allowedAppDefaultToolkit?.includes(tool.id) && "text-foreground",
            )}
            onClick={(e) => {
              e.preventDefault();
              toggleAppDefaultToolkit(tool.id);
            }}
          >
            <tool.icon
              className={cn(
                "size-3.5",
                allowedAppDefaultToolkit?.includes(tool.id) &&
                  "text-foreground",
              )}
            />
            {tool.label}
            <Switch
              className="ml-auto"
              checked={allowedAppDefaultToolkit?.includes(tool.id)}
            />
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuGroup>
  );
}

function AgentSelector({
  onSelectAgent,
}: {
  onSelectAgent?: (agent: AgentSummary) => void;
}) {
  const t = useTranslations();
  const { myAgents, bookmarkedAgents } = useAgents({
    filters: ["mine", "bookmarked"],
  });

  const emptyAgent = useMemo(() => {
    if (myAgents.length + bookmarkedAgents.length > 0) return null;
    return (
      <Link
        href={"/agent/new"}
        className="py-8 px-4 hover:bg-input/100 rounded-lg cursor-pointer flex justify-between items-center text-xs overflow-hidden"
      >
        <div className="gap-1 z-10">
          <div className="flex items-center mb-4 gap-1">
            <p className="font-semibold">{t("Layout.createAgent")}</p>
            <ArrowUpRightIcon className="size-3" />
          </div>
          <p className="text-muted-foreground">
            {bookmarkedAgents.length > 0
              ? t("Layout.createYourOwnAgentOrSelectShared")
              : t("Layout.createYourOwnAgent")}
          </p>
        </div>
      </Link>
    );
  }, [myAgents.length, bookmarkedAgents.length, t]);

  return (
    <DropdownMenuGroup>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="text-xs flex items-center gap-2 font-semibold cursor-pointer">
          <MessageCircle className="size-3.5" />
          {t("Agent.title")}
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="w-80 relative">
            {emptyAgent}

            {/* My Agents */}
            {myAgents.map((agent) => (
              <DropdownMenuItem
                key={agent.id}
                className="cursor-pointer"
                onClick={() => onSelectAgent?.(agent)}
              >
                {agent.icon && agent.icon.type === "emoji" ? (
                  <div
                    style={{
                      backgroundColor: agent.icon?.style?.backgroundColor,
                    }}
                    className="p-1 rounded flex items-center justify-center ring ring-background border"
                  >
                    <Avatar className="size-3">
                      <AvatarImage src={agent.icon?.value} />
                      <AvatarFallback>{agent.name.slice(0, 1)}</AvatarFallback>
                    </Avatar>
                  </div>
                ) : null}
                <span className="truncate min-w-0">{agent.name}</span>
              </DropdownMenuItem>
            ))}

            {myAgents.length > 0 && bookmarkedAgents.length > 0 && (
              <DropdownMenuSeparator />
            )}

            {bookmarkedAgents.map((agent) => (
              <DropdownMenuItem
                key={agent.id}
                className="cursor-pointer"
                onClick={() => onSelectAgent?.(agent)}
              >
                {agent.icon && agent.icon.type === "emoji" ? (
                  <div
                    style={{
                      backgroundColor: agent.icon?.style?.backgroundColor,
                    }}
                    className="p-1 rounded flex items-center justify-center ring ring-background border"
                  >
                    <Avatar className="size-3">
                      <AvatarImage src={agent.icon?.value} />
                      <AvatarFallback>{agent.name.slice(0, 1)}</AvatarFallback>
                    </Avatar>
                  </div>
                ) : null}
                <div className="flex items-center justify-between flex-1 min-w-0">
                  <span className="truncate min-w-0">{agent.name}</span>
                  {agent.userName && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Avatar className="size-4 ml-2 shrink-0">
                          <AvatarImage src={agent.userAvatar} />
                          <AvatarFallback className="text-xs text-muted-foreground font-medium">
                            {agent.userName[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t("Common.sharedBy", { userName: agent.userName })}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    </DropdownMenuGroup>
  );
}

function ImageGeneratorSelector({
  onGenerateImage,
  modelInfo,
}: {
  onGenerateImage?: (modelId?: string) => void;
  modelInfo?: { isToolCallUnsupported?: boolean };
}) {
  const t = useTranslations("Chat");

  return (
    <DropdownMenuGroup>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="text-xs flex items-center gap-2 font-semibold cursor-pointer">
          <ImagesIcon className="size-3.5" />
          {t("generateImage")}
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
            {IMAGE_GENERATION_MODELS.map((model) => (
              <DropdownMenuItem
                key={model.id}
                disabled={
                  IMAGE_TOOLS_SELECTION_DISABLED ||
                  modelInfo?.isToolCallUnsupported
                }
                onClick={() => onGenerateImage?.(model.id)}
                className={cn(
                  "cursor-pointer",
                  IMAGE_TOOLS_SELECTION_DISABLED &&
                    "cursor-not-allowed opacity-60",
                )}
              >
                <ImagesIcon className="mr-2 size-4 text-muted-foreground" />
                {model.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    </DropdownMenuGroup>
  );
}
