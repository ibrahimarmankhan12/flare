"use client";

import { UploadedFile, appStore } from "@/app/store";
import { UIMessage, UseChatHelpers } from "@ai-sdk/react";
import { ChatMention, ChatModel } from "app-types/chat";
import {
  AudioWaveformIcon,
  BrainIcon,
  Check,
  ChevronDown,
  ClapperboardIcon,
  CornerRightUp,
  CpuIcon,
  FileIcon,
  FileTextIcon,
  ImagesIcon,
  Loader2,
  PaperclipIcon,
  PencilIcon,
  PlusIcon,
  RatioIcon,
  Square,
  XIcon,
  ZapIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "ui/button";
import { useShallow } from "zustand/shallow";
import { SelectModel } from "./select-model";
import { ToolModeDropdown } from "./tool-mode-dropdown";

import { upsertThreadMessageAction } from "@/app/api/chat/actions";
import { useThreadFileUploader } from "@/hooks/use-thread-file-uploader";
import { cn, generateUUID } from "@/lib/utils";
import { Editor } from "@tiptap/react";
import { WorkflowSummary } from "app-types/workflow";
import { DefaultToolName, ImageToolName } from "lib/ai/tools";
import equal from "lib/equal";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "ui/avatar";
import { ClaudeIcon } from "ui/claude-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "ui/dropdown-menu";
import { GeminiIcon } from "ui/gemini-icon";
import { GrokIcon } from "ui/grok-icon";
import { MCPIcon } from "ui/mcp-icon";
import { OpenAIIcon } from "ui/openai-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "ui/tooltip";
import { ConnectorsPopover } from "./connectors-popover";
import { DefaultToolIcon } from "./default-tool-icon";

import { useChatModels } from "@/hooks/queries/use-chat-models";
import { isFilePartSupported, isIngestSupported } from "@/lib/ai/file-support";
import { FileUIPart, TextUIPart } from "ai";
import { AgentSummary } from "app-types/agent";
import {
  IMAGE_EDIT_MODELS,
  IMAGE_EDIT_MODEL_MAP,
} from "lib/ai/image/edit-models";
import {
  IMAGE_GENERATION_MODELS,
  IMAGE_GENERATION_MODEL_MAP,
  NANO_BANANA_SIZES,
} from "lib/ai/image/models";
import { EMOJI_DATA } from "lib/const";
import { toast } from "sonner";

// Size options for Nano Banana Pro model
const NANO_BANANA_PRO_SIZES = [
  { id: "1024x1024", name: "Square", label: "1024x1024" },
  { id: "1792x1024", name: "Landscape", label: "1792x1024" },
  { id: "1024x1792", name: "Portrait", label: "1024x1792" },
] as const;

const DEFAULT_NANO_BANANA_PRO_SIZE = "1792x1024";
const DEFAULT_NANO_BANANA_SIZE = "1024x1024";
const DEFAULT_IMAGE_EDIT_SIZE = "1024x1024";
// Image generation now runs through the Flare Bifrost gateway (image-proxy).
// Re-enabled after wiring flux / dall-e-3 / sdxl end-to-end.
const IMAGE_TOOLS_SELECTION_DISABLED = false;
const IMAGE_TOOLS_DISABLED_NOTICE =
  "Image tools are temporarily unavailable due to elevated errors.";
const FAST_MODEL_NAMES = [
  "Gemini 3 Flash",
  "Sonar",
  "deepseek/v3.2",
  "deepseek/v3.1",
  "nemotron/3.5-lightning",
  "deepseek/v4-flash",
  "nemotron/3-ultra",
  "hy3",
  "laguna/s-2.1",
  "mimo/v2.5",
];

const FAST_MODEL_NAME_SET = new Set(
  FAST_MODEL_NAMES.map((name) => name.toLowerCase()),
);

const isFastModelName = (name?: string) => {
  if (!name) return false;
  const lowerName = name.toLowerCase();
  if (FAST_MODEL_NAME_SET.has(lowerName)) {
    return true;
  }

  return lowerName.includes("mistral");
};

type ModelSpeed = "fast" | "thinking";

const MODEL_SPEED_LABELS: Record<ModelSpeed, string> = {
  fast: "Fast",
  thinking: "Thinking",
};

const MODEL_SPEED_DESCRIPTIONS: Record<ModelSpeed, string> = {
  fast: "Get quick answers to your problems.",
  thinking: "Solve complex questions with advanced reasoning.",
};

/**
 * Get a shorter display name for models on mobile
 * Examples:
 * - "Gemini 2.5 Flash Lite" → "2.5 Lite"
 * - "Gemini 2.5 Flash" → "2.5 Flash"
 * - "Claude Opus 4.5" → "Opus 4.5"
 * - "Claude Sonnet 4.5" → "Sonnet 4.5"
 * - "GPT 5.2 Pro" → "5.2 Pro"
 */
const getShortModelName = (modelName?: string): string => {
  if (!modelName) return "Model";

  // Remove common prefixes
  let short = modelName
    .replace(/^Gemini\s*/i, "")
    .replace(/^Claude\s*/i, "")
    .replace(/^GPT\s*/i, "")
    .replace(/^Qwen\s*/i, "Q")
    .replace(/^Llama\s*/i, "L")
    .replace(/^Mistral\s*/i, "M")
    .replace(/^Flare\s*/i, "")
    .replace(/Flash Lite/i, "Lite")
    .trim();

  // If still too long, truncate
  if (short.length > 12) {
    short = short.substring(0, 11) + "…";
  }

  return short || modelName;
};

type ProviderModelInfo = {
  name: string;
  isToolCallUnsupported: boolean;
  isImageInputUnsupported: boolean;
  isBlackboxModel: boolean;
  supportedFileMimeTypes: string[];
};

interface PromptInputProps {
  placeholder?: string;
  setInput: (value: string) => void;
  input: string;
  onStop: () => void;
  sendMessage: UseChatHelpers<UIMessage>["sendMessage"];
  setMessages?: UseChatHelpers<UIMessage>["setMessages"];
  toolDisabled?: boolean;
  isLoading?: boolean;
  model?: ChatModel;
  setModel?: (model: ChatModel) => void;
  voiceDisabled?: boolean;
  threadId?: string;
  disabledMention?: boolean;
  onFocus?: () => void;
}

const ChatMentionInput = dynamic(() => import("./chat-mention-input"), {
  ssr: false,
  loading() {
    return <div className="h-[2rem] w-full animate-pulse"></div>;
  },
});

export default function PromptInput({
  placeholder,
  sendMessage,
  setMessages,
  model,
  setModel,
  input,
  onFocus,
  setInput,
  onStop,
  isLoading,
  toolDisabled,
  voiceDisabled,
  threadId,
  disabledMention,
}: PromptInputProps) {
  const t = useTranslations("Chat");
  const [isUploadDropdownOpen, setIsUploadDropdownOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFiles } = useThreadFileUploader(threadId);
  const { data: providers } = useChatModels();

  const [
    globalModel,
    threadMentions,
    threadFiles,
    threadImageToolModel,
    threadImageToolSize,
    threadImageEditModel,
    threadImageEditSize,
    appStoreMutate,
  ] = appStore(
    useShallow((state) => [
      state.chatModel,
      state.threadMentions,
      state.threadFiles,
      state.threadImageToolModel,
      state.threadImageToolSize,
      state.threadImageEditModel,
      state.threadImageEditSize,
      state.mutate,
    ]),
  );

  const replyingTo = appStore((state) => state.replyingTo);

  const clearReplyingTo = useCallback(() => {
    appStoreMutate({ replyingTo: undefined });
  }, [appStoreMutate]);

  const modelInfo = useMemo(() => {
    const provider = providers?.find(
      (provider) => provider.provider === globalModel?.provider,
    );
    const model = provider?.models.find(
      (model) => model.name === globalModel?.model,
    );
    return model;
  }, [providers, globalModel]);

  const supportedFileMimeTypes = modelInfo?.supportedFileMimeTypes;

  const mentions = useMemo<ChatMention[]>(() => {
    if (!threadId) return [];
    return threadMentions[threadId!] ?? [];
  }, [threadMentions, threadId]);
  const isVideoGenerationEnabled = useMemo(
    () =>
      mentions.some(
        (mention) =>
          mention.type === "defaultTool" &&
          mention.name === DefaultToolName.VideoGeneration,
      ),
    [mentions],
  );

  const uploadedFiles = useMemo<UploadedFile[]>(() => {
    if (!threadId) return [];
    return threadFiles[threadId] ?? [];
  }, [threadFiles, threadId]);

  const imageToolModel = useMemo(() => {
    if (!threadId) return undefined;
    return threadImageToolModel[threadId];
  }, [threadImageToolModel, threadId]);

  const imageEditModel = useMemo(() => {
    if (!threadId) return undefined;
    return threadImageEditModel[threadId];
  }, [threadImageEditModel, threadId]);

  const imageToolSize = useMemo(() => {
    if (!threadId) return undefined;
    return threadImageToolSize[threadId];
  }, [threadImageToolSize, threadId]);

  const imageEditSize = useMemo(() => {
    if (!threadId) return undefined;
    return threadImageEditSize[threadId];
  }, [threadImageEditSize, threadId]);

  useEffect(() => {
    if (
      !IMAGE_TOOLS_SELECTION_DISABLED ||
      !threadId ||
      (!imageToolModel && !imageEditModel)
    ) {
      return;
    }

    appStoreMutate((prev) => ({
      threadImageToolModel: {
        ...prev.threadImageToolModel,
        [threadId]: undefined,
      },
      threadImageToolSize: {
        ...prev.threadImageToolSize,
        [threadId]: undefined,
      },
      threadImageEditModel: {
        ...prev.threadImageEditModel,
        [threadId]: undefined,
      },
      threadImageEditSize: {
        ...prev.threadImageEditSize,
        [threadId]: undefined,
      },
    }));
  }, [appStoreMutate, imageEditModel, imageToolModel, threadId]);

  const chatModel = useMemo(() => {
    return model ?? globalModel;
  }, [model, globalModel]);

  const [modelSpeed, setModelSpeed] = useState<ModelSpeed>(() =>
    chatModel && isFastModelName(chatModel.model) ? "fast" : "thinking",
  );
  // Tracks whether the user explicitly picked a speed. Until then the speed
  // badge follows the model instead of swapping the user's model away.
  const speedTouchedRef = useRef(false);

  const editorRef = useRef<Editor | null>(null);

  const findModelByPredicate = useCallback(
    (predicate: (modelName: string) => boolean) => {
      for (const provider of providers ?? []) {
        if (!provider.hasAPIKey) continue;
        const match = provider.models.find((m) => predicate(m.name));
        if (match) {
          return {
            provider: provider.provider,
            model: match.name,
          } satisfies ChatModel;
        }
      }
      return null;
    },
    [providers],
  );

  const setChatModel = useCallback(
    (model: ChatModel) => {
      if (setModel) {
        setModel(model);
      } else {
        appStoreMutate({ chatModel: model });
      }
    },
    [setModel, appStoreMutate],
  );

  useEffect(() => {
    if (!providers?.length || !chatModel) return;

    const isCurrentFast = isFastModelName(chatModel.model);

    if (!speedTouchedRef.current) {
      setModelSpeed(isCurrentFast ? "fast" : "thinking");
      return;
    }
    if (modelSpeed === "fast" && !isCurrentFast) {
      const fallback = findModelByPredicate(isFastModelName);
      if (fallback) {
        setChatModel(fallback);
      }
    } else if (modelSpeed === "thinking" && isCurrentFast) {
      const fallback = findModelByPredicate((name) => !isFastModelName(name));
      if (fallback) {
        setChatModel(fallback);
      }
    }
  }, [chatModel, findModelByPredicate, modelSpeed, providers, setChatModel]);

  const modelFilter = useCallback(
    (_provider: string, modelInfo: ProviderModelInfo) => {
      const isFast = isFastModelName(modelInfo.name);
      return modelSpeed === "fast" ? isFast : !isFast;
    },
    [modelSpeed],
  );

  const deleteMention = useCallback(
    (mention: ChatMention) => {
      if (!threadId) return;
      appStoreMutate((prev) => {
        const newMentions = mentions.filter((m) => !equal(m, mention));
        return {
          threadMentions: {
            ...prev.threadMentions,
            [threadId!]: newMentions,
          },
        };
      });
    },
    [mentions, threadId],
  );

  const deleteFile = useCallback(
    (fileId: string) => {
      if (!threadId) return;

      // Find file and abort if uploading
      const file = uploadedFiles.find((f) => f.id === fileId);
      if (file?.isUploading && file.abortController) {
        file.abortController.abort();
      }

      // Cleanup preview URL if exists
      if (file?.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }

      appStoreMutate((prev) => {
        const newFiles = uploadedFiles.filter((f) => f.id !== fileId);
        return {
          threadFiles: {
            ...prev.threadFiles,
            [threadId]: newFiles,
          },
        };
      });
    },
    [uploadedFiles, threadId, appStoreMutate],
  );

  // uploadFiles handled by hook

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      if (!list) return;
      await uploadFiles(Array.from(list));
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsUploadDropdownOpen(false);
    },
    [uploadFiles],
  );

  const handleGenerateImage = useCallback(
    (modelId?: string) => {
      // If no modelId provided, disable/clear the image tool
      if (!modelId) {
        appStoreMutate((prev) => ({
          threadImageToolModel: threadId
            ? { ...prev.threadImageToolModel, [threadId]: undefined }
            : {},
          threadImageToolSize: threadId
            ? { ...prev.threadImageToolSize, [threadId]: undefined }
            : {},
        }));
        return;
      }
      if (!threadId) return;
      if (IMAGE_TOOLS_SELECTION_DISABLED) {
        toast.error(IMAGE_TOOLS_DISABLED_NOTICE);
        return;
      }

      setIsUploadDropdownOpen(false);

      appStoreMutate((prev) => ({
        threadImageToolSize: {
          ...prev.threadImageToolSize,
          [threadId]:
            modelId === "nbpro"
              ? prev.threadImageToolSize[threadId] ||
                DEFAULT_NANO_BANANA_PRO_SIZE
              : modelId === "nano-banana"
                ? prev.threadImageToolSize[threadId] || DEFAULT_NANO_BANANA_SIZE
                : undefined,
        },
        threadImageToolModel: {
          ...prev.threadImageToolModel,
          [threadId]: modelId,
        },
        // Clear edit model when switching to generate
        threadImageEditModel: {
          ...prev.threadImageEditModel,
          [threadId]: undefined,
        },
        threadImageEditSize: {
          ...prev.threadImageEditSize,
          [threadId]: undefined,
        },
      }));

      // Focus on the input
      editorRef.current?.commands.focus();
    },
    [threadId, editorRef, appStoreMutate],
  );

  const handleEditImage = useCallback(
    (modelId?: string) => {
      // If no modelId provided, disable/clear the edit tool
      if (!modelId) {
        appStoreMutate((prev) => ({
          threadImageEditModel: threadId
            ? { ...prev.threadImageEditModel, [threadId]: undefined }
            : {},
          threadImageEditSize: threadId
            ? { ...prev.threadImageEditSize, [threadId]: undefined }
            : {},
        }));
        return;
      }
      if (!threadId) return;
      if (IMAGE_TOOLS_SELECTION_DISABLED) {
        toast.error(IMAGE_TOOLS_DISABLED_NOTICE);
        return;
      }

      setIsUploadDropdownOpen(false);

      appStoreMutate((prev) => ({
        threadImageEditModel: {
          ...prev.threadImageEditModel,
          [threadId]: modelId,
        },
        threadImageEditSize: {
          ...prev.threadImageEditSize,
          [threadId]:
            prev.threadImageEditSize[threadId] || DEFAULT_IMAGE_EDIT_SIZE,
        },
        // Clear generate model when switching to edit
        threadImageToolModel: {
          ...prev.threadImageToolModel,
          [threadId]: undefined,
        },
      }));

      // Open file picker for image to edit
      fileInputRef.current?.click();

      // Focus on the input
      editorRef.current?.commands.focus();
    },
    [threadId, editorRef, appStoreMutate],
  );

  const handleImageSizeChange = useCallback(
    (size: string) => {
      if (!threadId) return;
      appStoreMutate((prev) => ({
        threadImageToolSize: {
          ...prev.threadImageToolSize,
          [threadId]: size,
        },
      }));
    },
    [threadId, appStoreMutate],
  );

  const handleImageEditSizeChange = useCallback(
    (size: string) => {
      if (!threadId) return;
      appStoreMutate((prev) => ({
        threadImageEditSize: {
          ...prev.threadImageEditSize,
          [threadId]: size,
        },
      }));
    },
    [threadId, appStoreMutate],
  );

  const handleGenerateVideo = useCallback(() => {
    if (!threadId) return;

    setIsUploadDropdownOpen(false);

    appStoreMutate((prev) => {
      const currentMentions = prev.threadMentions[threadId] ?? [];
      const hasVideoMention = currentMentions.some(
        (mention) =>
          mention.type === "defaultTool" &&
          mention.name === DefaultToolName.VideoGeneration,
      );
      const nextMentions = currentMentions.filter(
        (mention) =>
          !(
            mention.type === "defaultTool" &&
            mention.name === DefaultToolName.VideoGeneration
          ),
      );

      return {
        threadMentions: {
          ...prev.threadMentions,
          [threadId]: hasVideoMention
            ? nextMentions
            : [
                ...nextMentions,
                {
                  type: "defaultTool",
                  name: DefaultToolName.VideoGeneration,
                  label: "Generate Video",
                  description: "Generate a video from a text prompt",
                },
              ],
        },
        // Video generation runs via app default tools. Disable image-only modes.
        threadImageToolModel: {
          ...prev.threadImageToolModel,
          [threadId]: undefined,
        },
        threadImageToolSize: {
          ...prev.threadImageToolSize,
          [threadId]: undefined,
        },
        threadImageEditModel: {
          ...prev.threadImageEditModel,
          [threadId]: undefined,
        },
        threadImageEditSize: {
          ...prev.threadImageEditSize,
          [threadId]: undefined,
        },
      };
    });

    editorRef.current?.commands.focus();
  }, [threadId, appStoreMutate]);

  const addMention = useCallback(
    (mention: ChatMention) => {
      if (!threadId) return;
      appStoreMutate((prev) => {
        if (mentions.some((m) => equal(m, mention))) return prev;

        const newMentions =
          mention.type == "agent"
            ? [...mentions.filter((m) => m.type !== "agent"), mention]
            : [...mentions, mention];

        return {
          threadMentions: {
            ...prev.threadMentions,
            [threadId!]: newMentions,
          },
        };
      });
    },
    [mentions, threadId],
  );

  const onSelectWorkflow = useCallback(
    (workflow: WorkflowSummary) => {
      addMention({
        type: "workflow",
        name: workflow.name,
        icon: workflow.icon,
        workflowId: workflow.id,
        description: workflow.description,
      });
    },
    [addMention],
  );

  const onSelectAgent = useCallback(
    (agent: AgentSummary) => {
      appStoreMutate((prev) => {
        return {
          threadMentions: {
            ...prev.threadMentions,
            [threadId!]: [
              {
                type: "agent",
                name: agent.name,
                icon: agent.icon,
                description: agent.description,
                agentId: agent.id,
              },
            ],
          },
        };
      });
    },
    [mentions, threadId],
  );

  const onChangeMention = useCallback(
    (mentions: ChatMention[]) => {
      let hasAgent = false;
      [...mentions]
        .reverse()
        .filter((m) => {
          if (m.type == "agent") {
            if (hasAgent) return false;
            hasAgent = true;
          }

          return true;
        })
        .reverse()
        .forEach(addMention);
    },
    [addMention],
  );

  const [isEditingImage, setIsEditingImage] = useState(false);

  const submit = async () => {
    if (isLoading || isEditingImage) return;
    if (uploadedFiles.some((file) => file.isUploading)) {
      toast.error("Please wait for files to finish uploading before sending.");
      return;
    }
    const userMessage = input?.trim() || "";

    // Allow sending with just images (no text required)
    const hasFiles = uploadedFiles.length > 0;
    if (userMessage.length === 0 && !hasFiles) return;

    // Handle image editing mode
    if (imageEditModel && hasFiles) {
      if (IMAGE_TOOLS_SELECTION_DISABLED) {
        toast.error(IMAGE_TOOLS_DISABLED_NOTICE);
        handleEditImage();
        return;
      }

      const imageFile = uploadedFiles.find((f) =>
        f.mimeType.startsWith("image/"),
      );
      if (!imageFile) {
        toast.error("Please upload an image to edit.");
        return;
      }

      if (!userMessage) {
        toast.error("Please provide instructions for how to edit the image.");
        return;
      }

      setIsEditingImage(true);
      setInput("");
      const editToolCallId = generateUUID();
      const editStatusMessageId = generateUUID();
      const loadingPartType = `tool-${ImageToolName}`;
      const editToolInput = {
        prompt: userMessage,
        mode: "edit" as const,
      };

      try {
        // Get image as base64
        let imageBase64 = "";
        if (imageFile.dataUrl) {
          // Extract base64 from data URL
          imageBase64 = imageFile.dataUrl.split(",")[1] || "";
        } else if (imageFile.url) {
          // Fetch and convert to base64
          const response = await fetch(imageFile.url);
          const blob = await response.blob();
          imageBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(result.split(",")[1] || "");
            };
            reader.readAsDataURL(blob);
          });
        }

        if (!imageBase64) {
          throw new Error("Could not read image data");
        }

        const editUserMessageId = generateUUID();
        const editUserMessageParts = [
          {
            type: "file",
            url: imageFile.url || imageFile.dataUrl || "",
            mediaType: imageFile.mimeType,
            filename: imageFile.name,
          } as FileUIPart,
          { type: "text", text: `Edit image: ${userMessage}` } as TextUIPart,
        ];

        // Add image-edit prompt to chat history without triggering /api/chat.
        if (setMessages) {
          setMessages((prev) => [
            ...prev,
            {
              id: editUserMessageId,
              role: "user",
              parts: editUserMessageParts,
            },
          ]);
        } else {
          throw new Error("Chat is not ready. Please refresh and try again.");
        }

        // Persist user edit request so it remains in chat history after reload.
        if (threadId) {
          try {
            await upsertThreadMessageAction({
              threadId,
              message: {
                id: editUserMessageId,
                role: "user",
                parts: editUserMessageParts,
              },
            });
          } catch (persistError) {
            console.error(
              "Failed to persist image edit user message to thread history",
              persistError,
            );
          }
        }

        // Clear uploaded preview immediately after sending user message.
        appStoreMutate((prev) => ({
          threadFiles: {
            ...prev.threadFiles,
            [threadId!]: [],
          },
        }));

        // Show same in-chat animation as image generation during edit.
        setMessages?.((prev) => [
          ...prev,
          {
            id: editStatusMessageId,
            role: "assistant",
            parts: [
              {
                type: loadingPartType,
                toolCallId: editToolCallId,
                state: "input-streaming",
                input: editToolInput,
              } as any,
            ],
          },
        ]);

        // Call the edit API
        const editResponse = await fetch("/api/images/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64,
            imageMimeType: imageFile.mimeType,
            prompt: userMessage,
            model: imageEditModel,
            size: imageEditSize || DEFAULT_IMAGE_EDIT_SIZE,
          }),
        });

        if (!editResponse.ok) {
          const error = await editResponse.json();
          throw new Error(error.error || "Failed to edit image");
        }

        const editResult = await editResponse.json();

        // Clear edit mode
        appStoreMutate((prev) => ({
          threadImageEditModel: {
            ...prev.threadImageEditModel,
            [threadId!]: undefined,
          },
        }));

        if (!editResult.images || editResult.images.length === 0) {
          throw new Error("No edited images were returned");
        }

        const successPart = {
          type: loadingPartType,
          toolCallId: editToolCallId,
          state: "output-available",
          input: editToolInput,
          output: {
            images: editResult.images,
            mode: "edit",
            model: editResult.model || imageEditModel,
          },
        } as any;

        // Show the edited image as assistant response
        if (setMessages) {
          setMessages((prev) => {
            let found = false;

            const next = prev.map((message) => {
              const hasTargetPart = message.parts.some(
                (part: any) =>
                  part?.type === loadingPartType &&
                  part?.toolCallId === editToolCallId,
              );
              if (!hasTargetPart) return message;
              found = true;

              return {
                ...message,
                parts: message.parts.map((part: any) => {
                  if (
                    part?.type !== loadingPartType ||
                    part?.toolCallId !== editToolCallId
                  ) {
                    return part;
                  }

                  return successPart;
                }),
              };
            });

            if (found) return next;

            return [
              ...next,
              {
                id: editStatusMessageId,
                role: "assistant",
                parts: [successPart],
              },
            ];
          });
        } else {
          sendMessage({
            role: "assistant",
            parts: [
              ...editResult.images.map(
                (img: { url: string; mimeType?: string }) =>
                  ({
                    type: "file",
                    url: img.url,
                    mediaType: img.mimeType || "image/png",
                    filename: "edited-image.png",
                  }) as FileUIPart,
              ),
            ],
          });
        }

        // Persist edited image message so it remains in chat history after reload.
        if (threadId) {
          try {
            await upsertThreadMessageAction({
              threadId,
              message: {
                id: editStatusMessageId,
                role: "assistant",
                parts: [successPart],
              },
            });
          } catch (persistError) {
            console.error(
              "Failed to persist edited image message to thread history",
              persistError,
            );
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Image edit failed";

        const errorPart = {
          type: loadingPartType,
          toolCallId: editToolCallId,
          state: "output-error",
          input: editToolInput,
          errorText: message,
        } as any;

        setMessages?.((prev) => {
          let found = false;

          const next = prev.map((chatMessage) => {
            const hasTargetPart = chatMessage.parts.some(
              (part: any) =>
                part?.type === loadingPartType &&
                part?.toolCallId === editToolCallId,
            );
            if (!hasTargetPart) return chatMessage;
            found = true;

            return {
              ...chatMessage,
              parts: chatMessage.parts.map((part: any) => {
                if (
                  part?.type !== loadingPartType ||
                  part?.toolCallId !== editToolCallId
                ) {
                  return part;
                }
                return errorPart;
              }),
            };
          });

          if (found) return next;

          return [
            ...next,
            {
              id: editStatusMessageId,
              role: "assistant",
              parts: [errorPart],
            },
          ];
        });
        toast.error(message);
      } finally {
        setIsEditingImage(false);
      }
      return;
    }

    setInput("");
    const attachmentParts = uploadedFiles.reduce<
      Array<FileUIPart | TextUIPart | any>
    >((acc, file) => {
      const isFileSupported = isFilePartSupported(
        file.mimeType,
        supportedFileMimeTypes,
      );
      const link = file.url || file.dataUrl || "";
      if (!link) return acc;
      if (isFileSupported) {
        acc.push({
          type: "file",
          url: link,
          mediaType: file.mimeType,
          filename: file.name,
        } as FileUIPart);
      } else {
        // Use a rich UI part for unsupported file types; will be filtered out for model input
        acc.push({
          type: "source-url",
          url: link,
          title: file.name,
          mediaType: file.mimeType,
        } as any);
      }
      return acc;
    }, []);

    if (attachmentParts.length) {
      const summary = uploadedFiles
        .map((file, index) => {
          const type = file.mimeType || "unknown";
          return `${index + 1}. ${file.name} (${type})`;
        })
        .join("\n");

      attachmentParts.unshift({
        type: "text",
        text: `Attached files:\n${summary}`,
        ingestionPreview: true,
      });
    }

    // Build final parts - include text only if there's text to send
    const messageParts: Array<
      { type: "text"; text: string; isReplyQuote?: boolean } | any
    > = [...attachmentParts];

    // Add the quoted reply context as a separate part if present
    if (replyingTo?.text) {
      const quotedText =
        replyingTo.text.length > 200
          ? replyingTo.text.substring(0, 200) + "..."
          : replyingTo.text;
      messageParts.push({
        type: "text",
        text: `[REPLY_QUOTE]${quotedText}[/REPLY_QUOTE]`,
      });
    }

    // Add the user's actual message
    if (userMessage.length > 0) {
      messageParts.push({ type: "text", text: userMessage });
    } else if (
      messageParts.length === 0 ||
      (messageParts.length === 1 && replyingTo?.text)
    ) {
      // If only attachments or quote, add a default message
      if (attachmentParts.length > 0) {
        messageParts.push({
          type: "text",
          text: "Please analyze these attachments.",
        });
      }
    }

    const finalParts =
      messageParts.length > 0
        ? messageParts
        : [{ type: "text", text: userMessage }];

    sendMessage({
      role: "user",
      parts: finalParts,
    });

    // Clear replyingTo context after sending
    if (replyingTo) {
      clearReplyingTo();
    }

    appStoreMutate((prev) => ({
      threadFiles: {
        ...prev.threadFiles,
        [threadId!]: [],
      },
    }));
  };

  // Handle ESC key to clear mentions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        threadId &&
        (mentions.length > 0 || imageToolModel || imageEditModel)
      ) {
        e.preventDefault();
        e.stopPropagation();
        appStoreMutate(() => ({
          threadMentions: {},
          agentId: undefined,
          threadImageToolModel: {},
          threadImageToolSize: {},
          threadImageEditModel: {},
          threadImageEditSize: {},
        }));
        editorRef.current?.commands.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    mentions.length,
    threadId,
    appStoreMutate,
    imageToolModel,
    imageEditModel,
  ]);

  // Handle paste for images and files from clipboard
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!threadId) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const filesToUpload: File[] = [];

      for (const item of Array.from(items)) {
        // Handle image paste
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            // Generate a friendly name for pasted images
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const extension = file.type.split("/")[1] || "png";
            const namedFile = new File(
              [file],
              `pasted-image-${timestamp}.${extension}`,
              { type: file.type },
            );
            filesToUpload.push(namedFile);
          }
        }
        // Handle file paste (some browsers support this)
        else if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            filesToUpload.push(file);
          }
        }
      }

      if (filesToUpload.length > 0) {
        e.preventDefault();
        await uploadFiles(filesToUpload);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [threadId, uploadFiles]);

  // Drag overlay handled globally in ChatBot

  return (
    <div className="md:max-w-3xl md:mx-auto w-full fade-in animate-in">
      <div className="z-10 md:mx-auto w-full md:max-w-3xl relative">
        <fieldset className="flex w-full min-w-0 max-w-full flex-col md:px-4 px-0">
          <div className="shadow-lg overflow-hidden md:rounded-4xl rounded-t-3xl rounded-b-none backdrop-blur-sm transition-all duration-200 bg-muted/60 relative flex w-full flex-col cursor-text z-10 items-stretch focus-within:bg-muted hover:bg-muted focus-within:ring-muted hover:ring-muted">
            {/* Replying to context tag */}
            {replyingTo?.text && (
              <div className="flex items-center gap-2 px-4 pt-3 animate-in fade-in slide-in-from-top-2 duration-200">
                <CornerRightUp className="size-4 text-muted-foreground flex-shrink-0 rotate-90" />
                <div className="flex items-center gap-1.5 bg-muted-foreground/20 hover:bg-muted-foreground/30 transition-colors rounded px-2.5 py-1 max-w-[300px] group cursor-default">
                  <span className="text-sm text-foreground truncate">
                    {replyingTo.text.length > 50
                      ? replyingTo.text.substring(0, 50) + "..."
                      : replyingTo.text}
                  </span>
                  <button
                    onClick={clearReplyingTo}
                    className="text-muted-foreground hover:text-foreground transition-colors opacity-60 group-hover:opacity-100 ml-1 flex-shrink-0"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              </div>
            )}
            {mentions.length > 0 && (
              <div className="bg-input rounded-b-sm rounded-t-3xl p-3 flex flex-col gap-4 mx-2 my-2">
                {mentions.map((mention, i) => {
                  return (
                    <div key={i} className="flex items-center gap-2">
                      {mention.type === "workflow" ||
                      mention.type === "agent" ? (
                        <Avatar
                          className="size-6 p-1 ring ring-border rounded-full flex-shrink-0"
                          style={mention.icon?.style}
                        >
                          <AvatarImage
                            src={
                              mention.icon?.value ||
                              EMOJI_DATA[i % EMOJI_DATA.length]
                            }
                          />
                          <AvatarFallback>
                            {mention.name.slice(0, 1)}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <Button className="size-6 flex items-center justify-center ring ring-border rounded-full flex-shrink-0 p-0.5">
                          {mention.type == "mcpServer" ? (
                            <MCPIcon className="size-3.5" />
                          ) : (
                            <DefaultToolIcon
                              name={mention.name as DefaultToolName}
                              className="size-3.5"
                            />
                          )}
                        </Button>
                      )}

                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm font-semibold truncate">
                          {mention.name}
                        </span>
                        {mention.description ? (
                          <span className="text-muted-foreground text-xs truncate">
                            {mention.description}
                          </span>
                        ) : null}
                      </div>
                      <Button
                        variant={"ghost"}
                        size={"icon"}
                        disabled={!threadId}
                        className="rounded-full hover:bg-input! flex-shrink-0"
                        onClick={() => {
                          deleteMention(mention);
                        }}
                      >
                        <XIcon />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex flex-col gap-3.5 px-5 pt-3 pb-5">
              <div className="relative min-h-[2rem]">
                <ChatMentionInput
                  input={input}
                  onChange={setInput}
                  onChangeMention={onChangeMention}
                  onEnter={submit}
                  placeholder={placeholder ?? t("placeholder")}
                  ref={editorRef}
                  disabledMention={disabledMention}
                  onFocus={onFocus}
                />
              </div>
              <div className="flex w-full items-center z-30 gap-0.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.tar,.gz,.mp3,.wav,.m4a,.ogg,.mp4,.webm,.mov"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={!threadId}
                />

                <DropdownMenu
                  open={isUploadDropdownOpen}
                  onOpenChange={setIsUploadDropdownOpen}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant={"ghost"}
                      size={"sm"}
                      className="rounded-full hover:bg-input! p-2! data-[state=open]:bg-input!"
                      disabled={!threadId}
                    >
                      <PlusIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top">
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <PaperclipIcon className="mr-2 size-4" />
                      {t("uploadImage")}
                    </DropdownMenuItem>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="cursor-pointer">
                        <ImagesIcon className="mr-4 size-4 text-muted-foreground" />
                        <span className="mr-4">{t("generateImage")}</span>
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
                              onClick={() => handleGenerateImage(model.id)}
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

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="cursor-pointer">
                        <PencilIcon className="mr-4 size-4 text-muted-foreground" />
                        <span className="mr-4">{t("editImage")}</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                          {IMAGE_EDIT_MODELS.map((model) => (
                            <DropdownMenuItem
                              key={model.id}
                              disabled={
                                IMAGE_TOOLS_SELECTION_DISABLED ||
                                modelInfo?.isToolCallUnsupported
                              }
                              onClick={() => handleEditImage(model.id)}
                              className={cn(
                                "cursor-pointer",
                                IMAGE_TOOLS_SELECTION_DISABLED &&
                                  "cursor-not-allowed opacity-60",
                              )}
                            >
                              <PencilIcon className="mr-2 size-4 text-muted-foreground" />
                              {model.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>

                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={modelInfo?.isToolCallUnsupported}
                      onClick={handleGenerateVideo}
                    >
                      <ClapperboardIcon className="mr-2 size-4 text-muted-foreground" />
                      Generate Video
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {!toolDisabled &&
                  (imageToolModel ? (
                    <Button
                      variant={"ghost"}
                      size={"sm"}
                      className="rounded-full hover:bg-input! p-2! group/image-generator text-primary"
                      onClick={() => handleGenerateImage()}
                    >
                      <ImagesIcon className="size-3.5" />
                      {t("generateImage")}
                      <XIcon className="size-3 group-hover/image-generator:opacity-100 opacity-0 transition-opacity duration-200" />
                    </Button>
                  ) : imageEditModel ? (
                    <Button
                      variant={"ghost"}
                      size={"sm"}
                      className="rounded-full hover:bg-input! p-2! group/image-editor text-primary"
                      onClick={() => handleEditImage()}
                    >
                      <PencilIcon className="size-3.5" />
                      {t("editImage")}
                      <XIcon className="size-3 group-hover/image-editor:opacity-100 opacity-0 transition-opacity duration-200" />
                    </Button>
                  ) : isVideoGenerationEnabled ? (
                    <Button
                      variant={"ghost"}
                      size={"sm"}
                      className="rounded-full hover:bg-input! p-2! group/video-generator text-primary"
                      onClick={handleGenerateVideo}
                    >
                      <ClapperboardIcon className="size-3.5" />
                      Generate Video
                      <XIcon className="size-3 group-hover/video-generator:opacity-100 opacity-0 transition-opacity duration-200" />
                    </Button>
                  ) : (
                    <>
                      <ToolModeDropdown
                        onSelectWorkflow={onSelectWorkflow}
                        onSelectAgent={onSelectAgent}
                        onGenerateImage={
                          IMAGE_TOOLS_SELECTION_DISABLED
                            ? undefined
                            : handleGenerateImage
                        }
                        mentions={mentions}
                      />
                    </>
                  ))}

                {/* Connectors Button */}
                <ConnectorsPopover disabled={!threadId} />

                <div className="flex-1" />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant={"ghost"}
                      size={"sm"}
                      className="rounded-full group data-[state=open]:bg-input! hover:bg-input! mr-1 flex md:hidden"
                    >
                      <span className="mr-2">
                        {MODEL_SPEED_LABELS[modelSpeed]}
                      </span>
                      <ChevronDown className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(["fast", "thinking"] as ModelSpeed[]).map((speed) => (
                      <DropdownMenuItem
                        key={speed}
                        className="cursor-pointer"
                        onClick={() => {
                          speedTouchedRef.current = true;
                          setModelSpeed(speed);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          {modelSpeed === speed ? (
                            <Check className="size-3" />
                          ) : (
                            <span className="w-3" />
                          )}
                          <div className="flex flex-col">
                            <span>{MODEL_SPEED_LABELS[speed]}</span>
                            <span className="text-xs text-muted-foreground">
                              {MODEL_SPEED_DESCRIPTIONS[speed]}
                            </span>
                          </div>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {imageToolModel ? (
                  <>
                    {/* Image Generation Model Selector */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant={"ghost"}
                          size={"sm"}
                          className="rounded-full group data-[state=open]:bg-input! hover:bg-input! mr-1"
                          data-testid="image-model-selector-button"
                        >
                          <ImagesIcon className="size-3 mr-1 text-primary" />
                          <span
                            className="text-foreground"
                            data-testid="selected-image-model-name"
                          >
                            {IMAGE_GENERATION_MODEL_MAP[imageToolModel]?.name ||
                              imageToolModel}
                          </span>
                          <ChevronDown className="size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="max-h-80 overflow-y-auto"
                      >
                        {IMAGE_GENERATION_MODELS.map((model) => (
                          <DropdownMenuItem
                            key={model.id}
                            disabled={IMAGE_TOOLS_SELECTION_DISABLED}
                            className={cn(
                              "cursor-pointer",
                              IMAGE_TOOLS_SELECTION_DISABLED &&
                                "cursor-not-allowed opacity-60",
                            )}
                            onClick={() => handleGenerateImage(model.id)}
                          >
                            <div className="flex items-center gap-2">
                              {imageToolModel === model.id ? (
                                <Check className="size-3" />
                              ) : (
                                <span className="w-3" />
                              )}
                              <ImagesIcon className="size-4 text-muted-foreground" />
                              <span>{model.name}</span>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Size selector for Nano Banana models and Nano Banana Pro */}
                    {(imageToolModel === "nbpro" ||
                      imageToolModel === "nano-banana") && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant={"ghost"}
                            size={"sm"}
                            className="rounded-full group data-[state=open]:bg-input! hover:bg-input! mr-1"
                            data-testid="image-size-selector-button"
                          >
                            <RatioIcon className="size-3 mr-1 text-primary" />
                            <span
                              className="text-foreground"
                              data-testid="selected-image-size-name"
                            >
                              {imageToolModel === "nano-banana"
                                ? NANO_BANANA_SIZES.find(
                                    (s) =>
                                      s.value ===
                                      (imageToolSize ||
                                        DEFAULT_NANO_BANANA_SIZE),
                                  )?.name || "Square"
                                : NANO_BANANA_PRO_SIZES.find(
                                    (s) =>
                                      s.id ===
                                      (imageToolSize ||
                                        DEFAULT_NANO_BANANA_PRO_SIZE),
                                  )?.name || "Landscape"}
                            </span>
                            <ChevronDown className="size-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {imageToolModel === "nano-banana"
                            ? NANO_BANANA_SIZES.map((size) => (
                                <DropdownMenuItem
                                  key={size.id}
                                  className="cursor-pointer"
                                  onClick={() =>
                                    handleImageSizeChange(size.value)
                                  }
                                >
                                  <div className="flex items-center gap-2">
                                    {(imageToolSize ||
                                      DEFAULT_NANO_BANANA_SIZE) ===
                                    size.value ? (
                                      <Check className="size-3" />
                                    ) : (
                                      <span className="w-3" />
                                    )}
                                    <RatioIcon className="size-4 text-muted-foreground" />
                                    <span>{size.name}</span>
                                    <span className="text-xs text-muted-foreground ml-1">
                                      ({size.value})
                                    </span>
                                  </div>
                                </DropdownMenuItem>
                              ))
                            : NANO_BANANA_PRO_SIZES.map((size) => (
                                <DropdownMenuItem
                                  key={size.id}
                                  className="cursor-pointer"
                                  onClick={() => handleImageSizeChange(size.id)}
                                >
                                  <div className="flex items-center gap-2">
                                    {(imageToolSize ||
                                      DEFAULT_NANO_BANANA_PRO_SIZE) ===
                                    size.id ? (
                                      <Check className="size-3" />
                                    ) : (
                                      <span className="w-3" />
                                    )}
                                    <RatioIcon className="size-4 text-muted-foreground" />
                                    <span>{size.name}</span>
                                    <span className="text-xs text-muted-foreground ml-1">
                                      ({size.label})
                                    </span>
                                  </div>
                                </DropdownMenuItem>
                              ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </>
                ) : imageEditModel ? (
                  <>
                    {/* Image Edit Model Selector */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant={"ghost"}
                          size={"sm"}
                          className="rounded-full group data-[state=open]:bg-input! hover:bg-input! mr-1"
                          data-testid="image-edit-model-selector-button"
                        >
                          <PencilIcon className="size-3 mr-1 text-primary" />
                          <span
                            className="text-foreground"
                            data-testid="selected-image-edit-model-name"
                          >
                            {IMAGE_EDIT_MODEL_MAP[imageEditModel]?.name ||
                              imageEditModel}
                          </span>
                          <ChevronDown className="size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="max-h-80 overflow-y-auto"
                      >
                        {IMAGE_EDIT_MODELS.map((model) => (
                          <DropdownMenuItem
                            key={model.id}
                            disabled={IMAGE_TOOLS_SELECTION_DISABLED}
                            className={cn(
                              "cursor-pointer",
                              IMAGE_TOOLS_SELECTION_DISABLED &&
                                "cursor-not-allowed opacity-60",
                            )}
                            onClick={() => handleEditImage(model.id)}
                          >
                            <div className="flex items-center gap-2">
                              {imageEditModel === model.id ? (
                                <Check className="size-3" />
                              ) : (
                                <span className="w-3" />
                              )}
                              <PencilIcon className="size-4 text-muted-foreground" />
                              <span>{model.name}</span>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {(imageEditModel === "nbpro" ||
                      imageEditModel === "nano-banana") && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant={"ghost"}
                            size={"sm"}
                            className="rounded-full group data-[state=open]:bg-input! hover:bg-input! mr-1"
                            data-testid="image-edit-size-selector-button"
                          >
                            <RatioIcon className="size-3 mr-1 text-primary" />
                            <span className="text-foreground">
                              {NANO_BANANA_SIZES.find(
                                (s) =>
                                  s.value ===
                                  (imageEditSize || DEFAULT_IMAGE_EDIT_SIZE),
                              )?.name || "Square"}
                            </span>
                            <ChevronDown className="size-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {NANO_BANANA_SIZES.map((size) => (
                            <DropdownMenuItem
                              key={size.id}
                              className="cursor-pointer"
                              onClick={() =>
                                handleImageEditSizeChange(size.value)
                              }
                            >
                              <div className="flex items-center gap-2">
                                {(imageEditSize || DEFAULT_IMAGE_EDIT_SIZE) ===
                                size.value ? (
                                  <Check className="size-3" />
                                ) : (
                                  <span className="w-3" />
                                )}
                                <RatioIcon className="size-4 text-muted-foreground" />
                                <span>{size.name}</span>
                                <span className="text-xs text-muted-foreground ml-1">
                                  ({size.value})
                                </span>
                              </div>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </>
                ) : (
                  <>
                    {/* Desktop Chat Model Selector */}
                    <div className="hidden md:block">
                      <SelectModel
                        onSelect={setChatModel}
                        currentModel={chatModel}
                        filterModel={modelFilter}
                        showModeToggle={true}
                        modelSpeed={modelSpeed}
                        onModelSpeedChange={(s) => {
                          speedTouchedRef.current = true;
                          setModelSpeed(s);
                        }}
                      >
                        <Button
                          variant={"ghost"}
                          size={"sm"}
                          className="rounded-full group data-[state=open]:bg-input! hover:bg-input! mr-1 gap-1.5"
                          data-testid="model-selector-button"
                        >
                          {/* Speed indicator icon — matches mobile */}
                          {modelSpeed === "fast" ? (
                            <ZapIcon className="size-3 text-yellow-500" />
                          ) : (
                            <BrainIcon className="size-3 text-purple-500" />
                          )}
                          {chatModel?.model ? (
                            <>
                              {chatModel.provider === "openai" ? (
                                <OpenAIIcon className="size-3 opacity-0 group-data-[state=open]:opacity-100 group-hover:opacity-100" />
                              ) : chatModel.provider === "xai" ? (
                                <GrokIcon className="size-3 opacity-0 group-data-[state=open]:opacity-100 group-hover:opacity-100" />
                              ) : chatModel.provider === "anthropic" ? (
                                <ClaudeIcon className="size-3 opacity-0 group-data-[state=open]:opacity-100 group-hover:opacity-100" />
                              ) : chatModel.provider === "google" ? (
                                <GeminiIcon className="size-3 opacity-0 group-data-[state=open]:opacity-100 group-hover:opacity-100" />
                              ) : null}
                              <span
                                className="text-foreground group-data-[state=open]:text-foreground  "
                                data-testid="selected-model-name"
                              >
                                {chatModel.model}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">model</span>
                          )}

                          <ChevronDown className="size-3" />
                        </Button>
                      </SelectModel>
                    </div>

                    {/* Mobile Chat Model Selector */}
                    <div className="block md:hidden">
                      <SelectModel
                        onSelect={setChatModel}
                        currentModel={chatModel}
                        filterModel={modelFilter}
                        showModeToggle={true}
                        modelSpeed={modelSpeed}
                        onModelSpeedChange={(s) => {
                          speedTouchedRef.current = true;
                          setModelSpeed(s);
                        }}
                      >
                        <Button
                          variant={"ghost"}
                          size={"sm"}
                          className="rounded-full group data-[state=open]:bg-input! hover:bg-input! px-2 gap-1.5 flex items-center"
                          data-testid="model-selector-button"
                        >
                          {/* Chip/CPU icon for mobile */}
                          <CpuIcon className="size-3.5 text-muted-foreground" />

                          {/* Speed indicator icon */}
                          {modelSpeed === "fast" ? (
                            <ZapIcon className="size-3 text-yellow-500" />
                          ) : (
                            <BrainIcon className="size-3 text-purple-500" />
                          )}

                          {/* Short model name */}
                          <span
                            className="text-foreground text-xs font-medium max-w-[80px] truncate"
                            data-testid="selected-model-name"
                          >
                            {getShortModelName(chatModel?.model)}
                          </span>
                        </Button>
                      </SelectModel>
                    </div>
                  </>
                )}
                {!isLoading &&
                !input.length &&
                !uploadedFiles.length &&
                !voiceDisabled ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size={"sm"}
                        onClick={() => {
                          appStoreMutate((state) => ({
                            voiceChat: {
                              ...state.voiceChat,
                              isOpen: true,
                              agentId: undefined,
                            },
                          }));
                        }}
                        className="rounded-full p-2!"
                      >
                        <AudioWaveformIcon size={16} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("VoiceChat.title")}</TooltipContent>
                  </Tooltip>
                ) : (
                  <div
                    onClick={() => {
                      if (isLoading) {
                        onStop();
                      } else {
                        submit();
                      }
                    }}
                    className="fade-in animate-in cursor-pointer text-muted-foreground rounded-full p-2 bg-secondary hover:bg-accent-foreground hover:text-accent transition-all duration-200"
                  >
                    {isLoading ? (
                      <Square
                        size={16}
                        className="fill-muted-foreground text-muted-foreground"
                      />
                    ) : (
                      <CornerRightUp size={16} />
                    )}
                  </div>
                )}
              </div>

              {/* Uploaded Files Preview - Below Input */}
              {uploadedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {uploadedFiles.map((file) => {
                    const isImage = file.mimeType.startsWith("image/");
                    const imageSrc =
                      file.previewUrl || file.url || file.dataUrl || "";
                    const displayName = file.name;
                    const displayExt =
                      file.name.split(".").pop()?.toUpperCase() || "FILE";
                    const isSummarizable = isIngestSupported(file.mimeType);
                    return (
                      <div
                        key={file.id}
                        className="relative group rounded-lg overflow-hidden border-2 border-border hover:border-primary transition-all"
                      >
                        {isImage ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={imageSrc}
                            alt={file.name}
                            className="w-24 h-24 object-cover"
                          />
                        ) : (
                          <div className="w-32 h-28 flex flex-col items-center justify-center bg-muted px-2 py-3 text-center">
                            <FileIcon className="size-8 text-muted-foreground mb-1" />
                            <span className="text-xs font-medium text-muted-foreground line-clamp-2 w-full">
                              {displayName}
                            </span>
                            <span className="text-[11px] text-muted-foreground/80">
                              {displayExt}
                            </span>
                          </div>
                        )}

                        {/* Upload Progress Overlay */}
                        {file.isUploading && (
                          <div className="absolute inset-0 bg-background/90 flex rounded-lg flex-col items-center justify-center backdrop-blur-sm">
                            <Loader2 className="size-6 animate-spin text-foreground mb-2" />
                            <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all duration-300"
                                style={{ width: `${file.progress || 0}%` }}
                              />
                            </div>
                            <span className="text-foreground text-xs mt-1">
                              {file.progress || 0}%
                            </span>
                          </div>
                        )}

                        {/* Hover Actions */}
                        <div
                          className={cn(
                            "absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity flex items-center justify-center rounded-lg",
                            file.isUploading
                              ? "opacity-0"
                              : "opacity-0 group-hover:opacity-100",
                          )}
                        >
                          <div className="flex gap-2 items-center">
                            {isSummarizable && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="secondary"
                                    size="icon"
                                    className="rounded-full"
                                    onClick={async () => {
                                      try {
                                        const url = file.url || file.dataUrl;
                                        if (!url) {
                                          toast.error("No file URL available");
                                          return;
                                        }
                                        const res = await fetch(
                                          "/api/storage/ingest",
                                          {
                                            method: "POST",
                                            headers: {
                                              "Content-Type":
                                                "application/json",
                                            },
                                            body: JSON.stringify({ url }),
                                          },
                                        );
                                        if (!res.ok) {
                                          const e = await res
                                            .json()
                                            .catch(() => ({}));
                                          toast.error(
                                            e.error || "Failed to ingest file",
                                          );
                                          return;
                                        }
                                        const data = await res.json();
                                        // Append preview text to input for the user to send
                                        setInput(
                                          `${input ? input + "\n\n" : ""}${data.text}`,
                                        );
                                      } catch (_err) {
                                        toast.error("Failed to ingest file");
                                      }
                                    }}
                                  >
                                    <FileTextIcon className="size-4" />
                                    <span className="sr-only">Summarize</span>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Summarize</TooltipContent>
                              </Tooltip>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-full bg-background/80 hover:bg-background"
                              onClick={() => deleteFile(file.id)}
                              disabled={file.isUploading}
                            >
                              <XIcon className="size-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Cancel Upload Button (Top Right) */}
                        {file.isUploading && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-1 right-1 size-6 rounded-full bg-background/60 hover:bg-background/80 backdrop-blur-sm"
                            onClick={() => deleteFile(file.id)}
                          >
                            <XIcon className="size-3" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </fieldset>
      </div>
    </div>
  );
}
