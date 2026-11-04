import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
  webcrypto,
} from "node:crypto";
import { ChatRequestSecuritySchema } from "app-types/chat";
import { serverCache } from "lib/cache";
import { IS_DEV } from "lib/const";
import {
  CHAT_POW_ALGORITHM,
  CHAT_REQUEST_GUARD_VERSION,
  CHAT_TURNSTILE_ACTION,
  type ChatChallengeRequestPayload,
  type ChatChallengeResponse,
  type ChatChallengeTokenPayload,
  buildChatClientProofMessage,
  buildChatRequestMacMessage,
} from "./chat-request-guard.shared";
import { stableJsonStringify } from "./stable-json";

const CHALLENGE_RATE_WINDOW_MS = 60_000;
const REQUEST_RATE_WINDOW_MS = 60_000;
const REQUEST_BURST_WINDOW_MS = 10_000;
const USED_CHALLENGE_PREFIX = "chat-security:used-challenge";
const CHALLENGE_RATE_PREFIX = "chat-security:challenge-rate";
const REQUEST_RATE_PREFIX = "chat-security:request-rate";
const REQUEST_BURST_PREFIX = "chat-security:request-burst";
const CAPTCHA_GRACE_PREFIX = "chat-security:captcha-grace";
const CHALLENGE_ID_BYTES = 16;
const CLIENT_ID_PATTERN = /^[a-zA-Z0-9_-]{16,128}$/;
const CLIENT_PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_-]{80,600}$/;
const CLIENT_PROOF_PATTERN = /^[A-Za-z0-9_-]{40,2048}$/;
const textEncoder = new TextEncoder();
const CAPTCHA_MODES = ["always", "adaptive", "off"] as const;
const SESSION_BINDING_MODES = ["off", "soft", "strict"] as const;

type CaptchaMode = (typeof CAPTCHA_MODES)[number];
type SessionBindingMode = (typeof SESSION_BINDING_MODES)[number];

type GuardConfig = {
  enabled: boolean;
  captchaMode: CaptchaMode;
  captchaEscalationThreshold: number;
  captchaGraceMs: number;
  sessionBindingMode: SessionBindingMode;
  challengeTtlMs: number;
  powDifficultyBase: number;
  powDifficultyHigh: number;
  powDifficultyEscalationThreshold: number;
  powMaxSolveMs: number;
  maxChallengesPerMinutePerIp: number;
  maxRequestsPerMinutePerUser: number;
  maxRequestsPerMinutePerIp: number;
  maxRequestsPer10SecPerUser: number;
};

type GuardFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

type GuardSuccess<T = undefined> = T extends undefined
  ? { ok: true }
  : { ok: true; data: T };

export type GuardResult<T = undefined> = GuardSuccess<T> | GuardFailure;

const getGuardConfig = (): GuardConfig => {
  return {
    enabled: !IS_DEV,
    captchaMode: "adaptive",
    captchaEscalationThreshold: 40,
    captchaGraceMs: 900_000,
    sessionBindingMode: "off",
    challengeTtlMs: 120_000,
    powDifficultyBase: 7,
    powDifficultyHigh: 10,
    powDifficultyEscalationThreshold: 40,
    powMaxSolveMs: 12_000,
    maxChallengesPerMinutePerIp: 120,
    maxRequestsPerMinutePerUser: 120,
    maxRequestsPerMinutePerIp: 240,
    maxRequestsPer10SecPerUser: 36,
  };
};

const fail = (status: number, code: string, message: string): GuardFailure => ({
  ok: false,
  status,
  code,
  message,
});

const toKey = (prefix: string, id: string, windowMs: number, now: number) => {
  return `${prefix}:${id}:${Math.floor(now / windowMs)}`;
};

const incrementWindowCounter = async (
  key: string,
  windowMs: number,
): Promise<number> => {
  const current = (await serverCache.get<number>(key)) ?? 0;
  const next = current + 1;
  await serverCache.set(key, next, windowMs + 2_000);
  return next;
};

