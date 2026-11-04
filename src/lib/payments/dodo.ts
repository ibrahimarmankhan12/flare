import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import logger from "lib/logger";
import { siteConfigRepository } from "lib/db/repository";
import { decrypt } from "lib/security/encryption";

/**
 * Dodo Payments tier -> product ID mapping. Each paid plan in
 * `app-types/subscription` is mapped to a Dodo product ID via env
 * vars. Admins can also edit the IDs from the admin Settings →
 * Payments page; the env var always wins when set.
 *
 * Free is intentionally omitted — there is no Dodo product for the
 * free tier.
 */
export const PAID_TIER_DODO_PRODUCT_ID_ENV: Record<string, string> = {
  "flare-pro": "DODO_PRODUCT_FLARE_PRO",
  "flare-max": "DODO_PRODUCT_FLARE_MAX",
  "flare-enterprises": "DODO_PRODUCT_FLARE_ENTERPRISES",
  "flare-enterprises-pro": "DODO_PRODUCT_FLARE_ENTERPRISES_PRO",
  "flare-enterprises-max": "DODO_PRODUCT_FLARE_ENTERPRISES_MAX",
};

export type DodoEnvironment = "test_mode" | "live_mode";

const DODO_BASE_URLS: Record<DodoEnvironment, string> = {
  test_mode: "https://test.dodopayments.com",
  live_mode: "https://live.dodopayments.com",
};

const readEnv = (key: string): string | undefined => {
  const v = process.env[key];
  if (!v) return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const decryptIfPresent = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    return decrypt(value);
  } catch (error) {
    logger.error(
      "[dodo] failed to decrypt secret from site_config — ignoring",
      error,
    );
    return null;
  }
};

interface DodoPaymentsAdminConfig {
  environment?: string;
  productIds?: Record<string, string>;
  apiKeySecret?: string;
  webhookSecretSecret?: string;
}

const readAdminDodoConfig =
  async (): Promise<DodoPaymentsAdminConfig> => {
    try {
      const [payments, tools] = await Promise.all([
        siteConfigRepository.getConfig("payments"),
        siteConfigRepository.getConfig("tools"),
      ]);
      const dodo =
        payments &&
        typeof (payments as Record<string, unknown>).dodo === "object" &&
        (payments as Record<string, unknown>).dodo !== null
          ? ((payments as Record<string, unknown>).dodo as Record<
              string,
              unknown
            >)
          : {};
      const toolsRecord =
        tools && typeof tools === "object" ? (tools as Record<string, unknown>) : {};
      const secrets =
        typeof toolsRecord.apiKeysSecrets === "object" &&
        toolsRecord.apiKeysSecrets !== null
          ? (toolsRecord.apiKeysSecrets as Record<string, unknown>)
          : {};
      return {
        environment:
          typeof dodo.environment === "string"
            ? (dodo.environment as string)
            : undefined,
        productIds:
          typeof dodo.productIds === "object" && dodo.productIds !== null
            ? (dodo.productIds as Record<string, string>)
            : undefined,
        apiKeySecret:
          typeof secrets.dodo_api_key === "string"
            ? (secrets.dodo_api_key as string)
            : undefined,
        webhookSecretSecret:
          typeof secrets.dodo_webhook_secret === "string"
            ? (secrets.dodo_webhook_secret as string)
            : undefined,
      };
    } catch (error) {
      logger.error("[dodo] failed to read admin config", error);
      return {};
    }
  };

export const getDodoConfig = async () => {
  const admin = await readAdminDodoConfig();

  const envApiKey = readEnv("DODO_PAYMENTS_API_KEY");
  const dbApiKey = decryptIfPresent(admin.apiKeySecret);
  const apiKey = envApiKey ?? dbApiKey ?? undefined;

  const envWebhookSecret = readEnv("DODO_WEBHOOK_SECRET");
  const dbWebhookSecret = decryptIfPresent(admin.webhookSecretSecret);
  const webhookSecret = envWebhookSecret ?? dbWebhookSecret ?? undefined;

  const envEnv = readEnv("DODO_ENVIRONMENT");
  const adminEnv = admin.environment;
  const rawEnv = (envEnv ?? adminEnv ?? "test_mode").toLowerCase();
  const environment: DodoEnvironment =
    rawEnv === "live_mode" || rawEnv === "production" || rawEnv === "live"
      ? "live_mode"
      : "test_mode";

  return {
    apiKey,
    webhookSecret,
    environment,
    apiKeySource: (envApiKey ? "env" : dbApiKey ? "db" : "none") as
      | "env"
      | "db"
      | "none",
    webhookSecretSource: (envWebhookSecret
      ? "env"
      : dbWebhookSecret
        ? "db"
        : "none") as "env" | "db" | "none",
  };
};

