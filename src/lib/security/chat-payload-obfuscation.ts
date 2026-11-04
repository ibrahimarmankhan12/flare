import { stableJsonStringify } from "./stable-json";

export const CHAT_PAYLOAD_CIPHER_VERSION = 1 as const;
export const CHAT_PAYLOAD_CIPHER_ALGORITHM = "aes-256-gcm-v1" as const;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const HEX_PATTERN = /^[a-fA-F0-9]+$/;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const AAD_BYTES = textEncoder.encode("flare-chat-payload-v1");

export type EncryptedChatPayload = {
  version: typeof CHAT_PAYLOAD_CIPHER_VERSION;
  algorithm: typeof CHAT_PAYLOAD_CIPHER_ALGORITHM;
  salt: string;
  iv: string;
  ciphertext: string;
};

const ensureCrypto = () => {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web crypto is unavailable.");
  }
  return globalThis.crypto.subtle;
};

const bytesToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const hexToBytes = (hex: string): Uint8Array => {
  if (!HEX_PATTERN.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Invalid encrypted payload encoding.");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
};

const deriveKey = async ({
  challengeToken,
  saltHex,
  usage,
}: {
  challengeToken: string;
  saltHex: string;
  usage: "encrypt" | "decrypt";
}) => {
  const subtle = ensureCrypto();
  const keySeed = textEncoder.encode(
    `chat-payload:${CHAT_PAYLOAD_CIPHER_VERSION}:${challengeToken}:${saltHex}`,
  );
  const digest = await subtle.digest("SHA-256", keySeed);
  return subtle.importKey(
    "raw",
    digest,
    {
      name: "AES-GCM",
    },
    false,
    [usage],
  );
};

export const encryptChatPayload = async ({
  payload,
  challengeToken,
}: {
  payload: Record<string, unknown>;
  challengeToken: string;
}): Promise<EncryptedChatPayload> => {
  const subtle = ensureCrypto();
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const saltHex = bytesToHex(salt);
  const key = await deriveKey({
    challengeToken,
    saltHex,
    usage: "encrypt",
  });

  const plaintext = textEncoder.encode(stableJsonStringify(payload));
  const ciphertext = await subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(AAD_BYTES),
      tagLength: 128,
    },
    key,
    plaintext,
  );

  return {
    version: CHAT_PAYLOAD_CIPHER_VERSION,
    algorithm: CHAT_PAYLOAD_CIPHER_ALGORITHM,
    salt: saltHex,
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(ciphertext)),
  };
};

export const decryptChatPayload = async ({
  encryptedPayload,
  challengeToken,
}: {
  encryptedPayload: EncryptedChatPayload;
  challengeToken: string;
}): Promise<Record<string, unknown>> => {
  if (encryptedPayload.version !== CHAT_PAYLOAD_CIPHER_VERSION) {
    throw new Error("Unsupported encrypted payload version.");
  }
  if (encryptedPayload.algorithm !== CHAT_PAYLOAD_CIPHER_ALGORITHM) {
    throw new Error("Unsupported encrypted payload algorithm.");
  }

  const iv = hexToBytes(encryptedPayload.iv);
  if (iv.length !== IV_BYTES) {
    throw new Error("Invalid encrypted payload iv.");
  }

  const key = await deriveKey({
    challengeToken,
    saltHex: encryptedPayload.salt,
    usage: "decrypt",
  });

  const subtle = ensureCrypto();
  const plaintext = await subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(AAD_BYTES),
      tagLength: 128,
    },
    key,
    toArrayBuffer(hexToBytes(encryptedPayload.ciphertext)),
  );

  const parsed = JSON.parse(
    textDecoder.decode(new Uint8Array(plaintext)),
  ) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid encrypted chat payload.");
  }
  return parsed as Record<string, unknown>;
};