const hashHex = (value: string) => {
  return createHash("sha256").update(value).digest("hex");
};

const sign = (value: string, secret: string): Buffer => {
  return createHmac("sha256", secret).update(value).digest();
};

const safeCompareHex = (a: string, b: string): boolean => {
  try {
    const aBuf = Buffer.from(a, "hex");
    const bBuf = Buffer.from(b, "hex");
    return (
      aBuf.length === bBuf.length &&
      aBuf.length > 0 &&
      timingSafeEqual(aBuf, bBuf)
    );
  } catch {
    return false;
  }
};

const getSecuritySecret = (): string | null => {
  return (
    process.env.CHAT_REQUEST_GUARD_SECRET ||
    process.env.BETTER_AUTH_SECRET ||
    null
  );
};

const getExpectedOrigins = (request: Request): Set<string> => {
  if (!IS_DEV) {
    const productionOrigins = [
      // Default Flare domains
      "https://flare-sh.tech",
      "https://www.flare-sh.tech",
    ];
    // Additional production origins from env (comma-separated, e.g., "https://flare-sh.tech,https://app.example.com")
    const extraOrigins = process.env.CHAT_GUARD_ALLOWED_ORIGINS;
    if (extraOrigins) {
      extraOrigins.split(",").forEach((o) => {
        try {
          productionOrigins.push(new URL(o.trim()).origin);
        } catch {
          // ignore malformed
        }
      });
    }
    return new Set<string>(productionOrigins);
  }

  const origins = new Set<string>();

  const addOrigin = (value: string | undefined) => {
    if (!value) return;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Ignore malformed origin values from env.
    }
  };

  addOrigin(process.env.FLARE_AUTH_URL);
  addOrigin(process.env.NEXT_PUBLIC_BASE_URL);

  try {
    origins.add(new URL(request.url).origin);
  } catch {
    // Ignore malformed request URLs.
  }

  return origins;
};

const getExpectedHostname = (request: Request): string | null => {
  const raw =
    process.env.FLARE_AUTH_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    request.url;

  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
};

const getRemoteIp = (request: Request): string => {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0]?.trim() || "unknown";
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "unknown";
};

const normalizeIpForCompare = (ip: string | null | undefined): string => {
  let normalized = (ip || "").trim().toLowerCase();
  if (!normalized) return "";

  // Some upstreams persist X-Forwarded-For chains in session storage.
  // Always compare using the first hop (original client IP).
  if (normalized.includes(",")) {
    normalized = normalized.split(",")[0]?.trim() || "";
  }

  // Handle bracketed IPv6 with optional port: [::1]:1234
  const bracketMatch = normalized.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketMatch?.[1]) {
    normalized = bracketMatch[1];
  } else if (normalized.includes(".") && /:\d+$/.test(normalized)) {
    // Handle IPv4 with port: 1.2.3.4:1234
    normalized = normalized.replace(/:\d+$/, "");
  }

  if (!normalized) return "";
  if (normalized === "unknown") return "";
  if (normalized.startsWith("::ffff:")) {
    return normalized.slice("::ffff:".length);
  }
  return normalized;
};

const getUserAgentSignature = (
  userAgent: string | null | undefined,
): string => {
  const ua = (userAgent || "").toLowerCase();
  if (!ua) return "";

  const browser = ua.includes("edg/")
    ? "edge"
    : ua.includes("opr/")
      ? "opera"
      : ua.includes("chrome/") && !ua.includes("edg/")
        ? "chrome"
        : ua.includes("firefox/")
          ? "firefox"
          : ua.includes("safari/") && !ua.includes("chrome/")
            ? "safari"
            : "other";

  const platform = ua.includes("android")
    ? "android"
    : ua.includes("iphone") || ua.includes("ipad")
      ? "ios"
      : ua.includes("windows")
        ? "windows"
        : ua.includes("mac os x")
          ? "mac"
          : ua.includes("linux")
            ? "linux"
            : "other";

  return `${browser}:${platform}`;
};