export const isDodoPaymentsEnabled = async (): Promise<boolean> => {
  const { apiKey, webhookSecret } = await getDodoConfig();
  return Boolean(apiKey) && Boolean(webhookSecret);
};

export const getDodoBaseUrl = async (): Promise<string> => {
  const { environment } = await getDodoConfig();
  return DODO_BASE_URLS[environment];
};

export const getDodoProductIdForTier = async (
  tier: string,
): Promise<string | null> => {
  const envKey = PAID_TIER_DODO_PRODUCT_ID_ENV[tier];
  if (!envKey) return null;
  const fromEnv = readEnv(envKey);
  if (fromEnv) return fromEnv;
  // Fallback to admin-configured product ID.
  const admin = await readAdminDodoConfig();
  const fromAdmin = admin.productIds?.[tier];
  if (typeof fromAdmin === "string" && fromAdmin.trim().length > 0) {
    return fromAdmin.trim();
  }
  return null;
};

/**
 * Look up a Flare tier from a Dodo product ID. Returns null if the
 * product ID is not associated with any known tier.
 */
export const getTierForDodoProductId = (
  productId: string | null | undefined,
): string | null => {
  if (!productId) return null;
  for (const [tier, envKey] of Object.entries(PAID_TIER_DODO_PRODUCT_ID_ENV)) {
    if (readEnv(envKey) === productId) return tier;
  }
  return null;
};

// ---------- Dodo Checkout Session ----------

export interface CreateCheckoutSessionInput {
  productId: string;
  quantity?: number;
  customer: {
    email: string;
    name?: string;
    userId: string; // propagated via metadata so the webhook can match
  };
  successUrl: string;
  cancelUrl?: string;
  // Tier is server-set (validated by zod in the route handler). It is
  // echoed into metadata so the webhook can apply the right tier
  // independently of the Dodo product catalog.
  tier?: string;
}

export interface CreateCheckoutSessionResult {
  sessionId: string;
  checkoutUrl: string;
  paymentId: string | null;
  clientSecret: string | null;
}

interface DodoCheckoutApiResponse {
  session_id: string;
  checkout_url: string | null;
  payment_id?: string | null;
  client_secret?: string | null;
}

export class DodoPaymentsError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "DodoPaymentsError";
    this.status = status;
    this.body = body;
  }
}

