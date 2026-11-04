"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Conversation, type Callbacks } from "@elevenlabs/client";
import { TextPart, ToolUIPart } from "ai";
import {
  UIMessageWithCompleted,
  VoiceChatOptions,
  VoiceChatSession,
} from "lib/ai/speech";
import { generateUUID } from "lib/utils";
import { useTheme } from "next-themes";
import { callMcpToolByServerNameAction } from "@/app/api/mcp/actions";
import { appStore } from "@/app/store";

const ELEVENLABS_ORIGIN = "wss://api.elevenlabs.io";
const ELEVENLABS_LIVEKIT_URL = "wss://livekit.rtc.elevenlabs.io";
const USER_SPEAKING_THRESHOLD = 0.35;

interface ElevenLabsSessionResponse {
  token: string;
  instructions: string;
  tools: unknown[];
  voiceId: string | null;
  hasKimiCredentials: boolean;
}

type ConversationMessage = Parameters<NonNullable<Callbacks["onMessage"]>>[0];
type AgentChatResponsePart = Parameters<
  NonNullable<Callbacks["onAgentChatResponsePart"]>
>[0];
type VadScorePayload = Parameters<NonNullable<Callbacks["onVadScore"]>>[0];
type ModePayload = Parameters<NonNullable<Callbacks["onModeChange"]>>[0];
type McpEventPayload = Parameters<NonNullable<Callbacks["onMCPToolCall"]>>[0];

type McpToolAwaitingApproval = Extract<
  McpEventPayload,
  { state: "awaiting_approval" }
>;

type Content =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "tool-invocation";
      name: string;
      arguments: any;
      state: "call" | "result";
      toolCallId: string;
      result?: any;
    };

const createUIPart = (content: Content): TextPart | ToolUIPart => {
  if (content.type === "tool-invocation") {
    return {
      type: `tool-${content.name}`,
      input: content.arguments,
      state: content.state === "call" ? "input-streaming" : "output-available",
      toolCallId: content.toolCallId,
      output: content.result,
    } satisfies ToolUIPart;
  }
  return {
    type: "text",
    text: content.text,
  } satisfies TextPart;
};

const createUIMessage = (params: {
  id?: string;
  role: "user" | "assistant";
  content: Content;
  completed?: boolean;
}): UIMessageWithCompleted => {
  const id = params.id ?? generateUUID();
  return {
    id,
    role: params.role,
    parts: [createUIPart(params.content)],
    completed: params.completed ?? false,
  };
};