const getSessionBindingDrift = ({
  sessionIpAddress,
  sessionUserAgent,
  requestIp,
  requestUserAgent,
}: {
  sessionIpAddress: string | null | undefined;
  sessionUserAgent: string | null | undefined;
  requestIp: string;
  requestUserAgent: string;
}) => {
  const expectedIp = normalizeIpForCompare(sessionIpAddress);
  const actualIp = normalizeIpForCompare(requestIp);
  const ipMismatch =
    Boolean(expectedIp) && Boolean(actualIp) && expectedIp !== actualIp;

  const expectedUa = getUserAgentSignature(sessionUserAgent);
  const actualUa = getUserAgentSignature(requestUserAgent);
  const uaMismatch =
    Boolean(expectedUa) && Boolean(actualUa) && expectedUa !== actualUa;

  return {
    ipMismatch,
    uaMismatch,
    hasMismatch: ipMismatch || uaMismatch,
  };
};

const createChallengeToken = ({
  payload,
  secret,
}: {
  payload: ChatChallengeTokenPayload;
  secret: string;
}) => {
  const payloadRaw = stableJsonStringify(payload);
  const payloadEncoded = Buffer.from(payloadRaw, "utf8").toString("base64url");
  const signatureEncoded = sign(payloadRaw, secret).toString("base64url");
  return `${payloadEncoded}.${signatureEncoded}`;
};

const parseChallengeToken = ({
  token,
  secret,
}: {
  token: string;
  secret: string;
}): GuardResult<ChatChallengeTokenPayload> => {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return fail(403, "invalid-challenge-token", "Invalid challenge token.");
  }

  const [payloadEncoded, signatureEncoded] = parts;
  const payloadRaw = Buffer.from(payloadEncoded, "base64url").toString("utf8");
  const providedSignature = Buffer.from(signatureEncoded, "base64url");
  const expectedSignature = sign(payloadRaw, secret);

  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return fail(403, "invalid-challenge-signature", "Invalid challenge token.");
  }

  try {
    const payload = JSON.parse(payloadRaw) as ChatChallengeTokenPayload;
    return { ok: true, data: payload };
  } catch {
    return fail(403, "invalid-challenge-payload", "Invalid challenge payload.");
  }
};

const hasLeadingZeroBits = (digest: Buffer, requiredBits: number) => {
  let bits = requiredBits;

  for (let i = 0; i < digest.length && bits > 0; i += 1) {
    const needed = Math.min(bits, 8);
    const shifted = digest[i] >> (8 - needed);
    if (shifted !== 0) return false;
    bits -= needed;
  }

  return bits <= 0;
};

const verifyClientProof = async ({
  clientPublicKey,
  clientProof,
  message,
}: {
  clientPublicKey: string;
  clientProof: string;
  message: string;
}): Promise<GuardResult> => {
  if (!validateClientProofShape(clientProof)) {
    return fail(403, "invalid-client-proof", "Invalid client proof.");
  }

  try {
    const key = await webcrypto.subtle.importKey(
      "spki",
      Buffer.from(clientPublicKey, "base64url"),
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      false,
      ["verify"],
    );

    const verified = await webcrypto.subtle.verify(
      {
        name: "ECDSA",
        hash: "SHA-256",
      },
      key,
      Buffer.from(clientProof, "base64url"),
      textEncoder.encode(message),
    );

    if (!verified) {
      return fail(403, "client-proof-mismatch", "Invalid client proof.");
    }
  } catch {
    return fail(403, "invalid-client-proof", "Invalid client proof.");
  }

  return { ok: true };
};