export const createCheckoutSession = async (
  input: CreateCheckoutSessionInput,
): Promise<CreateCheckoutSessionResult> => {
  const config = await getDodoConfig();
  if (!config.apiKey) {
    throw new Error(
      "Dodo Payments is not configured. Set DODO_PAYMENTS_API_KEY in the env or save it in admin Settings → Payments.",
    );
  }

  const baseUrl = await getDodoBaseUrl();
  const body = {
    product_cart: [
      {
        product_id: input.productId,
        quantity: input.quantity ?? 1,
      },
    ],
    customer: {
      email: input.customer.email,
      name: input.customer.name,
    },
    return_url: input.successUrl,
    cancel_url: input.cancelUrl ?? input.successUrl,
    metadata: {
      flareUserId: input.customer.userId,
      ...(input.tier ? { tier: input.tier } : {}),
    },
    feature_flags: {
      allow_customer_editing_email: false,
      allow_customer_editing_name: false,
    },
  } as Record<string, unknown>;

  const response = await fetch(`${baseUrl}/checkouts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    logger.error("[dodo] checkout session failed", {
      status: response.status,
      body: text,
    });
    throw new DodoPaymentsError(
      `Dodo checkout session failed: ${response.status}`,
      response.status,
      text,
    );
  }

  let parsed: DodoCheckoutApiResponse;
  try {
    parsed = JSON.parse(text) as DodoCheckoutApiResponse;
  } catch {
    throw new DodoPaymentsError(
      "Dodo returned an unparseable response",
      response.status,
      text,
    );
  }

  if (!parsed.session_id || !parsed.checkout_url) {
    throw new DodoPaymentsError(
      "Dodo response missing session_id or checkout_url",
      response.status,
      text,
    );
  }

  return {
    sessionId: parsed.session_id,
    checkoutUrl: parsed.checkout_url,
    paymentId: parsed.payment_id ?? null,
    clientSecret: parsed.client_secret ?? null,
  };
};

// ---------- Webhook signature verification (Standard Webhooks) ----------

export interface VerifyWebhookSignatureInput {
  rawBody: string;
  headers: {
    id: string | null;
    timestamp: string | null;
    signature: string | null;
  };
}

const safeEqualHex = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
};

const computeSignature = (
  secret: string,
  webhookId: string,
  timestamp: string,
  rawBody: string,
): string => {
  // Standard Webhooks: signed content = id + "." + timestamp + "." + body
  const signed = `${webhookId}.${timestamp}.${rawBody}`;
  // The webhook secret from the Dodo dashboard is base64-encoded with a
  // `whsec_` prefix; HMAC the signed string with the raw secret bytes.
  const rawKey = secret.startsWith("whsec_")
    ? secret.slice("whsec_".length)
    : secret;
  return createHmac("sha256", rawKey).update(signed).digest("hex");
};

/**
 * Verify a Dodo webhook payload. Returns true when the signature in
 * the `webhook-signature` header matches an HMAC-SHA256 of the
 * signed string with our webhook secret.
 *
 * The signature header may contain multiple space-separated `v1,<hex>`
 * entries (rotating secrets). Any matching entry is accepted.
 */
export const verifyWebhookSignature = async (
  input: VerifyWebhookSignatureInput,
): Promise<boolean> => {
  const { webhookSecret } = await getDodoConfig();
  if (!webhookSecret) {
    logger.error(
      "[dodo] webhook signature verification skipped — no secret configured",
    );
    return false;
  }

  const { id, timestamp, signature } = input.headers;
  if (!id || !timestamp || !signature) {
    return false;
  }

  // 5 minute tolerance window — Dodo recommends rejecting events with
  // a timestamp older than a few minutes to prevent replays.
  const tsSeconds = Number(timestamp);
  if (!Number.isFinite(tsSeconds)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - tsSeconds) > 5 * 60) {
    logger.warn("[dodo] webhook timestamp outside tolerance window", {
      webhookId: id,
      deltaSeconds: nowSeconds - tsSeconds,
    });
    return false;
  }

  const expected = computeSignature(
    webhookSecret,
    id,
    timestamp,
    input.rawBody,
  );
  const candidates = signature
    .split(" ")
    .map((entry) => entry.split(",")[1])
    .filter((value): value is string => Boolean(value));

  return candidates.some((candidate) => safeEqualHex(candidate, expected));
};

// ---------- Subscription lookup (recovery path) ----------

export interface DodoSubscriptionDetails {
  subscriptionId: string;
  productId: string;
  customerId: string | null;
  status: string;
  /**
   * Dodo's `previous_billing_date` — start of the current billing
   * period. `current_period_start` is accepted as a fallback for
   * older Dodo responses.
   */
  previousBillingDate: Date | null;
  /**
   * Dodo's `next_billing_date` — end of the current billing period.
   * `current_period_end` is accepted as a fallback.
   */
  nextBillingDate: Date | null;
  /**
   * Dodo's `cancel_at_next_billing_date`. `cancel_at_period_end`
   * is accepted as a fallback.
   */
  cancelAtNextBillingDate: boolean;
  metadata: Record<string, unknown>;
  raw: Record<string, unknown>;
}

interface DodoSubscriptionApiResponse {
  subscription_id?: string;
  id?: string;
  product_id?: string;
  // `customer_id` may be a top-level string OR nested under `customer`.
  customer_id?: string;
  customer?: { customer_id?: string };
  status?: string;
  // Real Dodo field names.
  previous_billing_date?: string;
  next_billing_date?: string;
  cancel_at_next_billing_date?: boolean;
  // Fallbacks for older / alternative response shapes.
  current_period_start?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, unknown>;
}

const asDateOrNull = (value: unknown): Date | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Look up a Dodo subscription by its Dodo-assigned id. Used by the
 * reconciliation endpoint when the webhook hasn't arrived but the
 * user has a real `subscription_id` from the redirect URL.
 *
 * Throws a `DodoPaymentsError` on non-2xx responses so the caller
 * can map status codes to user-facing messages.
 */
export const getDodoSubscription = async (
  dodoSubscriptionId: string,
): Promise<DodoSubscriptionDetails> => {
  const config = await getDodoConfig();
  if (!config.apiKey) {
    throw new DodoPaymentsError(
      "Dodo API key not configured",
      503,
      "DODO_NOT_CONFIGURED",
    );
  }
  if (!dodoSubscriptionId) {
    throw new DodoPaymentsError("Missing subscription id", 400, "BAD_REQUEST");
  }

  const baseUrl = await getDodoBaseUrl();
  const response = await fetch(
    `${baseUrl}/subscriptions/${encodeURIComponent(dodoSubscriptionId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  const text = await response.text();
  if (!response.ok) {
    logger.warn("[dodo] subscription lookup failed", {
      status: response.status,
      body: text.slice(0, 200),
    });
    throw new DodoPaymentsError(
      `Dodo subscription lookup failed: ${response.status}`,
      response.status,
      text,
    );
  }

  let parsed: DodoSubscriptionApiResponse;
  try {
    parsed = JSON.parse(text) as DodoSubscriptionApiResponse;
  } catch {
    throw new DodoPaymentsError(
      "Dodo returned an unparseable subscription response",
      response.status,
      text,
    );
  }

  // Dodo's response shape varies slightly between environments;
  // some endpoints wrap in `{ data: { ... } }`, others return the
  // subscription directly. Accept both.
  const inner = (parsed as unknown as { data?: DodoSubscriptionApiResponse })
    .data;

  const obj = (inner && typeof inner === "object" ? inner : parsed) ?? {};
  const subscriptionId =
    typeof obj.subscription_id === "string"
      ? obj.subscription_id
      : typeof obj.id === "string"
        ? obj.id
        : dodoSubscriptionId;

  // `customer_id` may be top-level or nested under `customer.customer_id`.
  // Per the real Dodo subscription response shape, it's nested.
  const nestedCustomerId =
    obj.customer && typeof obj.customer === "object"
      ? (obj.customer as { customer_id?: string }).customer_id
      : undefined;
  const customerId =
    typeof obj.customer_id === "string"
      ? obj.customer_id
      : typeof nestedCustomerId === "string"
        ? nestedCustomerId
        : null;

  // Billing dates: prefer the real Dodo field names, fall back to
  // the older `current_period_*` aliases so we don't break against
  // a response shape that happens to use those.
  const periodStart =
    asDateOrNull(obj.previous_billing_date) ??
    asDateOrNull(obj.current_period_start);
  const periodEnd =
    asDateOrNull(obj.next_billing_date) ??
    asDateOrNull(obj.current_period_end);

  const cancelAtNextBillingDate =
    typeof obj.cancel_at_next_billing_date === "boolean"
      ? obj.cancel_at_next_billing_date
      : typeof obj.cancel_at_period_end === "boolean"
        ? obj.cancel_at_period_end
        : false;

  return {
    subscriptionId,
    productId: typeof obj.product_id === "string" ? obj.product_id : "",
    customerId,
    status: typeof obj.status === "string" ? obj.status : "unknown",
    previousBillingDate: periodStart,
    nextBillingDate: periodEnd,
    cancelAtNextBillingDate,
    metadata:
      obj.metadata && typeof obj.metadata === "object"
        ? (obj.metadata as Record<string, unknown>)
        : {},
    raw: obj as Record<string, unknown>,
  };
};

export interface ParsedWebhookEvent {
  webhookId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

/**
 * Verify + parse a Dodo webhook. Throws on signature failure; returns
 * the parsed envelope on success.
 */
export const parseWebhookRequest = async (
  rawBody: string,
  headers: Headers,
): Promise<ParsedWebhookEvent> => {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signature = headers.get("webhook-signature");

  const verified = await verifyWebhookSignature({
    rawBody,
    headers: { id, timestamp, signature },
  });
  if (!verified) {
    throw new Error("Invalid webhook signature");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid webhook JSON body");
  }

  const eventType =
    typeof payload.type === "string"
      ? (payload.type as string)
      : typeof payload.event_type === "string"
        ? (payload.event_type as string)
        : "unknown";

  return {
    webhookId: id ?? "",
    eventType,
    payload,
  };
};
