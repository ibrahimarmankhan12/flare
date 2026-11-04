import {
  buildChatClientProofMessage,
  buildChatRequestMacMessage,
  CHAT_POW_ALGORITHM,
  CHAT_REQUEST_GUARD_VERSION,
  type ChatChallengeRequestPayload,
  type ChatChallengeResponse,
  type ChatRequestSecurityPayload,
} from "./chat-request-guard.shared";
import { stableJsonStringify } from "./stable-json";

const textEncoder = new TextEncoder();
const CHALLENGE_ENDPOINT = "/api/chat/challenge";
const POW_YIELD_EVERY = 256;
const POW_MAX_ATTEMPTS = 500_000;
const CHALLENGE_MIN_REMAINING_MS = 15_000;
const CLIENT_ID_STORAGE_KEY = "flare.chat.client.id";
const CLIENT_ID_PATTERN = /^[a-zA-Z0-9_-]{16,128}$/;

type ChatSecurityClientContext = {
  clientId: string;
  clientPublicKey: string;
  signProof: (message: string) => Promise<string>;
};

type EnabledChallenge = Extract<ChatChallengeResponse, { enabled: true }>;

type PreparedChallenge = {
  challenge: EnabledChallenge;
  clientContext: ChatSecurityClientContext;
  powPromise: Promise<{ nonce: string; hash: string }>;
};

let securityClientContextPromise: Promise<ChatSecurityClientContext> | null =
  null;
let preparedChallengePromise: Promise<PreparedChallenge | null> | null = null;
let consumeQueue: Promise<void> = Promise.resolve();

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const hmacSha256Hex = async ({
  key,
  value,
}: {
  key: string;
  value: string;
}): Promise<string> => {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    textEncoder.encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const hasLeadingZeroBitsFromHex = (hex: string, requiredBits: number) => {
  let bits = requiredBits;

  for (let i = 0; i < hex.length && bits > 0; i += 2) {
    const byte = Number.parseInt(hex.slice(i, i + 2), 16);
    const needed = Math.min(bits, 8);
    const shifted = byte >> (8 - needed);
    if (shifted !== 0) return false;
    bits -= needed;
  }

  return bits <= 0;
};

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const arrayBufferToBase64Url = (buffer: ArrayBuffer): string => {
  return bytesToBase64Url(new Uint8Array(buffer));
};

const randomClientId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return bytesToBase64Url(bytes);
};

const getClientId = (): string => {
  const existing = sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing && CLIENT_ID_PATTERN.test(existing)) {
    return existing;
  }
  const next = randomClientId();
  sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, next);
  return next;
};

const createSecurityClientContext =
  async (): Promise<ChatSecurityClientContext> => {
    if (!globalThis.crypto?.subtle) {
      throw new Error("Browser crypto is unavailable.");
    }

    const clientId = getClientId();
    const keyPair = (await crypto.subtle.generateKey(
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      false,
      ["sign", "verify"],
    )) as CryptoKeyPair;

    const publicKeySpki = await crypto.subtle.exportKey(
      "spki",
      keyPair.publicKey,
    );
    const clientPublicKey = arrayBufferToBase64Url(publicKeySpki);

    const signProof = async (message: string): Promise<string> => {
      const signature = await crypto.subtle.sign(
        {
          name: "ECDSA",
          hash: "SHA-256",
        },
        keyPair.privateKey,
        textEncoder.encode(message),
      );
      return arrayBufferToBase64Url(signature);
    };

    return {
      clientId,
      clientPublicKey,
      signProof,
    };
  };

const getSecurityClientContext =
  async (): Promise<ChatSecurityClientContext> => {
    if (!securityClientContextPromise) {
      securityClientContextPromise = createSecurityClientContext().catch(
        (error) => {
          securityClientContextPromise = null;
          throw error;
        },
      );
    }
    return securityClientContextPromise;
  };

const solveProofOfWork = async ({
  challengeId,
  difficulty,
  maxSolveMs,
}: {
  challengeId: string;
  difficulty: number;
  maxSolveMs: number;
}): Promise<{ nonce: string; hash: string }> => {
  const startedAt = Date.now();
  const noncePrefix = crypto
    .getRandomValues(new Uint32Array(1))[0]
    .toString(36);

  for (let attempt = 0; attempt < POW_MAX_ATTEMPTS; attempt += 1) {
    if (Date.now() - startedAt > maxSolveMs) {
      throw new Error("Proof-of-work timed out. Please try again.");
    }

    const nonce = `${noncePrefix}.${attempt.toString(36)}`;
    const hash = await sha256Hex(`${challengeId}:${nonce}`);
    if (hasLeadingZeroBitsFromHex(hash, difficulty)) {
      return { nonce, hash };
    }

    if (attempt % POW_YIELD_EVERY === 0) {
      await sleep(0);
    }
  }

  throw new Error(
    "Proof-of-work failed after max attempts. Please retry your message.",
  );
};

