import { createHash, randomBytes } from "node:crypto";

export const WEBHOOK_EVENT_TYPES = [
  "thread.created",
  "message.created",
  "scheduled_run.completed",
  "agent.published",
  "inbound.received",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const hashSigningSecret = (secret: string): string =>
  createHash("sha256").update(secret).digest("hex");

export const generateSigningSecret = (): string =>
  `whsec_${randomBytes(32).toString("base64url")}`;
