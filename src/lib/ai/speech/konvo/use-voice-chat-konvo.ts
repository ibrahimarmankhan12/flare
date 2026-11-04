"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TextPart, ToolUIPart } from "ai";
import {
  DEFAULT_VOICE_TOOLS,
  UIMessageWithCompleted,
  VoiceChatOptions,
  VoiceChatSession,
} from "lib/ai/speech";
import { generateUUID } from "lib/utils";
import { useTheme } from "next-themes";
import { extractMCPToolId } from "lib/ai/mcp/mcp-tool-id";
import { callMcpToolByServerNameAction } from "@/app/api/mcp/actions";
import { appStore } from "@/app/store";

// -- Types --
type Content =
  | { type: "text"; text: string }
  | {
      type: "tool-invocation";
      name: string;
      arguments: any;
      state: "call" | "result";
      toolCallId: string;
      result?: any;
    };

interface SessionConfig {
  instructions: string;
  tools: any[];
  groqModel: string;
  toolIdMap?: Record<string, { serverName: string; toolName: string }>;
}

type SupportedSpeechLanguage = "en-IN" | "hi-IN";
type MicSensitivity = NonNullable<VoiceChatOptions["micSensitivity"]>;

interface MicSensitivityProfile {
  vadSilenceMs: number;
  minUtteranceMs: number;
  vadMinStartRms: number;
  vadMinContinueRms: number;
  vadBargeInMinRms: number;
  vadBargeInMultiplier: number;
  vadNoiseAlpha: number;
  vadStartFrames: number;
  vadBargeInFrames: number;
  vadBargeInMinMs: number;
  vadPrerollFrames: number;
}

const INPUT_SAMPLE_RATE = 16000;
const DEFAULT_MIC_SENSITIVITY: MicSensitivity = "balanced";
const MIC_SENSITIVITY_PROFILES: Record<MicSensitivity, MicSensitivityProfile> =
  {
    low_noise: {
      vadSilenceMs: 340,
      minUtteranceMs: 210,
      vadMinStartRms: 0.0052,
      vadMinContinueRms: 0.0034,
      vadBargeInMinRms: 0.0082,
      vadBargeInMultiplier: 1.55,
      vadNoiseAlpha: 0.07,
      vadStartFrames: 3,
      vadBargeInFrames: 6,
      vadBargeInMinMs: 520,
      vadPrerollFrames: 3,
    },
    balanced: {
      vadSilenceMs: 350,
      minUtteranceMs: 180,
      vadMinStartRms: 0.0038,
      vadMinContinueRms: 0.0026,
      vadBargeInMinRms: 0.0072,
      vadBargeInMultiplier: 1.45,
      vadNoiseAlpha: 0.08,
      vadStartFrames: 2,
      vadBargeInFrames: 5,
      vadBargeInMinMs: 420,
      vadPrerollFrames: 3,
    },
    soft_voice: {
      vadSilenceMs: 420,
      minUtteranceMs: 140,
      vadMinStartRms: 0.0026,
      vadMinContinueRms: 0.0018,
      vadBargeInMinRms: 0.0058,
      vadBargeInMultiplier: 1.35,
      vadNoiseAlpha: 0.1,
      vadStartFrames: 1,
      vadBargeInFrames: 7,
      vadBargeInMinMs: 620,
      vadPrerollFrames: 5,
    },
  };

const normalizeMicSensitivity = (
  value: VoiceChatOptions["micSensitivity"],
): MicSensitivity => {
  if (!value) return DEFAULT_MIC_SENSITIVITY;
  if (value in MIC_SENSITIVITY_PROFILES) {
    return value as MicSensitivity;
  }
  return DEFAULT_MIC_SENSITIVITY;
};
const TTS_SENTENCE_MIN_CHARS = 18;
const TTS_SENTENCE_MAX_CHARS = 150;
const TTS_FALLBACK_SPLIT_CHARS = 90;
const TTS_FORCE_SPLIT_CHARS = 180;
const TTS_EARLY_SPLIT_CHARS = 64;
const TTS_EARLY_MIN_CHARS = 28;
const TTS_FIRST_CHUNK_TARGET_CHARS = 52;
const TTS_FIRST_CHUNK_MIN_CHARS = 24;

