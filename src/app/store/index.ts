import { AgentSummary } from "app-types/agent";
import { ArchiveWithItemCount } from "app-types/archive";
import { ChatMention, ChatModel, ChatThread } from "app-types/chat";
import { AllowedMCPServer, MCPServerInfo } from "app-types/mcp";
import { WorkflowSummary } from "app-types/workflow";
import type { VoiceChatProviderId } from "lib/ai/speech/providers";
import { AppDefaultToolkit } from "lib/ai/tools";
import { DEFAULT_ENABLED_TOOLKITS } from "lib/ai/tools/toolkit-catalog";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface UploadedFile {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
  isUploading?: boolean;
  progress?: number;
  previewUrl?: string;
  abortController?: AbortController;
  dataUrl?: string; // Full data URL format: "data:image/png;base64,..."
}

export interface CanvasSlide {
  index: number;
  title: string;
  bullets: string[];
  imagePrompt?: string;
  imageUrl?: string;
}

export interface ActiveCanvas {
  canvasId?: string;
  title: string;
  contentType: "presentation" | "html";
  summary?: string;
  html?: string;
  slides?: CanvasSlide[];
  slideCount?: number;
  estimatedTime?: string;
}

export interface AppState {
  threadList: ChatThread[];
  mcpList: (MCPServerInfo & { id: string })[];
  agentList: AgentSummary[];
  workflowToolList: WorkflowSummary[];
  currentThreadId: ChatThread["id"] | null;
  toolChoice: "auto" | "none" | "manual" | "codemode";
  allowedMcpServers?: Record<string, AllowedMCPServer>;
  allowedAppDefaultToolkit?: AppDefaultToolkit[];
  generatingTitleThreadIds: string[];
  archiveList: ArchiveWithItemCount[];
  threadMentions: {
    [threadId: string]: ChatMention[];
  };
  threadFiles: {
    [threadId: string]: UploadedFile[];
  };
  threadImageToolModel: {
    [threadId: string]: string | undefined;
  };
  threadImageToolSize: {
    [threadId: string]: string | undefined;
  };
  threadImageEditModel: {
    [threadId: string]: string | undefined;
  };
  threadImageEditSize: {
    [threadId: string]: string | undefined;
  };
  toolPresets: {
    allowedMcpServers?: Record<string, AllowedMCPServer>;
    allowedAppDefaultToolkit?: AppDefaultToolkit[];
    name: string;
  }[];
  chatModel?: ChatModel;
  openShortcutsPopup: boolean;
  openChatPreferences: boolean;
  openCustomize: boolean;
  openUserSettings: boolean;
  mcpCustomizationPopup?: MCPServerInfo & { id: string };
  temporaryChat: {
    isOpen: boolean;
    instructions: string;
    chatModel?: ChatModel;
  };
  voiceChat: {
    isOpen: boolean;
    agentId?: string;
    options: {
      provider: VoiceChatProviderId;
      providerOptions?: Record<string, any>;
    };
  };
  pendingThreadMention?: ChatMention;
  replyingTo?: {
    text: string;
    messageId?: string;
  };
  browserAgent?: {
    isActive: boolean;
    currentUrl?: string;
    status?:
      | "idle"
      | "browsing"
      | "clicking"
      | "typing"
      | "scrolling"
      | "screenshot";
    lastAction?: {
      type: "click" | "type" | "scroll" | "navigate" | "screenshot";
      x?: number;
      y?: number;
      text?: string;
      timestamp: number;
    };
    lastUserClick?: {
      x: number;
      y: number;
      timestamp: number;
    };
    screenshot?: string;
    // Persisted live view — survives across tool invocations so the UI
    // can render the last known browser state without waiting for a new call
    liveViewUrl?: string;
    interactiveLiveViewUrl?: string;
    pageTitle?: string;
    sessionId?: string;
    isWriteLocked?: boolean;
  };
  activeCanvas?: ActiveCanvas;
}

export interface AppDispatch {
  mutate: (state: Mutate<AppState>) => void;
}

const initialState: AppState = {
  threadList: [],
  archiveList: [],
  generatingTitleThreadIds: [],
  threadMentions: {},
  threadFiles: {},
  threadImageToolModel: {},
  threadImageToolSize: {},
  threadImageEditModel: {},
  threadImageEditSize: {},
  mcpList: [],
  agentList: [],
  workflowToolList: [],
  currentThreadId: null,
  toolChoice: "auto",
  allowedMcpServers: undefined,
  openUserSettings: false,
  openCustomize: false,
  allowedAppDefaultToolkit: DEFAULT_ENABLED_TOOLKITS,
  toolPresets: [],
  chatModel: undefined,
  openShortcutsPopup: false,
  openChatPreferences: false,
  mcpCustomizationPopup: undefined,
  temporaryChat: {
    isOpen: false,
    instructions: "",
  },
  voiceChat: {
    isOpen: false,
    options: {
      provider: "konvo",
      providerOptions: {
        openai: {
          voice: "ash",
        },
        konvo: {
          voice: "shubh",
          micSensitivity: "balanced",
        },
      },
    },
  },
  pendingThreadMention: undefined,
  replyingTo: undefined,
  browserAgent: undefined,
  activeCanvas: undefined,
};

export const appStore = create<AppState & AppDispatch>()(
  persist(
    (set) => ({
      ...initialState,
      mutate: set,
    }),
    {
      name: "mc-app-store-v2.0.1",
      version: 3,
      migrate: (persistedState): any => {
        const state = persistedState as Partial<AppState>;
        const allowedAppDefaultToolkit =
          state.allowedAppDefaultToolkit ??
          initialState.allowedAppDefaultToolkit ??
          [];
        const requiredToolkits = [AppDefaultToolkit.Canvas];
        const nextAllowedAppDefaultToolkit = [...allowedAppDefaultToolkit];

        for (const toolkit of requiredToolkits) {
          if (!nextAllowedAppDefaultToolkit.includes(toolkit)) {
            nextAllowedAppDefaultToolkit.push(toolkit);
          }
        }

        return {
          ...state,
          allowedAppDefaultToolkit: nextAllowedAppDefaultToolkit,
        };
      },
      partialize: (state) => ({
        chatModel: state.chatModel || initialState.chatModel,
        toolChoice: state.toolChoice || initialState.toolChoice,
        allowedMcpServers:
          state.allowedMcpServers || initialState.allowedMcpServers,
        allowedAppDefaultToolkit: (
          state.allowedAppDefaultToolkit ??
          initialState.allowedAppDefaultToolkit
        )?.filter((v) => Object.values(AppDefaultToolkit).includes(v)),
        temporaryChat: {
          ...initialState.temporaryChat,
          ...state.temporaryChat,
          isOpen: false,
        },
        toolPresets: state.toolPresets || initialState.toolPresets,
        voiceChat: {
          ...initialState.voiceChat,
          ...state.voiceChat,
          isOpen: false,
        },
      }),
    },
  ),
);