const verifyTurnstileToken = async ({
  token,
  remoteIp,
  expectedHostname,
}: {
  token: string;
  remoteIp: string;
  expectedHostname: string | null;
}): Promise<GuardResult> => {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return fail(
      500,
      "captcha-secret-missing",
      "TURNSTILE_SECRET_KEY is not configured.",
    );
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });
  if (remoteIp && remoteIp !== "unknown") {
    body.set("remoteip", remoteIp);
  }

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return fail(
      502,
      "captcha-verification-unavailable",
      "Captcha verification service is unavailable.",
    );
  }

  const result = (await response.json()) as {
    success: boolean;
    hostname?: string;
    action?: string;
    "error-codes"?: string[];
  };

  if (!result.success) {
    return fail(
      403,
      "captcha-verification-failed",
      `Captcha verification failed (${(result["error-codes"] || []).join(",") || "unknown"}).`,
    );
  }

  if (result.action && result.action !== CHAT_TURNSTILE_ACTION) {
    return fail(
      403,
      "captcha-action-mismatch",
      "Captcha action mismatch. Please retry.",
    );
  }

  if (
    expectedHostname &&
    result.hostname &&
    result.hostname !== expectedHostname
  ) {
    return fail(
      403,
      "captcha-hostname-mismatch",
      "Captcha hostname mismatch. Please retry.",
    );
  }

  return { ok: true };
};

const getSessionBindingHash = ({
  userId,
  sessionId,
}: {
  userId: string;
  sessionId: string;
}) => {
  return hashHex(`${userId}:${sessionId}:chat-session-binding`);
};

const getCaptchaGraceKey = ({
  userId,
  sessionId,
  ip,
}: {
  userId: string;
  sessionId: string;
  ip: string;
}) => {
  return `${CAPTCHA_GRACE_PREFIX}:${hashHex(`${userId}:${sessionId}:${ip}`)}`;
};

const normalizeClientBinding = (
  binding: ChatChallengeRequestPayload | null | undefined,
): GuardResult<ChatChallengeRequestPayload> => {
  if (!binding) {
    return fail(
      400,
      "missing-client-binding",
      "Missing client security binding.",
    );
  }

  const clientId = binding.clientId?.trim();
  if (!clientId || !CLIENT_ID_PATTERN.test(clientId)) {
    return fail(400, "invalid-client-id", "Invalid client security binding.");
  }

  const clientPublicKey = binding.clientPublicKey?.trim();
  if (!clientPublicKey || !CLIENT_PUBLIC_KEY_PATTERN.test(clientPublicKey)) {
    return fail(
      400,
      "invalid-client-public-key",
      "Invalid client security binding.",
    );
  }

  return {
    ok: true,
    data: {
      clientId,
      clientPublicKey,
    },
  };
};

const validateClientProofShape = (value: string): boolean => {
  return CLIENT_PROOF_PATTERN.test(value);
};

const isBlockedUserAgent = (userAgent: string): boolean => {
  const blockedPatterns = [
    /\bcurl\b/i,
    /\bwget\b/i,
    /\bhttpie\b/i,
    /\bpython-requests\b/i,
    /\bpostmanruntime\b/i,
    /\binsomnia\b/i,
    /\bnode-fetch\b/i,
    /\baxios\b/i,
    /\bgo-http-client\b/i,
  ];
  return blockedPatterns.some((pattern) => pattern.test(userAgent));
};

const hasBrowserRequestSignals = (request: Request): boolean => {
  const hasSecFetchSite = Boolean(request.headers.get("sec-fetch-site"));
  const hasSecFetchMode = Boolean(request.headers.get("sec-fetch-mode"));
  const hasClientHints =
    Boolean(request.headers.get("sec-ch-ua")) ||
    Boolean(request.headers.get("sec-ch-ua-platform"));
  return (hasSecFetchSite && hasSecFetchMode) || hasClientHints;
};

