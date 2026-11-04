export const CHAT_REQUEST_GUARD_VERSION = 1;
export const CHAT_POW_ALGORITHM = "sha256-leading-zero-bits-v1";
export const CHAT_CLIENT_PROOF_ALGORITHM = "ecdsa-p256-sha256-v1";
export const CHAT_REQUEST_MAC_ALGORITHM = "hmac-sha256-v1";
export const CHAT_TURNSTILE_ACTION = "chat_send";

export type ChatChallengeRequestPayload = {
  clientId: string;
  clientPublicKey: string;
};

export type ChatRequestSecurityPayload = {
  version: number;
  challengeId: string;
  challengeToken: string;
  difficulty: number;
  powNonce: string;
  powHash: string;
  requestHash: string;
  requestMac: string;
  captchaToken: string;
  clientId: string;
  clientPublicKey: string;
  clientProof: string;
  solvedAt: number;
};

export type ChatChallengeResponse =
  | {
      enabled: false;
    }
  | {
      enabled: true;
      version: number;
      algorithm: string;
      action: string;
      challengeId: string;
      challengeToken: string;
      difficulty: number;
      issuedAt: number;
      expiresAt: number;
      maxSolveMs: number;
      captchaRequired: boolean;
    };

export type ChatChallengeTokenPayload = {
  v: number;
  cid: string;
  uid: string;
  sid: string;
  uah: string;
  iph: string;
  cli: string;
  pkh: string;
  diff: number;
  cap: 0 | 1;
  iat: number;
  exp: number;
};

export const buildChatClientProofMessage = ({
  challengeId,
  challengeToken,
  difficulty,
  powNonce,
  powHash,
  requestHash,
  solvedAt,
}: {
  challengeId: string;
  challengeToken: string;
  difficulty: number;
  powNonce: string;
  powHash: string;
  requestHash: string;
  solvedAt: number;
}) =>
  [
    `v=${CHAT_REQUEST_GUARD_VERSION}`,
    `alg=${CHAT_CLIENT_PROOF_ALGORITHM}`,
    `cid=${challengeId}`,
    `ct=${challengeToken}`,
    `diff=${difficulty}`,
    `nonce=${powNonce}`,
    `pow=${powHash}`,
    `req=${requestHash}`,
    `ts=${solvedAt}`,
  ].join("\n");

export const buildChatRequestMacMessage = ({
  challengeId,
  challengeToken,
  requestHash,
  solvedAt,
}: {
  challengeId: string;
  challengeToken: string;
  requestHash: string;
  solvedAt: number;
}) =>
  [
    `v=${CHAT_REQUEST_GUARD_VERSION}`,
    `alg=${CHAT_REQUEST_MAC_ALGORITHM}`,
    `cid=${challengeId}`,
    `ct=${challengeToken}`,
    `req=${requestHash}`,
    `ts=${solvedAt}`,
  ].join("\n");
