import { ChatRequestSecuritySchema } from "app-types/chat";
import { z } from "zod";
import {
  CHAT_PAYLOAD_CIPHER_ALGORITHM,
  CHAT_PAYLOAD_CIPHER_VERSION,
  decryptChatPayload,
} from "./chat-payload-obfuscation";

const EncryptedChatPayloadSchema = z.object({
  version: z.literal(CHAT_PAYLOAD_CIPHER_VERSION),
  algorithm: z.literal(CHAT_PAYLOAD_CIPHER_ALGORITHM),
  salt: z.string().regex(/^[a-fA-F0-9]{32}$/),
  iv: z.string().regex(/^[a-fA-F0-9]{24}$/),
  ciphertext: z.string().regex(/^[a-fA-F0-9]{2,}$/),
});

const EncryptedChatRequestEnvelopeSchema = z.object({
  security: ChatRequestSecuritySchema,
  encryptedPayload: EncryptedChatPayloadSchema,
});

type DecryptResult =
  | {
      ok: true;
      body: unknown;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

export const resolveEncryptedChatRequestBody = async (
  body: unknown,
): Promise<DecryptResult> => {
  if (!body || typeof body !== "object") {
    return { ok: true, body };
  }

  const envelopeCandidate = body as Record<string, unknown>;
  if (!("encryptedPayload" in envelopeCandidate)) {
    return { ok: true, body };
  }

  const envelopeResult = EncryptedChatRequestEnvelopeSchema.safeParse(body);
  if (!envelopeResult.success) {
    return {
      ok: false,
      status: 400,
      code: "invalid-encrypted-payload",
      message: "Invalid encrypted request payload.",
    };
  }

  try {
    const decryptedPayload = await decryptChatPayload({
      encryptedPayload: envelopeResult.data.encryptedPayload,
      challengeToken: envelopeResult.data.security.challengeToken,
    });
    return {
      ok: true,
      body: {
        ...decryptedPayload,
        security: envelopeResult.data.security,
      },
    };
  } catch {
    return {
      ok: false,
      status: 400,
      code: "encrypted-payload-decrypt-failed",
      message: "Unable to decrypt chat payload. Please retry.",
    };
  }
};