const shouldRequireCaptcha = ({
  config,
  request,
  challengeCount,
  userAgent,
  hasCaptchaGrace,
  forceCaptcha,
}: {
  config: GuardConfig;
  request: Request;
  challengeCount: number;
  userAgent: string;
  hasCaptchaGrace: boolean;
  forceCaptcha: boolean;
}) => {
  if (forceCaptcha && config.captchaMode !== "off") return true;
  if (config.captchaMode === "off") return false;
  if (config.captchaMode === "always") return true;
  if (hasCaptchaGrace) return false;

  if (challengeCount > config.captchaEscalationThreshold) return true;
  if (isBlockedUserAgent(userAgent)) return true;
  if (!hasBrowserRequestSignals(request)) return true;

  return false;
};

export const resolveChatSecuritySessionId = (session: any): string => {
  return (
    session?.session?.id ||
    session?.session?.token ||
    session?.user?.id ||
    "unknown"
  );
};

export const resolveChatSecuritySessionIpAddress = (
  session: any,
): string | null => {
  const value = session?.session?.ipAddress;
  return typeof value === "string" ? value : null;
};

export const resolveChatSecuritySessionUserAgent = (
  session: any,
): string | null => {
  const value = session?.session?.userAgent;
  return typeof value === "string" ? value : null;
};

export const isChatRequestGuardEnabled = () => {
  return getGuardConfig().enabled;
};

export const createChatChallenge = async ({
  request,
  userId,
  sessionId,
  sessionIpAddress,
  sessionUserAgent,
  clientBinding,
}: {
  request: Request;
  userId: string;
  sessionId: string;
  sessionIpAddress?: string | null;
  sessionUserAgent?: string | null;
  clientBinding: ChatChallengeRequestPayload | null;
}): Promise<GuardResult<ChatChallengeResponse>> => {
  const config = getGuardConfig();
  if (!config.enabled) {
    return {
      ok: true,
      data: { enabled: false },
    };
  }

  const secret = getSecuritySecret();
  if (!secret) {
    return fail(
      500,
      "chat-security-secret-missing",
      "CHAT_REQUEST_GUARD_SECRET or BETTER_AUTH_SECRET is required.",
    );
  }

  const now = Date.now();
  const ip = getRemoteIp(request);
  const binding = normalizeClientBinding(clientBinding);
  if (!binding.ok) return binding;

  const userAgent = request.headers.get("user-agent") || "";
  if (!userAgent) {
    return fail(403, "missing-user-agent", "Missing user agent.");
  }
  if (isBlockedUserAgent(userAgent)) {
    return fail(403, "blocked-user-agent", "Unsupported client.");
  }

  const sessionBindingDrift = getSessionBindingDrift({
    sessionIpAddress,
    sessionUserAgent,
    requestIp: ip,
    requestUserAgent: userAgent,
  });
  if (
    config.sessionBindingMode === "strict" &&
    sessionBindingDrift.hasMismatch
  ) {
    return fail(
      403,
      sessionBindingDrift.ipMismatch
        ? "session-ip-mismatch"
        : "session-user-agent-mismatch",
      "Session context mismatch. Please sign in again.",
    );
  }
  const forceCaptchaForSessionBinding =
    config.sessionBindingMode === "soft" && sessionBindingDrift.hasMismatch;

  const allowedOrigins = getExpectedOrigins(request);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (origin && !allowedOrigins.has(origin)) {
    return fail(403, "invalid-origin", "Invalid request origin.");
  }

  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!allowedOrigins.has(refererOrigin)) {
        return fail(403, "invalid-referer", "Invalid request referer.");
      }
    } catch {
      return fail(403, "invalid-referer", "Invalid request referer.");
    }
  }

  if (!origin && !referer) {
    return fail(
      403,
      "missing-origin",
      "Missing origin headers for protected challenge route.",
    );
  }

  const challengeRateKey = toKey(
    CHALLENGE_RATE_PREFIX,
    ip,
    CHALLENGE_RATE_WINDOW_MS,
    now,
  );
  const challengeCount = await incrementWindowCounter(
    challengeRateKey,
    CHALLENGE_RATE_WINDOW_MS,
  );
  if (challengeCount > config.maxChallengesPerMinutePerIp) {
    return fail(
      429,
      "challenge-rate-limited",
      "Too many challenge requests. Please wait and try again.",
    );
  }

  const difficulty =
    challengeCount > config.powDifficultyEscalationThreshold
      ? config.powDifficultyHigh
      : config.powDifficultyBase;

  const challengeId = randomBytes(CHALLENGE_ID_BYTES).toString("hex");
  const captchaGraceKey = getCaptchaGraceKey({ userId, sessionId, ip });
  const hasCaptchaGrace = await serverCache.has(captchaGraceKey);
  const captchaRequired = shouldRequireCaptcha({
    config,
    request,
    challengeCount,
    userAgent,
    hasCaptchaGrace,
    forceCaptcha: forceCaptchaForSessionBinding,
  });
  const issuedAt = now;
  const expiresAt = issuedAt + config.challengeTtlMs;
  const payload: ChatChallengeTokenPayload = {
    v: CHAT_REQUEST_GUARD_VERSION,
    cid: challengeId,
    uid: userId,
    sid: getSessionBindingHash({ userId, sessionId }),
    uah: hashHex(userAgent),
    iph: hashHex(ip),
    cli: hashHex(binding.data.clientId),
    pkh: hashHex(binding.data.clientPublicKey),
    diff: difficulty,
    cap: captchaRequired ? 1 : 0,
    iat: issuedAt,
    exp: expiresAt,
  };

  const challengeToken = createChallengeToken({ payload, secret });

  return {
    ok: true,
    data: {
      enabled: true,
      version: CHAT_REQUEST_GUARD_VERSION,
      algorithm: CHAT_POW_ALGORITHM,
      action: CHAT_TURNSTILE_ACTION,
      challengeId,
      challengeToken,
      difficulty,
      issuedAt,
      expiresAt,
      maxSolveMs: config.powMaxSolveMs,
      captchaRequired,
    },
  };
};

