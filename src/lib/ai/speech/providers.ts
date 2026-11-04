import { VoiceChatHook } from "lib/ai/speech";
import { useOpenAIVoiceChat } from "./open-ai/use-voice-chat.openai";
import { useKonvOVoiceChat } from "./konvo/use-voice-chat-konvo";

export type VoiceChatProviderId = "openai" | "konvo";

const PROVIDER_MAP: Record<VoiceChatProviderId, VoiceChatHook> = {
  openai: useOpenAIVoiceChat,
  konvo: useKonvOVoiceChat,
};

export function resolveVoiceChatProvider(provider?: string): VoiceChatHook {
  if (provider && provider in PROVIDER_MAP) {
    return PROVIDER_MAP[provider as VoiceChatProviderId];
  }
  return PROVIDER_MAP.openai;
}
