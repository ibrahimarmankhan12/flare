"use client";

import { appStore } from "@/app/store";
import { useChatModels } from "@/hooks/queries/use-chat-models";
import { ChatModel } from "app-types/chat";
import { cn } from "lib/utils";
import {
  AlertTriangleIcon,
  BrainIcon,
  CheckIcon,
  ChevronDown,
  ZapIcon,
} from "lucide-react";
import {
  Fragment,
  memo,
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "ui/button";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "ui/command";
import { ModelProviderIcon } from "ui/model-provider-icon";
import { Popover, PopoverContent, PopoverTrigger } from "ui/popover";
import { Switch } from "ui/switch";

// Fast model names for filtering
const FAST_MODEL_NAMES = new Set([
  "gemini 3 flash",
  "sonar",
  "deepseek/v3.2",
  "deepseek/v3.1",
  "nemotron/3.5-lightning",
  "deepseek/v4-flash",
  "nemotron/3-ultra",
  "hy3",
  "laguna/s-2.1",
  "mimo/v2.5",
]);

const isFastModel = (name: string) => {
  const lower = name.toLowerCase();
  return FAST_MODEL_NAMES.has(lower) || lower.includes("mistral");
};

// Blackbox cooldown duration in milliseconds
const BLACKBOX_COOLDOWN_MS = 5000;

interface SelectModelProps {
  onSelect: (model: ChatModel) => void;
  align?: "start" | "end";
  currentModel?: ChatModel;
  showProvider?: boolean;
  showModeToggle?: boolean;
  modelSpeed?: "fast" | "thinking";
  onModelSpeedChange?: (speed: "fast" | "thinking") => void;
  disabled?: boolean;
  filterModel?: (
    provider: string,
    model: {
      name: string;
      isToolCallUnsupported: boolean;
      isImageInputUnsupported: boolean;
      isBlackboxModel: boolean;
      supportedFileMimeTypes: string[];
    },
  ) => boolean;
}

export const SelectModel = (props: PropsWithChildren<SelectModelProps>) => {
  const [open, setOpen] = useState(false);
  const { data: providers } = useChatModels();
  const [model, setModel] = useState(props.currentModel);
  const [localSpeed, setLocalSpeed] = useState<"fast" | "thinking">(
    props.modelSpeed || "fast",
  );
  const [blackboxCooldown, setBlackboxCooldown] = useState(true);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start the 5-second blackbox cooldown on mount
  useEffect(() => {
    cooldownTimerRef.current = setTimeout(() => {
      setBlackboxCooldown(false);
    }, BLACKBOX_COOLDOWN_MS);

    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, []);

  // Sync with external speed state
  useEffect(() => {
    if (props.modelSpeed) {
      setLocalSpeed(props.modelSpeed);
    }
  }, [props.modelSpeed]);

  useEffect(() => {
    const modelToUse = props.currentModel ?? appStore.getState().chatModel;

    if (modelToUse) {
      setModel(modelToUse);
    }
  }, [props.currentModel]);

  const handleSpeedChange = (checked: boolean) => {
    const newSpeed = checked ? "thinking" : "fast";
    setLocalSpeed(newSpeed);
    props.onModelSpeedChange?.(newSpeed);
  };

  const handleSelect = useCallback(
    (provider: string, item: { name: string; isBlackboxModel: boolean }) => {
      if (item.isBlackboxModel && blackboxCooldown) return;
      setModel({ provider, model: item.name });
      props.onSelect({ provider, model: item.name });
      setOpen(false);
    },
    [blackboxCooldown, props],
  );

  const visibleProviders = useMemo(() => {
    if (!providers) return [];

    const grouped = structuredClone(providers);

    // Merge all flare-style providers ("flare", "Flare X") into a single
    // "flare" provider so every model shows as `subprovider/model`
    // (e.g. `openai/gpt-oss-120b`, `deepseek/v3.2`) under one entry.
    const flareIdx = grouped.findIndex(
      (p) => p.provider === "flare" || p.provider === "Flare X",
    );
    if (flareIdx !== -1) {
      const [flare] = grouped.splice(flareIdx, 1);
      for (let i = grouped.length - 1; i >= 0; i--) {
        if (grouped[i].provider === "flare" || grouped[i].provider === "Flare X") {
          const [other] = grouped.splice(i, 1);
          flare.models.push(...other.models);
        }
      }
      grouped.unshift(flare);
    }

    const order = (p: string) => {
      if (p === "flare") return 0;
      return 1;
    };
    return [...grouped]
      .sort((a, b) => order(a.provider) - order(b.provider))
      .map((provider) => {
        let models = props.filterModel
          ? provider.models.filter((model) =>
              props.filterModel?.(provider.provider, model),
            )
          : provider.models;

        // If showModeToggle is enabled, filter by speed mode
        if (props.showModeToggle) {
          models = models.filter((m) => {
            const isFast = isFastModel(m.name);
            return localSpeed === "fast" ? isFast : !isFast;
          });
        }

        if (!models.length) return null;
        return { ...provider, models };
      })
      .filter(
        (provider): provider is NonNullable<typeof provider> => !!provider,
      );
  }, [providers, props.filterModel, props.showModeToggle, localSpeed]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {props.children || (
          <Button
            variant={"secondary"}
            size={"sm"}
            className="data-[state=open]:bg-input! hover:bg-input! "
            data-testid="model-selector-button"
            disabled={props.disabled}
          >
            <div className="mr-auto flex items-center gap-1">
              {(props.showProvider ?? true) && (
                <ModelProviderIcon
                  provider={model?.provider || ""}
                  className="size-2.5 mr-1"
                />
              )}
              <p data-testid="selected-model-name">{model?.model || "model"}</p>
            </div>
            {!props.disabled && <ChevronDown className="size-3" />}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[280px]"
        align={props.align || "end"}
        data-testid="model-selector-popover"
      >
        <Command
          className="rounded-lg relative shadow-md"
          value={JSON.stringify(model)}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Fast/Thinking Toggle */}
          {props.showModeToggle && (
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <ZapIcon
                  className={cn(
                    "size-3.5 transition-colors",
                    localSpeed === "fast"
                      ? "text-yellow-500"
                      : "text-muted-foreground",
                  )}
                />
                <span
                  className={cn(
                    "text-sm font-medium transition-colors",
                    localSpeed === "fast"
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  Fast
                </span>
              </div>
              <Switch
                checked={localSpeed === "thinking"}
                onCheckedChange={handleSpeedChange}
                className="data-[state=checked]:bg-purple-500"
              />
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-sm font-medium transition-colors",
                    localSpeed === "thinking"
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  Thinking
                </span>
                <BrainIcon
                  className={cn(
                    "size-3.5 transition-colors",
                    localSpeed === "thinking"
                      ? "text-purple-500"
                      : "text-muted-foreground",
                  )}
                />
              </div>
            </div>
          )}

          <CommandInput
            placeholder="search model..."
            data-testid="model-search-input"
          />
          <CommandList className="p-2 max-h-64">
            <CommandEmpty>No results found.</CommandEmpty>
            {visibleProviders.map((provider, i) => (
              <Fragment key={provider.provider}>
                <CommandGroup
                  heading={
                    <ProviderHeader
                      provider={provider.provider}
                      hasAPIKey={provider.hasAPIKey}
                    />
                  }
                  className={cn(
                    "pb-4 group",
                    !provider.hasAPIKey && "opacity-50",
                  )}
                  onWheel={(e) => {
                    e.stopPropagation();
                  }}
                  data-testid={`model-provider-${provider.provider}`}
                >
                  {provider.models.map((item) => {
                    const isDisabled =
                      !provider.hasAPIKey ||
                      (item.isBlackboxModel && blackboxCooldown);

                    return (
                      <CommandItem
                        key={item.name}
                        disabled={isDisabled}
                        className={cn(
                          "cursor-pointer",
                          isDisabled && "opacity-50 cursor-not-allowed",
                        )}
                        onSelect={() => handleSelect(provider.provider, item)}
                        value={item.name}
                        data-testid={`model-option-${provider.provider}-${item.name}`}
                      >
                        {model?.provider === provider.provider &&
                        model?.model === item.name ? (
                          <CheckIcon
                            className="size-3"
                            data-testid="selected-model-check"
                          />
                        ) : (
                          <div className="ml-3" />
                        )}
                        <span className="pr-2">{item.name}</span>
                        {item.isBlackboxModel && blackboxCooldown ? (
                          <div className="ml-auto flex items-center gap-1 text-xs text-amber-500">
                            <AlertTriangleIcon className="size-3" />
                            Higher load
                          </div>
                        ) : item.isToolCallUnsupported ? (
                          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                            No tools
                          </div>
                        ) : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                {i < visibleProviders.length - 1 && <CommandSeparator />}
              </Fragment>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const ProviderHeader = memo(function ProviderHeader({
  provider,
  hasAPIKey,
}: { provider: string; hasAPIKey: boolean }) {
  // Human-friendly label for the picker. Provider ids stay lowercase for
  // routing / persistence (chat.provider, agent model refs, URL params).
  const displayName =
    provider === "flare"
      ? "Flare X"
      : provider === "Qwen"
        ? "Qwen"
        : provider === "Nvidia"
          ? "Nvidia NIM"
          : provider === "KonvO AI"
            ? "KonvO"
            : provider === "zAI"
              ? "Z.AI (GLM)"
              : provider;
  return (
    <div className="text-sm text-muted-foreground flex items-center gap-1.5 group-hover:text-foreground transition-colors duration-300">
      {provider === "openai" ? (
        <ModelProviderIcon
          provider="openai"
          className="size-3 text-foreground"
        />
      ) : (
        <ModelProviderIcon provider={provider} className="size-3" />
      )}
      <span className="font-semibold">{displayName}</span>
      {!hasAPIKey && (
        <>
          <span className="text-xs ml-auto text-muted-foreground">
            No API Key
          </span>
        </>
      )}
    </div>
  );
});