export const verifyChatRequestGuard = async ({
  request,
  body,
  userId,
  sessionId,
  sessionIpAddress,
  sessionUserAgent,
}: {
  request: Request;
  body: unknown;
  userId: string;
  sessionId: string;
  sessionIpAddress?: string | null;
  sessionUserAgent?: string | null;
}): Promise<GuardResult> => {
  const config = getGuardConfig();
  if (!config.enabled) return { ok: true };

  const secret = getSecuritySecret();
  if (!secret) {
    return fail(
      500,
      "chat-security-secret-missing",
      "CHAT_REQUEST_GUARD_SECRET or BETTER_AUTH_SECRET is required.",
    );
  }

  if (!body || typeof body !== "object") {
    return fail(400, "invalid-body", "Invalid request body.");
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return fail(415, "unsupported-content-type", "Expected JSON request body.");
  }

  const userAgent = request.headers.get("user-agent") || "";
  if (!userAgent) {
    return fail(403, "missing-user-agent", "Missing user agent.");
  }
  if (isBlockedUserAgent(userAgent)) {
    return fail(403, "blocked-user-agent", "Unsupported client.");
  }

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (
    secFetchSite &&
    !["same-origin", "same-site", "none"].includes(secFetchSite)
  ) {
    return fail(403, "invalid-fetch-site", "Cross-site request rejected.");
  }

  const allowedOrigins = getExpectedOrigins(request);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (origin && !allowedOrigins.has(origin)) {
    return fail(403, "invalid-origin", "Invalid request origin.");
  }

  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!allowedOrigins.has(refererOrigin)) {
        return fail(403, "invalid-referer", "Invalid request referer.");
      }
    } catch {
      return fail(403, "invalid-referer", "Invalid request referer.");
    }
  }

  if (!origin && !referer) {
    return fail(
      403,
      "missing-origin",
      "Missing origin headers for protected chat route.",
    );
  }

  const now = Date.now();
  const ip = getRemoteIp(request);
  const captchaGraceKey = getCaptchaGraceKey({ userId, sessionId, ip });
  const sessionBindingDrift = getSessionBindingDrift({
    sessionIpAddress,
    sessionUserAgent,
    requestIp: ip,
    requestUserAgent: userAgent,
  });
  if (
    config.sessionBindingMode === "strict" &&
    sessionBindingDrift.hasMismatch
  ) {
    return fail(
      403,
      sessionBindingDrift.ipMismatch
        ? "session-ip-mismatch"
        : "session-user-agent-mismatch",
      "Session context mismatch. Please sign in again.",
    );
  }
  const forceCaptchaForSessionBinding =
    config.sessionBindingMode === "soft" && sessionBindingDrift.hasMismatch;

  const userRateKey = toKey(
    REQUEST_RATE_PREFIX,
    `user:${userId}`,
    REQUEST_RATE_WINDOW_MS,
    now,
  );
  const userRateCount = await incrementWindowCounter(
    userRateKey,
    REQUEST_RATE_WINDOW_MS,
  );
  if (userRateCount > config.maxRequestsPerMinutePerUser) {
    return fail(429, "user-rate-limited", "Too many chat requests.");
  }

  const ipRateKey = toKey(
    REQUEST_RATE_PREFIX,
    `ip:${ip}`,
    REQUEST_RATE_WINDOW_MS,
    now,
  );
  const ipRateCount = await incrementWindowCounter(
    ipRateKey,
    REQUEST_RATE_WINDOW_MS,
  );
  if (ipRateCount > config.maxRequestsPerMinutePerIp) {
    return fail(429, "ip-rate-limited", "Too many chat requests.");
  }

  const burstRateKey = toKey(
    REQUEST_BURST_PREFIX,
    `user:${userId}`,
    REQUEST_BURST_WINDOW_MS,
    now,
  );
  const burstCount = await incrementWindowCounter(
    burstRateKey,
    REQUEST_BURST_WINDOW_MS,
  );
  if (burstCount > config.maxRequestsPer10SecPerUser) {
    return fail(429, "burst-rate-limited", "Please slow down chat requests.");
  }

  const securityResult = ChatRequestSecuritySchema.safeParse(
    (body as Record<string, unknown>).security,
  );
  if (!securityResult.success) {
    return fail(
      403,
      "missing-security-payload",
      "Missing or invalid chat security payload.",
    );
  }
  const security = securityResult.data;

  if (security.version !== CHAT_REQUEST_GUARD_VERSION) {
    return fail(
      403,
      "invalid-security-version",
      "Unsupported security version.",
    );
  }

  const parsedToken = parseChallengeToken({
    token: security.challengeToken,
    secret,
  });
  if (!parsedToken.ok) return parsedToken;
  const tokenPayload = parsedToken.data;

  if (tokenPayload.v !== CHAT_REQUEST_GUARD_VERSION) {
    return fail(403, "invalid-token-version", "Unsupported challenge version.");
  }
  if (tokenPayload.cid !== security.challengeId) {
    return fail(403, "challenge-id-mismatch", "Challenge mismatch.");
  }
  if (tokenPayload.uid !== userId) {
    return fail(403, "challenge-user-mismatch", "Challenge user mismatch.");
  }

  const expectedSessionBinding = getSessionBindingHash({ userId, sessionId });
  if (tokenPayload.sid !== expectedSessionBinding) {
    return fail(
      403,
      "challenge-session-mismatch",
      "Challenge session mismatch.",
    );
  }

  if (tokenPayload.uah !== hashHex(userAgent)) {
    return fail(403, "challenge-user-agent-mismatch", "Challenge mismatch.");
  }
  if (tokenPayload.iph !== hashHex(ip)) {
    return fail(403, "challenge-ip-mismatch", "Challenge mismatch.");
  }
  if (tokenPayload.cli !== hashHex(security.clientId)) {
    return fail(403, "challenge-client-mismatch", "Challenge mismatch.");
  }
  if (tokenPayload.pkh !== hashHex(security.clientPublicKey)) {
    return fail(403, "challenge-client-key-mismatch", "Challenge mismatch.");
  }

  if (tokenPayload.diff !== security.difficulty) {
    return fail(403, "challenge-difficulty-mismatch", "Difficulty mismatch.");
  }

  if (tokenPayload.iat > now + 10_000) {
    return fail(403, "challenge-issued-in-future", "Invalid challenge timing.");
  }
  if (tokenPayload.exp < now) {
    return fail(403, "challenge-expired", "Challenge expired. Please retry.");
  }

  const replayKey = `${USED_CHALLENGE_PREFIX}:${security.challengeId}`;
  if (await serverCache.has(replayKey)) {
    return fail(409, "challenge-already-used", "Challenge already used.");
  }

  const requestBodyWithoutSecurity = {
    ...(body as Record<string, unknown>),
  };
  delete requestBodyWithoutSecurity.security;
  const expectedRequestHash = hashHex(
    stableJsonStringify(requestBodyWithoutSecurity),
  );
  if (expectedRequestHash !== security.requestHash.toLowerCase()) {
    return fail(403, "request-hash-mismatch", "Request payload mismatch.");
  }

  const expectedRequestMac = createHmac("sha256", security.challengeToken)
    .update(
      buildChatRequestMacMessage({
        challengeId: security.challengeId,
        challengeToken: security.challengeToken,
        requestHash: security.requestHash.toLowerCase(),
        solvedAt: security.solvedAt,
      }),
    )
    .digest("hex");
  if (!safeCompareHex(expectedRequestMac, security.requestMac.toLowerCase())) {
    return fail(403, "request-mac-mismatch", "Invalid request signature.");
  }

  const powDigest = createHash("sha256")
    .update(`${security.challengeId}:${security.powNonce}`)
    .digest();
  const computedPowHashHex = powDigest.toString("hex");
  if (computedPowHashHex !== security.powHash.toLowerCase()) {
    return fail(403, "pow-hash-mismatch", "Invalid proof-of-work hash.");
  }
  if (!hasLeadingZeroBits(powDigest, security.difficulty)) {
    return fail(403, "pow-too-weak", "Proof-of-work target not met.");
  }

  const clientProofMessage = buildChatClientProofMessage({
    challengeId: security.challengeId,
    challengeToken: security.challengeToken,
    difficulty: security.difficulty,
    powNonce: security.powNonce,
    powHash: security.powHash,
    requestHash: security.requestHash,
    solvedAt: security.solvedAt,
  });
  const clientProofResult = await verifyClientProof({
    clientPublicKey: security.clientPublicKey,
    clientProof: security.clientProof,
    message: clientProofMessage,
  });
  if (!clientProofResult.ok) return clientProofResult;

  if (tokenPayload.cap === 1 || forceCaptchaForSessionBinding) {
    if (!security.captchaToken) {
      return fail(403, "missing-captcha", "Captcha token is required.");
    }
    const captchaResult = await verifyTurnstileToken({
      token: security.captchaToken,
      remoteIp: ip,
      expectedHostname: getExpectedHostname(request),
    });
    if (!captchaResult.ok) return captchaResult;
    if (config.captchaGraceMs > 0) {
      await serverCache.set(captchaGraceKey, true, config.captchaGraceMs);
    }
  }

  const ttlRemaining = Math.max(tokenPayload.exp - now, 1_000);
  await serverCache.set(replayKey, true, ttlRemaining);

  return { ok: true };
};