const getChallenge = async ({
  clientId,
  clientPublicKey,
}: ChatChallengeRequestPayload): Promise<ChatChallengeResponse> => {
  const response = await fetch(CHALLENGE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      clientId,
      clientPublicKey,
    } satisfies ChatChallengeRequestPayload),
    cache: "no-store",
    credentials: "include",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Unable to create a chat security challenge.");
  }

  return (await response.json()) as ChatChallengeResponse;
};

const hasUsableChallengeLifetime = (challenge: EnabledChallenge) => {
  return challenge.expiresAt - Date.now() > CHALLENGE_MIN_REMAINING_MS;
};

const buildPreparedChallenge = async (): Promise<PreparedChallenge | null> => {
  const clientContext = await getSecurityClientContext();
  const challenge = await getChallenge({
    clientId: clientContext.clientId,
    clientPublicKey: clientContext.clientPublicKey,
  });

  if (!challenge.enabled) {
    return null;
  }

  if (challenge.algorithm !== CHAT_POW_ALGORITHM) {
    throw new Error("Unsupported proof-of-work algorithm from server.");
  }

  const powPromise = solveProofOfWork({
    challengeId: challenge.challengeId,
    difficulty: challenge.difficulty,
    maxSolveMs: challenge.maxSolveMs,
  });

  return {
    challenge,
    clientContext,
    powPromise,
  };
};

const ensurePreparedChallenge = async (): Promise<PreparedChallenge | null> => {
  if (!preparedChallengePromise) {
    preparedChallengePromise = buildPreparedChallenge().catch((error) => {
      preparedChallengePromise = null;
      throw error;
    });
  }

  const prepared = await preparedChallengePromise;
  if (!prepared) return null;

  if (!hasUsableChallengeLifetime(prepared.challenge)) {
    preparedChallengePromise = null;
    return ensurePreparedChallenge();
  }

  return prepared;
};

const consumePreparedChallenge =
  async (): Promise<PreparedChallenge | null> => {
    const previous = consumeQueue;
    let releaseLock!: () => void;
    consumeQueue = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    await previous;

    try {
      const prepared = await ensurePreparedChallenge();
      preparedChallengePromise = null;
      return prepared;
    } finally {
      releaseLock();
    }
  };

export const prewarmChatRequestSecurity = async (): Promise<void> => {
  await ensurePreparedChallenge();
};

export const createChatRequestSecurityPayload = async ({
  requestBody,
  getCaptchaToken,
}: {
  requestBody: Record<string, unknown>;
  getCaptchaToken: (action: string) => Promise<string>;
}): Promise<ChatRequestSecurityPayload | undefined> => {
  const prepared = await consumePreparedChallenge();
  if (!prepared) {
    return undefined;
  }

  const { challenge, clientContext } = prepared;

  const requestHash = await sha256Hex(stableJsonStringify(requestBody));
  const [pow, captchaToken] = await Promise.all([
    prepared.powPromise,
    challenge.captchaRequired
      ? getCaptchaToken(challenge.action)
      : Promise.resolve(""),
  ]);
  const solvedAt = Date.now();
  if (solvedAt > challenge.expiresAt) {
    throw new Error("Security challenge expired. Please retry your message.");
  }
  const requestMacMessage = buildChatRequestMacMessage({
    challengeId: challenge.challengeId,
    challengeToken: challenge.challengeToken,
    requestHash,
    solvedAt,
  });
  const requestMac = await hmacSha256Hex({
    key: challenge.challengeToken,
    value: requestMacMessage,
  });
  const clientProofMessage = buildChatClientProofMessage({
    challengeId: challenge.challengeId,
    challengeToken: challenge.challengeToken,
    difficulty: challenge.difficulty,
    powNonce: pow.nonce,
    powHash: pow.hash,
    requestHash,
    solvedAt,
  });
  const clientProof = await clientContext.signProof(clientProofMessage);

  return {
    version: CHAT_REQUEST_GUARD_VERSION,
    challengeId: challenge.challengeId,
    challengeToken: challenge.challengeToken,
    difficulty: challenge.difficulty,
    powNonce: pow.nonce,
    powHash: pow.hash,
    requestHash,
    requestMac,
    captchaToken,
    clientId: clientContext.clientId,
    clientPublicKey: clientContext.clientPublicKey,
    clientProof,
    solvedAt,
  };
};
