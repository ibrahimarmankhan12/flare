"use client";

import { useCallback, useState } from "react";
import { Button } from "ui/button";
import { useTranslations } from "next-intl";
import {
  Infinity,
  ClipboardCheck,
  Code2,
  PenOff,
  Settings2,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";

import { cn } from "lib/utils";
import { appStore } from "@/app/store";
import { useShallow } from "zustand/shallow";
import {
  ToolSelectDropdownProps,
  ToolSetupMenuContent,
} from "./tool-select-dropdown";

export const ToolModeDropdown = ({
  disabled,
  onSelectWorkflow,
  onSelectAgent,
  onGenerateImage,
}: { disabled?: boolean } & ToolSelectDropdownProps) => {
  const t = useTranslations("Chat.Tool");
  const [open, setOpen] = useState(false);
  const [toolChoice, setToolChoice] = appStore(
    useShallow((s) => [s.toolChoice, s.mutate]),
  );

  const cycleMode = useCallback(() => {
    const cycle: Record<string, "auto" | "manual" | "none" | "codemode"> = {
      auto: "manual",
      manual: "none",
      none: "codemode",
      codemode: "auto",
    };
    setToolChoice({ toolChoice: cycle[toolChoice] });
  }, [toolChoice, setToolChoice]);

  const modeIcons: Record<string, React.ReactNode> = {
    auto: <Infinity className="size-3.5" />,
    manual: <ClipboardCheck className="size-3.5" />,
    none: <PenOff className="size-3.5" />,
    codemode: <Code2 className="size-3.5" />,
  };

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={"ghost"}
            size={"sm"}
            className="rounded-full p-2! hover:bg-input! flex items-center gap-1.5"
            onClick={cycleMode}
            disabled={disabled}
          >
            {modeIcons[toolChoice]}
            <span className="text-xs font-medium">
              {toolChoice === "codemode"
                ? t("codemode")
                : toolChoice.charAt(0).toUpperCase() + toolChoice.slice(1)}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("toolsSetup")}</TooltipContent>
      </Tooltip>

      <DropdownMenu open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild disabled={disabled}>
              <Button
                variant={"ghost"}
                size={"sm"}
                className={cn(
                  "rounded-full p-2! data-[state=open]:bg-input! hover:bg-input!",
                  open && "bg-input!",
                )}
              >
                <Settings2 />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("toolsSetup")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          align="start"
          side="top"
          className="p-0 w-[280px] max-h-[300px] overflow-y-auto scrollbar-slim"
        >
          <ToolSetupMenuContent
            onSelectWorkflow={onSelectWorkflow}
            onSelectAgent={onSelectAgent}
            onGenerateImage={onGenerateImage}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
