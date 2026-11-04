import { NextRequest } from "next/server";
import { getSession } from "auth/server";
import globalLogger from "lib/logger";
import { colorize } from "consola/utils";

export const runtime = "nodejs";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", "TTS API: "),
});

// Self-hosted Sarvam AI Proxy (konvo.flare-labs.tech)
const SARVAM_PROXY_URL = (
  process.env.SARVAM_PROXY_URL || "https://konvo.flare-labs.tech"
).replace(/\/+$/, "");
const SARVAM_PROXY_API_KEY = process.env.SARVAM_PROXY_API_KEY || "";

const sarvamHeaders = (extra: Record<string, string> = {}) => {
  const h: Record<string, string> = { ...extra };
  if (SARVAM_PROXY_API_KEY) {
    h["Authorization"] = `Bearer ${SARVAM_PROXY_API_KEY}`;
  }
  return h;
};

const SARVAM_SPEAKERS = new Set(["shubh", "shreya", "manan", "ishita"]);

// Map legacy KonvO/Voicebox voice names to Sarvam speakers
const VOICE_MAP: Record<string, string> = {
  anushka: "ishita",
  manisha: "ishita",
  vidya: "shreya",
  arya: "manan",
  karun: "shubh",
  hitesh: "shubh",
  ankit: "manan",
  abhilash: "shubh",
  // OpenAI-style voices
  alloy: "shubh",
  echo: "shubh",
  fable: "shreya",
  onyx: "manan",
  nova: "ishita",
  shimmer: "shreya",
};

interface TtsRequest {
  text?: string;
  voice?: string;
  targetLanguageCode?: string;
  model?: string;
  pace?: number;
}

const resolveSpeaker = (voice?: string): string => {
  const normalized = voice?.trim().toLowerCase() || "shubh";
  if (SARVAM_SPEAKERS.has(normalized)) return normalized;
  return VOICE_MAP[normalized] || "shubh";
};

// Detect language heuristic
const detectLanguage = (text: string): string => {
  const devanagariCount = (text.match(/[\u0900-\u097f]/g) || []).length;
  const latinCount = (text.match(/[A-Za-z]/g) || []).length;
  if (devanagariCount >= 2 && devanagariCount >= latinCount / 2) return "hi-IN";
  return "en-IN";
};

// ---- Sarvam TTS ----
const sarvamTts = async (body: TtsRequest): Promise<Response> => {
  const text = body.text?.trim();
  if (!text) {
    return new Response(JSON.stringify({ error: "text is required" }), {
      status: 400,
    });
  }

  const speaker = resolveSpeaker(body.voice);
  const lang = body.targetLanguageCode || detectLanguage(text);
  const pace =
    typeof body.pace === "number"
      ? Math.min(2.0, Math.max(0.5, body.pace))
      : 1.1;

  try {
    const res = await fetch(`${SARVAM_PROXY_URL}/api/tts`, {
      method: "POST",
      headers: sarvamHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        text,
        speaker,
        lang,
        model: body.model?.trim() || "bulbul:v3-beta",
        pace,
        sample_rate: 22050,
        temperature: 0.6,
        codec: "mp3",
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      logger.error(`Sarvam TTS error (${res.status}): ${err.slice(0, 300)}`);
      return new Response(
        JSON.stringify({ error: `Sarvam TTS failed (${res.status})` }),
        { status: 502 },
      );
    }

    // Sarvam returns raw audio bytes (MP3)
    const buffer = await res.arrayBuffer();
    const audioBase64 = Buffer.from(buffer).toString("base64");
    return new Response(
      JSON.stringify({ audioBase64, mimeType: "audio/mpeg" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    if (error?.name === "TimeoutError") {
      return new Response(
        JSON.stringify({ error: "Sarvam TTS request timed out" }),
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

    const body = (await request.json()) as TtsRequest;
    const text = body.text?.trim();

    if (!text) {
      return new Response(JSON.stringify({ error: "text is required" }), {
        status: 400,
      });
    }

    return sarvamTts(body);
  } catch (error: any) {
    logger.error(error);
    return new Response(
      JSON.stringify({ error: error?.message ?? "Unknown error" }),
      { status: 500 },
    );
  }
}