const detectSpeechLanguage = (
  text: string,
  fallback: SupportedSpeechLanguage = "en-IN",
): SupportedSpeechLanguage => {
  const devanagariCount = (text.match(/[\u0900-\u097f]/g) || []).length;
  const latinCount = (text.match(/[A-Za-z]/g) || []).length;

  if (devanagariCount >= 2 && devanagariCount >= latinCount / 2) {
    return "hi-IN";
  }

  if (latinCount >= 2) {
    return "en-IN";
  }

  return fallback;
};

const buildLanguageLockInstruction = (
  language: SupportedSpeechLanguage,
): string => {
  if (language === "hi-IN") {
    return "Language mode locked: Reply only in Hindi (Devanagari script). Do not use English words, transliteration, or mixed language.";
  }

  return "Language mode locked: Reply only in English. Do not use Hindi words, transliteration, or mixed language.";
};

const floatTo16BitPCM = (input: Float32Array): Int16Array => {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
};

const encodeWav = (
  pcm: Int16Array,
  sampleRate: number,
  channels: number,
): ArrayBuffer => {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < pcm.length; i++, offset += 2) {
    view.setInt16(offset, pcm[i], true);
  }

  return buffer;
};

const extractSpeechChunks = (
  buffer: string,
  forceFlush = false,
): { chunks: string[]; remaining: string } => {
  const chunks: string[] = [];
  let remaining = buffer;

  const pushChunk = (value: string) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized) {
      chunks.push(normalized);
    }
  };

  while (remaining.length > 0) {
    const sentenceMatch = remaining.match(
      /^[\s\S]{1,150}?(?:[.!?]+(?:\s+|$)|\n+)/,
    );

    if (
      sentenceMatch &&
      sentenceMatch[0].trim().length >= TTS_SENTENCE_MIN_CHARS
    ) {
      pushChunk(sentenceMatch[0]);
      remaining = remaining.slice(sentenceMatch[0].length);
      continue;
    }

    if (remaining.length >= TTS_FORCE_SPLIT_CHARS) {
      const splitAt = remaining.lastIndexOf(" ", TTS_FALLBACK_SPLIT_CHARS);
      if (splitAt > TTS_SENTENCE_MIN_CHARS) {
        pushChunk(remaining.slice(0, splitAt));
        remaining = remaining.slice(splitAt + 1);
        continue;
      }

      pushChunk(remaining.slice(0, TTS_SENTENCE_MAX_CHARS));
      remaining = remaining.slice(TTS_SENTENCE_MAX_CHARS);
      continue;
    }

    if (remaining.length >= TTS_SENTENCE_MAX_CHARS) {
      const punctuationSplitAt = Math.max(
        remaining.lastIndexOf(", ", TTS_FALLBACK_SPLIT_CHARS),
        remaining.lastIndexOf("; ", TTS_FALLBACK_SPLIT_CHARS),
        remaining.lastIndexOf(": ", TTS_FALLBACK_SPLIT_CHARS),
      );
      if (punctuationSplitAt > TTS_SENTENCE_MIN_CHARS) {
        pushChunk(remaining.slice(0, punctuationSplitAt + 1));
        remaining = remaining.slice(punctuationSplitAt + 1);
        continue;
      }
    }

    if (remaining.length >= TTS_EARLY_SPLIT_CHARS) {
      const splitAt = remaining.lastIndexOf(" ", TTS_EARLY_SPLIT_CHARS);
      if (splitAt > TTS_EARLY_MIN_CHARS) {
        pushChunk(remaining.slice(0, splitAt));
        remaining = remaining.slice(splitAt + 1);
        continue;
      }
    }

    break;
  }

  if (forceFlush) {
    pushChunk(remaining);
    remaining = "";
  }

  return { chunks, remaining };
};

const popFirstChunkForFastStart = (
  buffer: string,
): { chunk: string; remaining: string } | null => {
  if (buffer.length < TTS_FIRST_CHUNK_TARGET_CHARS) return null;

  const punctuationSplit = Math.max(
    buffer.lastIndexOf(". ", TTS_FIRST_CHUNK_TARGET_CHARS),
    buffer.lastIndexOf("? ", TTS_FIRST_CHUNK_TARGET_CHARS),
    buffer.lastIndexOf("! ", TTS_FIRST_CHUNK_TARGET_CHARS),
    buffer.lastIndexOf(", ", TTS_FIRST_CHUNK_TARGET_CHARS),
  );
  if (punctuationSplit >= TTS_FIRST_CHUNK_MIN_CHARS) {
    const end = punctuationSplit + 1;
    return {
      chunk: buffer.slice(0, end).replace(/\s+/g, " ").trim(),
      remaining: buffer.slice(end).trimStart(),
    };
  }

  const spaceSplit = buffer.lastIndexOf(" ", TTS_FIRST_CHUNK_TARGET_CHARS);
  if (spaceSplit >= TTS_FIRST_CHUNK_MIN_CHARS) {
    return {
      chunk: buffer.slice(0, spaceSplit).replace(/\s+/g, " ").trim(),
      remaining: buffer.slice(spaceSplit + 1).trimStart(),
    };
  }

  return {
    chunk: buffer
      .slice(0, TTS_FIRST_CHUNK_TARGET_CHARS)
      .replace(/\s+/g, " ")
      .trim(),
    remaining: buffer.slice(TTS_FIRST_CHUNK_TARGET_CHARS).trimStart(),
  };
};