export function useElevenLabsVoiceChat(
  props?: VoiceChatOptions,
): VoiceChatSession {
  const { setTheme } = useTheme();
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<UIMessageWithCompleted[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const conversationRef = useRef<Conversation | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const toolMessageMap = useRef(new Map<string, string>());
  const vadTimeoutRef = useRef<number | null>(null);
  // Track if connection was ever established to prevent premature disconnect handling
  const connectionEstablishedRef = useRef<boolean>(false);

  const resetSpeechIndicators = useCallback(() => {
    setIsAssistantSpeaking(false);
    setIsUserSpeaking(false);
  }, []);

  const cleanupConversation = useCallback(async () => {
    if (!conversationRef.current) return;
    try {
      await conversationRef.current.endSession();
    } catch (endError) {
      console.error("Failed to end ElevenLabs session", endError);
    } finally {
      conversationRef.current = null;
    }
  }, []);

  const stop = useCallback(async () => {
    await cleanupConversation();
    streamingMessageIdRef.current = null;
    toolMessageMap.current.clear();
    connectionEstablishedRef.current = false;
    resetSpeechIndicators();
    setIsActive(false);
    setIsListening(false);
  }, [cleanupConversation, resetSpeechIndicators]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const updateUIMessage = useCallback(
    (
      id: string,
      next:
        | Partial<UIMessageWithCompleted>
        | ((
            message: UIMessageWithCompleted,
          ) => Partial<UIMessageWithCompleted>),
    ) => {
      setMessages((prev) => {
        const target = prev.find((message) => message.id === id);
        if (!target) return prev;
        const patch = typeof next === "function" ? next(target) : next;
        const updated = { ...target, ...patch };
        return prev.map((message) => (message.id === id ? updated : message));
      });
    },
    [],
  );

  const appendMessage = useCallback((message: UIMessageWithCompleted) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const ensureToolMessage = useCallback(
    ({
      toolCallId,
      toolName,
      args,
    }: { toolCallId: string; toolName: string; args: any }) => {
      if (toolMessageMap.current.has(toolCallId)) {
        return toolMessageMap.current.get(toolCallId)!;
      }
      const id = generateUUID();
      toolMessageMap.current.set(toolCallId, id);
      appendMessage(
        createUIMessage({
          id,
          role: "assistant",
          content: {
            type: "tool-invocation",
            name: toolName,
            arguments: args,
            state: "call",
            toolCallId,
          },
        }),
      );
      return id;
    },
    [appendMessage],
  );

  const handleAgentResponsePart = useCallback(
    (part: AgentChatResponsePart) => {
      const { text, type } = part;
      if (type === "start" || !streamingMessageIdRef.current) {
        const id = generateUUID();
        streamingMessageIdRef.current = id;
        appendMessage(
          createUIMessage({
            id,
            role: "assistant",
            content: { type: "text", text: text ?? "" },
            completed: type === "stop",
          }),
        );
        return;
      }

      const targetId = streamingMessageIdRef.current;
      if (type === "delta" && text) {
        updateUIMessage(targetId, (prev) => {
          const currentText = ((prev.parts[0] as TextPart)?.text ?? "") + text;
          const nextPart: TextPart = {
            type: "text",
            text: currentText,
          };
          return {
            parts: [nextPart],
          };
        });
      }

      if (type === "stop") {
        updateUIMessage(targetId, { completed: true });
        streamingMessageIdRef.current = null;
      }
    },
    [appendMessage, updateUIMessage],
  );

  const handleMessage = useCallback(
    (payload: ConversationMessage) => {
      if (!payload?.message) return;
      if (payload.source === "user") {
        appendMessage(
          createUIMessage({
            role: "user",
            content: { type: "text", text: payload.message },
            completed: true,
          }),
        );
        return;
      }

      const latestAssistantMessage = streamingMessageIdRef.current;
      if (latestAssistantMessage) {
        updateUIMessage(latestAssistantMessage, (_prev) => {
          const nextPart: TextPart = {
            type: "text",
            text: payload.message,
          };
          return {
            parts: [nextPart],
            completed: true,
          };
        });
        streamingMessageIdRef.current = null;
        return;
      }

      appendMessage(
        createUIMessage({
          role: "assistant",
          content: { type: "text", text: payload.message },
          completed: true,
        }),
      );
    },
    [appendMessage, updateUIMessage],
  );

  const handleModeChange = useCallback((payload: ModePayload) => {
    setIsAssistantSpeaking(payload.mode === "speaking");
  }, []);

  const handleVadScore = useCallback((payload: VadScorePayload) => {
    if (payload.vadScore >= USER_SPEAKING_THRESHOLD) {
      if (vadTimeoutRef.current) {
        window.clearTimeout(vadTimeoutRef.current);
        vadTimeoutRef.current = null;
      }
      setIsUserSpeaking(true);
      return;
    }

    if (vadTimeoutRef.current) {
      window.clearTimeout(vadTimeoutRef.current);
      vadTimeoutRef.current = null;
    }
    vadTimeoutRef.current = window.setTimeout(() => {
      setIsUserSpeaking(false);
      vadTimeoutRef.current = null;
    }, 250);
  }, []);

  const handleMcpToolCall = useCallback(
    async (payload: McpEventPayload) => {
      const awaitingPayload = payload as McpToolAwaitingApproval;
      if (!awaitingPayload || awaitingPayload.state !== "awaiting_approval") {
        return;
      }

      const messageId = ensureToolMessage({
        toolCallId: awaitingPayload.tool_call_id,
        toolName: awaitingPayload.tool_name,
        args: awaitingPayload.parameters,
      });

      try {
        const result = await callMcpToolByServerNameAction(
          awaitingPayload.service_id,
          awaitingPayload.tool_name,
          awaitingPayload.parameters,
        );
        conversationRef.current?.sendMCPToolApprovalResult(
          awaitingPayload.tool_call_id,
          true,
        );
        updateUIMessage(messageId, {
          parts: [
            {
              type: `tool-${awaitingPayload.tool_name}`,
              input: awaitingPayload.parameters,
              output: result,
              toolCallId: awaitingPayload.tool_call_id,
              state: "output-available",
            } satisfies ToolUIPart,
          ],
          completed: true,
        });
      } catch (toolError) {
        console.error("MCP tool execution failed", toolError);
        conversationRef.current?.sendMCPToolApprovalResult(
          awaitingPayload.tool_call_id,
          false,
        );
        updateUIMessage(messageId, {
          parts: [
            {
              type: `tool-${awaitingPayload.tool_name}`,
              input: awaitingPayload.parameters,
              output: {
                error:
                  toolError instanceof Error
                    ? toolError.message
                    : String(toolError),
              },
              toolCallId: awaitingPayload.tool_call_id,
              state: "output-available",
            } satisfies ToolUIPart,
          ],
          completed: true,
        });
      }
    },
    [ensureToolMessage, updateUIMessage],
  );

  const startListening = useCallback(async () => {
    if (!conversationRef.current) return;
    conversationRef.current.setMicMuted(false);
    setIsListening(true);
  }, []);

  const stopListening = useCallback(async () => {
    if (!conversationRef.current) return;
    conversationRef.current.setMicMuted(true);
    setIsListening(false);
  }, []);

  const createSession = useCallback(async () => {
    const response = await fetch("/api/voice/kimi-elevenlabs/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mentions: props?.toolMentions ?? [],
        agentId: props?.agentId,
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const payload = (await response.json()) as ElevenLabsSessionResponse;
    if (!payload.token) {
      throw new Error("Missing ElevenLabs conversation token");
    }
    if (!payload.hasKimiCredentials) {
      throw new Error("Kimi credentials are not configured on the server");
    }
    return payload;
  }, [props?.agentId, props?.toolMentions]);

  const start = useCallback(async () => {
    if (isLoading || isActive) return;
    setIsLoading(true);
    setError(null);
    setMessages([]);
    streamingMessageIdRef.current = null;
    toolMessageMap.current.clear();
    connectionEstablishedRef.current = false;

    try {
      const session = await createSession();
      const clientTools = {
        changeBrowserTheme: async ({ theme }: { theme?: "light" | "dark" }) => {
          if (theme === "light" || theme === "dark") {
            setTheme(theme);
          }
          return "Theme updated";
        },
        endConversation: async () => {
          await stop();
          setMessages([]);
          appStore.setState((prev) => ({
            ...prev,
            voiceChat: {
              ...prev.voiceChat,
              agentId: undefined,
              isOpen: false,
            },
          }));
          return "Conversation ended";
        },
      } satisfies Record<
        string,
        (...args: any[]) => Promise<string> | string | void
      >;

      const overrides = {
        agent: session.instructions
          ? {
              prompt: {
                prompt: session.instructions,
              },
            }
          : undefined,
        tts:
          props?.voice || session.voiceId
            ? {
                voiceId: props?.voice ?? session.voiceId ?? undefined,
              }
            : undefined,
      };

      const conversation = await Conversation.startSession({
        connectionType: "webrtc",
        conversationToken: session.token,
        origin: ELEVENLABS_ORIGIN,
        livekitUrl: ELEVENLABS_LIVEKIT_URL,
        clientTools,
        overrides,
        onMessage: handleMessage,
        onAgentChatResponsePart: handleAgentResponsePart,
        onModeChange: handleModeChange,
        onVadScore: handleVadScore,
        onMCPToolCall: handleMcpToolCall,
        onError: (message) => {
          console.error("ElevenLabs conversation error", message);
          setError(
            new Error(typeof message === "string" ? message : "Unknown error"),
          );
        },
        onDisconnect: async () => {
          // Only handle disconnect if connection was previously established
          // This prevents premature termination during initial connection issues
          if (connectionEstablishedRef.current) {
            await stop();
          }
        },
        onStatusChange: ({ status }) => {
          if (status === "connected") {
            connectionEstablishedRef.current = true;
            setIsActive(true);
            setIsListening(true);
          }
          if (status === "disconnected") {
            setIsActive(false);
            setIsListening(false);
          }
        },
      });

      conversationRef.current = conversation;
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError
          : new Error(String(startError)),
      );
      await stop();
    } finally {
      setIsLoading(false);
    }
  }, [
    createSession,
    handleAgentResponsePart,
    handleMcpToolCall,
    handleMessage,
    handleModeChange,
    handleVadScore,
    isActive,
    isLoading,
    props?.voice,
    setTheme,
    stop,
  ]);

  return {
    isActive,
    isListening,
    isUserSpeaking,
    isAssistantSpeaking,
    isLoading,
    messages,
    error,
    start,
    stop,
    startListening,
    stopListening,
  };
}
