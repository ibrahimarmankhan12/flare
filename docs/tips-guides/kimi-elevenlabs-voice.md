# Kimi + ElevenLabs Voice Mode Plan

## Goals
- Deliver a GPT-like, low-latency full duplex voice mode that remains entirely in-browser for capture/playback while delegating streaming ASR/TTS to ElevenLabs and text reasoning to Kimi K2.
- Preserve existing MCP tooling, safety guardrails, and UI affordances already used by the OpenAI realtime stack.
- Keep the implementation modular so additional providers can be swapped in without rewriting the full voice surface.

## Prerequisites & Checks
- Environment variables (see table below).
- Browser capability: WebRTC (preferred) or WebSocket fallback for audio streaming; feature-detect and gracefully degrade.
- CDN hosting for `/sounds/*` and upcoming chime files to avoid blocking the main voice flow.

### Required environment variables
| Variable | Required | Purpose | Notes |
| --- | --- | --- | --- |
| `ELEVENLABS_API_KEY` | ✅ | Authenticates calls to ElevenLabs ConvAI APIs. | Issue single-use WebRTC tokens server-side only. |
| `ELEVENLABS_AGENT_ID` | ✅ | Identifies the ElevenLabs ConvAI agent that performs STT/TTS. | Configure languages, client tools, and voice style in the ElevenLabs UI. |
| `ELEVENLABS_VOICE_ID` | ➖ | Overrides the ConvAI agent voice. | Leave unset to use the default voice defined in the agent. |
| `KIMI_API_KEY` or `GROQ_API_KEY` | ✅ | Authenticates Kimi K2 requests for text generation. | If you are proxying Kimi via Groq, the existing `GROQ_API_KEY` is enough. |
| `KIMI_BASE_URL` | ➖ | Custom Kimi endpoint. | Defaults to `https://api.moonshot.cn/v1`; leave unset when using Groq. |
| `NO_HTTPS` | ➖ | Enables local http when running Next.js dev server. | Needed if browser cannot access localhost via https while testing WebRTC. |

> Tip: run `pnpm initial:env` to copy `.env.example`, then append the variables above. Use a dedicated ElevenLabs API key with limited scopes if possible.

## Architecture Overview
1. **Voice Provider Registry** – `lib/ai/speech/providers.ts` exposes a map of provider ids to React hooks implementing `VoiceChatSession`. This lets `ChatBotVoice` stay provider-agnostic.
2. **Client Hook (`useKimiElevenLabsVoiceChat`)** – Handles microphone capture, WebRTC signaling to a new `/api/voice/kimi-elevenlabs/session` endpoint, and dispatches UI messages as transcripts/LLM deltas arrive.
3. **Server Session Broker** – Next.js route coordinates:
   - Creates a signed ElevenLabs Realtime session (for STT+TTS) and relays SDP offers/answers between browser and ElevenLabs.
   - Streams recognized user text to a lightweight worker (Edge runtime) that calls the Kimi responses API with `stream: true`.
   - Pushes each assistant delta back to ElevenLabs as text-to-speech frames so the browser hears synthesized audio instantly.
4. **Tool/Agent Binding** – Re-use `buildSpeechSystemPrompt` + MCP tool plumbing by emitting tool events from the Kimi response stream, mirroring the OpenAI shape.
5. **State Store** – Extend `voiceChat.options` with provider-specific configs (voice id, language, stability) and persist a preferred provider id for quick switching.

## Implementation Steps
1. **Foundation & Abstraction**
   - Add `VOICE_CHAT_PROVIDERS` registry and update `ChatBotVoice` to pick hooks via `voiceChat.options.provider` (default to existing OpenAI hook).
   - Co-locate types for provider metadata (`label`, feature flags, supported languages) for UI presentation.
2. **Server Session Endpoint**
   - New route: `src/app/api/voice/kimi-elevenlabs/session/route.ts` (Edge runtime) that issues an ElevenLabs realtime session using REST, injects custom tool instructions, and exposes a short-lived client secret to the browser.
   - Add safeguard for missing env vars and return actionable error messages surfaced in the voice UI.
3. **Client Hook**
   - Create `src/lib/ai/speech/kimi-elevenlabs/use-voice-chat.kimi-elevenlabs.ts` implementing `VoiceChatSession`.
   - Responsibilities: microphone lifecycle, WebRTC negotiation, translating ElevenLabs transcript events into `UIMessageWithCompleted`, forwarding assistant tool calls to MCP, and resuming mic capture after tool invocations.
4. **Kimi Stream Worker**
   - Inside the new API route (or a helper in `src/lib/ai/speech/kimi-elevenlabs/server.ts`), open a streaming SSE request to `POST /v1/responses` with `{ model: "kimi-k2.5", stream: true }` and pipe deltas both to the UI (via data channel message) and to ElevenLabs `conversation_v2/output_audio_buffer`.
   - Support interruption: when user resumes speaking, cancel the inflight Kimi request and flush audio buffer.
5. **UI & Store Enhancements**
   - Surface a "Voice Provider" chip/button in `ChatBotVoice` settings (simple dropdown) with descriptions.
   - Persist provider selection + last-used agent, expose advanced options (voice style, filler management) when provider == ElevenLabs.
6. **Testing & QA**
   - Add Vitest to cover provider registry + error handling.
   - Provide manual test checklist (latency target < 350ms first token, reconnection, MCP tool invocation, end-call flow).

## Manual test checklist

1. **Environment sanity**
   - `pnpm dev` with `NO_HTTPS=1` (or a proper TLS cert) to avoid insecure WebRTC failures.
   - Open `/api/voice/kimi-elevenlabs/session` in the browser console and verify it returns a JSON payload with a `token`, `instructions`, and `hasKimiCredentials: true`.

2. **Provider toggle**
   - Launch the Voice drawer, open the settings cog, switch between "OpenAI Realtime" and "Kimi + ElevenLabs", and confirm the chosen provider persists after closing/reopening the drawer.
   - Start a session with each provider to ensure switching tears down the previous WebRTC room cleanly (no stuck microphones).

3. **Audio path**
   - Speak for at least 20 seconds; ensure the ElevenLabs waveform animates and transcripts appear in the UI with <350 ms first-token latency.
   - Trigger a tool call (e.g., "Use the browser to search for ...") and observe that MCP approval flows complete and resume listening afterwards.

4. **Error handling**
   - Revoke `ELEVENLABS_API_KEY` temporarily to confirm the client surfaces a toast + Alert, then reinstate and retry.
   - Toggle airplane mode mid-call to check reconnection and mic state resets.

5. **Regression checks**
   - OpenAI realtime provider still starts, stops, and honors mic mute/unmute shortcuts.
   - Keyboard shortcut `Shift` + `P` (see `Shortcuts.toggleVoiceChat`) opens the drawer without raising duplicate sessions.

## Done Definition
- Voice drawer can toggle between OpenAI and Kimi+ElevenLabs without reload.
- Speech transactions recover from network drops (auto retry, toast on fatal errors).
- Tool calls, shortcuts, and agent selection mirror behavior across providers.
- Documented fallback logic for browsers that block WebRTC mic access.

---
This plan should be updated as we wire real telemetry; keep it close to the code by referencing this file in any related PRs.