// -- Helpers --
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
  return { type: "text", text: content.text } satisfies TextPart;
};

const createUIMessage = (params: {
  id?: string;
  role: "user" | "assistant";
  content: Content;
  completed?: boolean;
}): UIMessageWithCompleted => ({
  id: params.id ?? generateUUID(),
  role: params.role,
  parts: [createUIPart(params.content)],
  completed: params.completed ?? false,
});

// -- Hook --
export function useKonvOVoiceChat(props?: VoiceChatOptions): VoiceChatSession {
  const { setTheme } = useTheme();
  const micSensitivity = useMemo(
    () => normalizeMicSensitivity(props?.micSensitivity),
    [props?.micSensitivity],
  );
  const micProfile = useMemo(
    () => MIC_SENSITIVITY_PROFILES[micSensitivity],
    [micSensitivity],
  );

  // State
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<UIMessageWithCompleted[]>([]);
  const [error, setError] = useState<Error | null>(null);

  // Refs
  const responseLanguageRef = useRef<SupportedSpeechLanguage>("en-IN");
  const sttLanguageHintRef = useRef<SupportedSpeechLanguage | null>(null);
  const sessionRef = useRef<SessionConfig | null>(null);
  const conversationHistoryRef = useRef<
    Array<{
      role: "system" | "user" | "assistant" | "tool";
      content: string;
      tool_call_id?: string;
      name?: string;
      tool_calls?: any[];
    }>
  >([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const utteranceChunksRef = useRef<Float32Array[]>([]);
  const preRollFramesRef = useRef<Float32Array[]>([]);
  const isCapturingUtteranceRef = useRef(false);
  const inputSampleRateRef = useRef(INPUT_SAMPLE_RATE);
  const lastVoiceAtRef = useRef<number>(0);
  const currentUtteranceDurationMsRef = useRef(0);
  const noiseFloorRef = useRef(0.0025);
  const speechFrameCountRef = useRef(0);
  const bargeInFrameCountRef = useRef(0);
  const sttQueueRef = useRef<Blob[]>([]);
  const isSttQueueProcessingRef = useRef(false);
  const sttRequestAbortRef = useRef<AbortController | null>(null);
  const ttsTextQueueRef = useRef<string[]>([]);
  const ttsAudioQueueRef = useRef<
    Array<{ audioBase64: string; mimeType?: string; generation: number }>
  >([]);
  const isTtsSynthesisProcessingRef = useRef(false);
  const isTtsPlaybackProcessingRef = useRef(false);
  const ttsGenerationRef = useRef(0);
  const ttsRequestAbortRef = useRef<AbortController | null>(null);
  const isPlayingRef = useRef(false);
  const currentAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const micProfileRef = useRef<MicSensitivityProfile>(micProfile);

  useEffect(() => {
    micProfileRef.current = micProfile;
  }, [micProfile]);

  // -- Update / Append messages --
  const updateUIMessage = useCallback(
    (
      id: string,
      next:
        | Partial<UIMessageWithCompleted>
        | ((m: UIMessageWithCompleted) => Partial<UIMessageWithCompleted>),
    ) => {
      setMessages((prev) => {
        const target = prev.find((m) => m.id === id);
        if (!target) return prev;
        const patch = typeof next === "function" ? next(target) : next;
        return prev.map((m) => (m.id === id ? { ...m, ...patch } : m));
      });
    },
    [],
  );

  const appendMessage = useCallback((msg: UIMessageWithCompleted) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  // -- TTS: incremental queue playback --
  const synthesizeTtsChunk = useCallback(
    async (
      text: string,
      generation: number,
    ): Promise<{ audioBase64: string; mimeType?: string } | null> => {
      if (generation !== ttsGenerationRef.current) return null;
      const trimmedText = text.trim();
      if (!trimmedText) return null;

      const controller = new AbortController();
      ttsRequestAbortRef.current = controller;

      try {
        const response = await fetch("/api/voice/groq-konvo/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: trimmedText,
            voice: props?.voice || "anushka",
            targetLanguageCode: responseLanguageRef.current,
            pace: 1.12,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`TTS API error: ${response.status}: ${errorBody}`);
        }

        const payload = (await response.json()) as {
          audioBase64?: string;
          mimeType?: string;
        };
        if (!payload.audioBase64) return null;

        return payload as { audioBase64: string; mimeType?: string };
      } finally {
        if (ttsRequestAbortRef.current === controller) {
          ttsRequestAbortRef.current = null;
        }
      }
    },
    [props?.voice],
  );

  const playTtsChunk = useCallback(
    async (payload: { audioBase64: string; mimeType?: string }) => {
      const audio = new Audio(
        `data:${payload.mimeType ?? "audio/wav"};base64,${payload.audioBase64}`,
      );

      currentAudioElementRef.current = audio;
      isPlayingRef.current = true;
      setIsAssistantSpeaking(true);

      await new Promise<void>((resolve) => {
        const clear = () => resolve();
        audio.onended = clear;
        audio.onerror = clear;
        audio.onpause = clear;
        audio.play().catch(clear);
      });

      if (currentAudioElementRef.current === audio) {
        currentAudioElementRef.current = null;
      }
      isPlayingRef.current = false;
    },
    [],
  );

  const processTtsPlaybackQueue = useCallback(async () => {
    if (isTtsPlaybackProcessingRef.current) return;
    isTtsPlaybackProcessingRef.current = true;
    const generation = ttsGenerationRef.current;
    setIsAssistantSpeaking(true);

    try {
      while (
        ttsAudioQueueRef.current.length > 0 &&
        generation === ttsGenerationRef.current
      ) {
        const nextAudio = ttsAudioQueueRef.current.shift();
        if (!nextAudio) continue;
        if (nextAudio.generation !== generation) continue;
        await playTtsChunk(nextAudio);
      }
    } finally {
      isTtsPlaybackProcessingRef.current = false;
      if (
        generation === ttsGenerationRef.current &&
        !isTtsSynthesisProcessingRef.current &&
        ttsTextQueueRef.current.length === 0 &&
        ttsAudioQueueRef.current.length === 0 &&
        !isPlayingRef.current
      ) {
        setIsAssistantSpeaking(false);
      }
    }
  }, [playTtsChunk]);

  const processTtsSynthesisQueue = useCallback(async () => {
    if (isTtsSynthesisProcessingRef.current) return;
    isTtsSynthesisProcessingRef.current = true;
    const generation = ttsGenerationRef.current;

    try {
      while (
        ttsTextQueueRef.current.length > 0 &&
        generation === ttsGenerationRef.current
      ) {
        const nextChunk = ttsTextQueueRef.current.shift();
        if (!nextChunk) continue;

        let payload: { audioBase64: string; mimeType?: string } | null = null;
        try {
          payload = await synthesizeTtsChunk(nextChunk, generation);
        } catch (err: any) {
          if (err?.name === "AbortError") break;
          console.error("TTS synthesis error:", err);
          continue;
        }

        if (!payload || generation !== ttsGenerationRef.current) continue;
        ttsAudioQueueRef.current.push({ ...payload, generation });
        void processTtsPlaybackQueue();
      }
    } finally {
      isTtsSynthesisProcessingRef.current = false;
      if (
        generation === ttsGenerationRef.current &&
        !isTtsPlaybackProcessingRef.current &&
        ttsTextQueueRef.current.length === 0 &&
        ttsAudioQueueRef.current.length === 0 &&
        !isPlayingRef.current
      ) {
        setIsAssistantSpeaking(false);
      }
    }
  }, [processTtsPlaybackQueue, synthesizeTtsChunk]);

  const enqueueTtsText = useCallback(
    (text: string) => {
      const normalized = text.replace(/\s+/g, " ").trim();
      if (!normalized) return;
      ttsTextQueueRef.current.push(normalized);
      setIsAssistantSpeaking(true);
      void processTtsSynthesisQueue();
    },
    [processTtsSynthesisQueue],
  );

  const stopPlayback = useCallback(() => {
    ttsGenerationRef.current += 1;
    ttsTextQueueRef.current = [];
    ttsAudioQueueRef.current = [];
    ttsRequestAbortRef.current?.abort();
    ttsRequestAbortRef.current = null;

    if (currentAudioElementRef.current) {
      currentAudioElementRef.current.pause();
      currentAudioElementRef.current.src = "";
      currentAudioElementRef.current = null;
    }

    isPlayingRef.current = false;
    setIsAssistantSpeaking(false);
  }, []);

  // -- Handle tool calls --
  const executeToolCalls = useCallback(
    async (toolCalls: any[]): Promise<string[]> => {
      const results: string[] = [];

      for (const tc of toolCalls) {
        const toolName = tc.function.name;
        const toolArgs = JSON.parse(tc.function.arguments || "{}");
        const callId = tc.id;

        // Show tool call in UI
        const toolMsgId = generateUUID();
        appendMessage(
          createUIMessage({
            id: toolMsgId,
            role: "assistant",
            content: {
              type: "tool-invocation",
              name: toolName,
              arguments: toolArgs,
              state: "call",
              toolCallId: callId,
            },
          }),
        );

        let result: any = "success";

        // Handle built-in voice tools
        if (DEFAULT_VOICE_TOOLS.some((t) => t.name === toolName)) {
          switch (toolName) {
            case "changeBrowserTheme":
              setTheme(toolArgs?.theme);
              result = `Theme changed to ${toolArgs?.theme}`;
              break;
            case "endConversation":
              // Will be handled after tool loop
              result = "Conversation ended";
              break;
          }
        } else {
          // MCP tool execution
          try {
            let serverName = "";
            let mcpToolName = "";

            if (sessionRef.current?.toolIdMap?.[toolName]) {
              const mapped = sessionRef.current.toolIdMap[toolName];
              serverName = mapped.serverName;
              mcpToolName = mapped.toolName;
            } else {
              const toolId = extractMCPToolId(toolName);
              serverName = toolId.serverName;
              mcpToolName = toolId.toolName;
            }

            result = await callMcpToolByServerNameAction(
              serverName,
              mcpToolName,
              toolArgs,
            );
          } catch (toolError) {
            console.error("Tool execution failed:", toolError);
            result = {
              error:
                toolError instanceof Error
                  ? toolError.message
                  : String(toolError),
            };
          }
        }

        // Update tool UI with result
        updateUIMessage(toolMsgId, {
          parts: [
            {
              type: `tool-${toolName}`,
              input: toolArgs,
              output: result,
              toolCallId: callId,
              state: "output-available",
            } satisfies ToolUIPart,
          ],
          completed: true,
        });

        const resultStr = JSON.stringify(result).slice(0, 15000);
        results.push(resultStr);

        // Add tool result to conversation history
        conversationHistoryRef.current.push({
          role: "tool",
          content: resultStr,
          tool_call_id: callId,
          name: toolName,
        });

        // Handle end conversation
        if (toolName === "endConversation") {
          appStore.setState((prev) => ({
            ...prev,
            voiceChat: {
              ...prev.voiceChat,
              agentId: undefined,
              isOpen: false,
            },
          }));
        }
      }

      return results;
    },
    [appendMessage, updateUIMessage, setTheme],
  );

  // -- Stream Groq response --
  const streamGroqResponse = useCallback(async () => {
    if (!sessionRef.current) return;

    const session = sessionRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Create assistant message placeholder
    const assistantMsgId = generateUUID();
    appendMessage(
      createUIMessage({
        id: assistantMsgId,
        role: "assistant",
        content: { type: "text", text: "" },
        completed: false,
      }),
    );

    let fullText = "";
    let pendingTtsText = "";
    let hasQueuedFirstTtsChunk = false;

    try {
      const response = await fetch("/api/voice/groq-konvo/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...conversationHistoryRef.current,
            {
              role: "system",
              content: buildLanguageLockInstruction(
                responseLanguageRef.current,
              ),
            },
          ],
          tools: session.tools,
          model: props?.model || session.groqModel,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Groq API error: ${response.status}: ${errorBody}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let pendingToolCalls: any[] = [];
      const toolCallsMap: Record<number, any> = {};
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;

            // Handle text content
            if (delta?.content) {
              fullText += delta.content;
              updateUIMessage(assistantMsgId, {
                parts: [{ type: "text", text: fullText }],
              });

              pendingTtsText += delta.content;
              const { chunks, remaining } = extractSpeechChunks(pendingTtsText);
              pendingTtsText = remaining;
              for (const chunk of chunks) {
                if (!hasQueuedFirstTtsChunk) {
                  hasQueuedFirstTtsChunk = true;
                }
                enqueueTtsText(chunk);
              }

              if (!hasQueuedFirstTtsChunk) {
                const firstChunk = popFirstChunkForFastStart(pendingTtsText);
                if (firstChunk?.chunk) {
                  hasQueuedFirstTtsChunk = true;
                  pendingTtsText = firstChunk.remaining;
                  enqueueTtsText(firstChunk.chunk);
                }
              }
            }

            // Handle tool calls
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallsMap[idx]) {
                  toolCallsMap[idx] = {
                    id: tc.id || "",
                    type: "function",
                    function: { name: "", arguments: "" },
                  };
                }
                if (tc.id) toolCallsMap[idx].id = tc.id;
                if (tc.function?.name)
                  toolCallsMap[idx].function.name += tc.function.name;
                if (tc.function?.arguments)
                  toolCallsMap[idx].function.arguments += tc.function.arguments;
              }
            }

            // Check for finish reason
            if (choice.finish_reason === "tool_calls") {
              pendingToolCalls = Object.values(toolCallsMap);
            }
          } catch (_parseErr) {
            // Skip malformed chunks
          }
        }
      }

      // Mark text message as completed
      if (fullText) {
        updateUIMessage(assistantMsgId, { completed: true });
        conversationHistoryRef.current.push({
          role: "assistant",
          content: fullText,
        });
        const { chunks } = extractSpeechChunks(pendingTtsText, true);
        for (const chunk of chunks) {
          if (!hasQueuedFirstTtsChunk) {
            hasQueuedFirstTtsChunk = true;
          }
          enqueueTtsText(chunk);
        }
      }

      // Handle tool calls
      if (pendingToolCalls.length > 0) {
        // Remove the placeholder text message if empty
        if (!fullText) {
          setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
        }

        // Add assistant message with tool calls to history
        conversationHistoryRef.current.push({
          role: "assistant",
          content: "",
          tool_calls: pendingToolCalls,
        });

        // Execute tools
        await executeToolCalls(pendingToolCalls);

        // Stream follow-up response after tool execution
        await streamGroqResponse();
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.error("Groq streaming error:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      updateUIMessage(assistantMsgId, {
        parts: [
          { type: "text", text: fullText || "Error generating response" },
        ],
        completed: true,
      });
    }
  }, [appendMessage, enqueueTtsText, executeToolCalls, updateUIMessage]);

  // -- Process user speech (after STT returns transcription) --
  const processUserSpeech = useCallback(
    async (transcript: string) => {
      if (!transcript.trim()) return;
      const detectedLanguage = detectSpeechLanguage(
        transcript,
        responseLanguageRef.current,
      );
      responseLanguageRef.current = detectedLanguage;
      sttLanguageHintRef.current = detectedLanguage;

      // Stop any current assistant playback
      stopPlayback();

      // Add user message to UI
      appendMessage(
        createUIMessage({
          role: "user",
          content: { type: "text", text: transcript },
          completed: true,
        }),
      );

      // Add to conversation history
      conversationHistoryRef.current.push({
        role: "user",
        content: transcript,
      });

      // Get Groq response
      await streamGroqResponse();
    },
    [appendMessage, streamGroqResponse, stopPlayback],
  );

  const processSttQueue = useCallback(async () => {
    if (isSttQueueProcessingRef.current) return;
    isSttQueueProcessingRef.current = true;

    try {
      while (sttQueueRef.current.length > 0 && sessionRef.current) {
        const audioBlob = sttQueueRef.current.shift();
        if (!audioBlob || audioBlob.size === 0) continue;

        const controller = new AbortController();
        sttRequestAbortRef.current = controller;

        try {
          const formData = new FormData();
          formData.append("audio", audioBlob, "utterance.wav");
          if (sttLanguageHintRef.current) {
            formData.append("languageCode", sttLanguageHintRef.current);
          }

          const response = await fetch("/api/voice/groq-konvo/stt", {
            method: "POST",
            body: formData,
            signal: controller.signal,
          });

          if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`STT API error: ${response.status}: ${errorBody}`);
          }

          const payload = (await response.json()) as { text?: string };
          const transcript = payload.text?.trim();
          if (!transcript) continue;

          await processUserSpeech(transcript);
        } catch (err: any) {
          if (err?.name === "AbortError") break;
          console.error("STT transcription error:", err);
          setError(
            err instanceof Error ? err : new Error("STT transcription failed"),
          );
        } finally {
          if (sttRequestAbortRef.current === controller) {
            sttRequestAbortRef.current = null;
          }
        }
      }
    } finally {
      isSttQueueProcessingRef.current = false;
    }
  }, [processUserSpeech]);

  const enqueueSttAudio = useCallback(
    (audioBlob: Blob) => {
      if (audioBlob.size === 0) return;
      sttQueueRef.current.push(audioBlob);
      void processSttQueue();
    },
    [processSttQueue],
  );

  const flushUtterance = useCallback(() => {
    const profile = micProfileRef.current;
    const chunks = utteranceChunksRef.current;
    utteranceChunksRef.current = [];
    if (chunks.length === 0) return;

    const mergedLength = chunks.reduce(
      (total, chunk) => total + chunk.length,
      0,
    );
    const utteranceDurationMs =
      (mergedLength / inputSampleRateRef.current) * 1000;
    if (utteranceDurationMs < profile.minUtteranceMs) return;

    const mergedSamples = new Float32Array(mergedLength);
    let offset = 0;
    for (const chunk of chunks) {
      mergedSamples.set(chunk, offset);
      offset += chunk.length;
    }

    const int16 = floatTo16BitPCM(mergedSamples);
    const wavBuffer = encodeWav(int16, inputSampleRateRef.current, 1);
    const wavBlob = new Blob([wavBuffer], { type: "audio/wav" });
    enqueueSttAudio(wavBlob);
  }, [enqueueSttAudio]);

  // -- Start microphone capture and KonvO STT --
  const startMicCapture = useCallback(async () => {
    if (!sessionRef.current) return;
    if (mediaStreamRef.current) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    mediaStreamRef.current = stream;
    utteranceChunksRef.current = [];
    preRollFramesRef.current = [];
    isCapturingUtteranceRef.current = false;
    lastVoiceAtRef.current = Date.now();
    noiseFloorRef.current = 0.0025;
    speechFrameCountRef.current = 0;
    bargeInFrameCountRef.current = 0;
    currentUtteranceDurationMsRef.current = 0;

    const audioContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
    audioContextRef.current = audioContext;
    inputSampleRateRef.current = audioContext.sampleRate;
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(1024, 1, 1);
    processorNodeRef.current = processor;

    processor.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);
      const frame = new Float32Array(inputData);
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      const now = Date.now();
      const frameDurationMs =
        (inputData.length / inputSampleRateRef.current) * 1000;

      const profile = micProfileRef.current;

      if (!isCapturingUtteranceRef.current && rms < noiseFloorRef.current * 4) {
        noiseFloorRef.current +=
          (rms - noiseFloorRef.current) * profile.vadNoiseAlpha;
      }

      const dynamicStartThreshold = Math.max(
        profile.vadMinStartRms,
        noiseFloorRef.current * (isPlayingRef.current ? 4.2 : 2.7),
      );
      const dynamicContinueThreshold = Math.max(
        profile.vadMinContinueRms,
        noiseFloorRef.current * (isPlayingRef.current ? 3.6 : 2.1),
      );
      const bargeInThreshold = Math.max(
        profile.vadBargeInMinRms,
        dynamicStartThreshold * profile.vadBargeInMultiplier,
      );
      const hasSpeechStartEnergy = rms >= dynamicStartThreshold;
      const hasSpeechContinueEnergy = rms >= dynamicContinueThreshold;
      const hasBargeInEnergy = rms >= bargeInThreshold;

      if (!isCapturingUtteranceRef.current) {
        preRollFramesRef.current.push(frame);
        if (preRollFramesRef.current.length > profile.vadPrerollFrames) {
          preRollFramesRef.current.shift();
        }
      }

      if (hasSpeechStartEnergy) {
        speechFrameCountRef.current += 1;
        setIsUserSpeaking(true);
      } else {
        speechFrameCountRef.current = 0;
        if (!isCapturingUtteranceRef.current) {
          setIsUserSpeaking(false);
        }
      }

      if (
        !isCapturingUtteranceRef.current &&
        speechFrameCountRef.current >= profile.vadStartFrames
      ) {
        isCapturingUtteranceRef.current = true;
        utteranceChunksRef.current = [...preRollFramesRef.current];
        preRollFramesRef.current = [];
        lastVoiceAtRef.current = now;
        currentUtteranceDurationMsRef.current =
          utteranceChunksRef.current.length * frameDurationMs;
      }

      if (isCapturingUtteranceRef.current) {
        utteranceChunksRef.current.push(frame);
        currentUtteranceDurationMsRef.current += frameDurationMs;
      }

      if (isPlayingRef.current) {
        if (hasBargeInEnergy) {
          bargeInFrameCountRef.current += 1;
        } else {
          bargeInFrameCountRef.current = 0;
        }
        if (
          bargeInFrameCountRef.current >= profile.vadBargeInFrames &&
          currentUtteranceDurationMsRef.current >= profile.vadBargeInMinMs
        ) {
          stopPlayback();
          bargeInFrameCountRef.current = 0;
        }
      } else {
        bargeInFrameCountRef.current = 0;
      }

      if (hasSpeechContinueEnergy) {
        lastVoiceAtRef.current = now;
      }

      if (!hasSpeechContinueEnergy && !isCapturingUtteranceRef.current) {
        setIsUserSpeaking(false);
      }

      if (
        isCapturingUtteranceRef.current &&
        now - lastVoiceAtRef.current > profile.vadSilenceMs
      ) {
        isCapturingUtteranceRef.current = false;
        speechFrameCountRef.current = 0;
        currentUtteranceDurationMsRef.current = 0;
        setIsUserSpeaking(false);
        flushUtterance();
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    setIsListening(true);
  }, [flushUtterance, stopPlayback]);

  // -- Stop microphone --
  const stopMicCapture = useCallback(async () => {
    if (isCapturingUtteranceRef.current) {
      isCapturingUtteranceRef.current = false;
      flushUtterance();
    }

    isCapturingUtteranceRef.current = false;

    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current.onaudioprocess = null;
      processorNodeRef.current = null;
    }

    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    utteranceChunksRef.current = [];
    preRollFramesRef.current = [];
    speechFrameCountRef.current = 0;
    bargeInFrameCountRef.current = 0;
    currentUtteranceDurationMsRef.current = 0;
    setIsListening(false);
    setIsUserSpeaking(false);
  }, [flushUtterance]);

  // -- Public API --
  const start = useCallback(async () => {
    if (isLoading || isActive) return;
    setIsLoading(true);
    setError(null);
    setMessages([]);
    conversationHistoryRef.current = [];
    responseLanguageRef.current = "en-IN";
    sttLanguageHintRef.current = null;
    sttQueueRef.current = [];
    ttsTextQueueRef.current = [];
    ttsAudioQueueRef.current = [];
    currentUtteranceDurationMsRef.current = 0;
    ttsGenerationRef.current += 1;

    try {
      // Fetch session config
      const response = await fetch("/api/voice/groq-konvo/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mentions: props?.toolMentions ?? [],
          agentId: props?.agentId,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const session = (await response.json()) as SessionConfig;
      sessionRef.current = session;

      // Initialize system prompt in conversation history
      conversationHistoryRef.current.push({
        role: "system",
        content: session.instructions,
      });

      // Start mic capture + STT
      await startMicCapture();

      setIsActive(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [
    isActive,
    isLoading,
    props?.agentId,
    props?.toolMentions,
    startMicCapture,
  ]);

  const stop = useCallback(async () => {
    // Abort any in-flight requests
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    sttRequestAbortRef.current?.abort();
    sttRequestAbortRef.current = null;
    sttQueueRef.current = [];
    responseLanguageRef.current = "en-IN";
    sttLanguageHintRef.current = null;
    preRollFramesRef.current = [];
    speechFrameCountRef.current = 0;
    bargeInFrameCountRef.current = 0;
    currentUtteranceDurationMsRef.current = 0;

    sessionRef.current = null;
    conversationHistoryRef.current = [];

    // Stop audio
    stopPlayback();
    await stopMicCapture();

    setIsActive(false);
    setIsListening(false);
    setIsUserSpeaking(false);
    setIsAssistantSpeaking(false);
  }, [stopPlayback, stopMicCapture]);

  const startListening = useCallback(async () => {
    if (!sessionRef.current) return;
    await startMicCapture();
  }, [startMicCapture]);

  const stopListening = useCallback(async () => {
    await stopMicCapture();
  }, [stopMicCapture]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

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
