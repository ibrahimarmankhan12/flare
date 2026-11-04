import { NextRequest } from "next/server";
import { getSession } from "auth/server";
import globalLogger from "lib/logger";
import { colorize } from "consola/utils";

export const runtime = "nodejs";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", "STT API: "),
});

// Self-hosted Sarvam AI Proxy (konvo.flare-labs.tech)
const SARVAM_PROXY_URL = (
  process.env.SARVAM_PROXY_URL || "https://konvo.flare-labs.tech"
).replace(/\/+$/, "");
const SARVAM_PROXY_API_KEY = process.env.SARVAM_PROXY_API_KEY || "";

const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "video/webm",
]);

const normalizeAudioMimeType = (rawMimeType: string): string => {
  const baseMimeType = rawMimeType.toLowerCase().split(";")[0].trim();
  if (SUPPORTED_AUDIO_MIME_TYPES.has(baseMimeType)) {
    return baseMimeType;
  }

  if (baseMimeType.startsWith("audio/webm")) return "audio/webm";
  if (baseMimeType.startsWith("video/webm")) return "video/webm";
  if (baseMimeType.startsWith("audio/mp4")) return "audio/mp4";

  return "audio/webm";
};

const extensionByMimeType: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "video/webm": "webm",
};

const extractTranscriptionText = (parsed: any): string => {
  const textParts: string[] = [];
  if (typeof parsed?.transcript === "string") {
    textParts.push(parsed.transcript);
  }
  if (typeof parsed?.text === "string") {
    textParts.push(parsed.text);
  }
  if (typeof parsed?.data?.transcript === "string") {
    textParts.push(parsed.data.transcript);
  }
  if (typeof parsed?.data?.text === "string") {
    textParts.push(parsed.data.text);
  }
  if (Array.isArray(parsed?.segments)) {
    textParts.push(
      parsed.segments
        .map((segment: any) => segment?.transcript || segment?.text || "")
        .join(" ")
        .trim(),
    );
  }
  if (Array.isArray(parsed?.data?.segments)) {
    textParts.push(
      parsed.data.segments
        .map((segment: any) => segment?.transcript || segment?.text || "")
        .join(" ")
        .trim(),
    );
  }

  return textParts.join(" ").replace(/\s+/g, " ").trim();
};

// ---- Sarvam STT via proxy ----
const sarvamStt = async (audioFile: File): Promise<Response> => {
  const form = new FormData();
  form.append("file", audioFile);
  form.append("model", "saaras:v3");

  try {
    const res = await fetch(`${SARVAM_PROXY_URL}/v1/audio/transcriptions`, {
      method: "POST",
      headers: SARVAM_PROXY_API_KEY
        ? { Authorization: `Bearer ${SARVAM_PROXY_API_KEY}` }
        : undefined,
      body: form,
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.error(
        `Sarvam STT error (${res.status}): ${errText.slice(0, 300)}`,
      );
      return new Response(
        JSON.stringify({
          error: `Sarvam STT failed (${res.status})`,
          details: errText,
        }),
        { status: res.status },
      );
    }

    const data: any = await res.json();
    const text = extractTranscriptionText(data);

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    if (error?.name === "TimeoutError") {
      return new Response(
        JSON.stringify({ error: "Sarvam STT request timed out" }),
        { status: 504 },
      );
    }
    throw error;
  }
};

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.formData();
    const audio = body.get("audio");
    if (!(audio instanceof File)) {
      return new Response(JSON.stringify({ error: "audio file is required" }), {
        status: 400,
      });
    }

    // Normalize the audio file for consistent handling
    const normalizedMimeType = normalizeAudioMimeType(audio.type);
    const audioBytes = await audio.arrayBuffer();
    const normalizedExtension =
      extensionByMimeType[normalizedMimeType] ?? "webm";
    const normalizedAudioFile = new File(
      [audioBytes],
      `utterance.${normalizedExtension}`,
      { type: normalizedMimeType },
    );

    return sarvamStt(normalizedAudioFile);
  } catch (error: any) {
    logger.error(error);
    return new Response(
      JSON.stringify({ error: error?.message ?? "Unknown error" }),
      { status: 500 },
    );
  }
}
