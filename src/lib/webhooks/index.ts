// ---------------------------------------------------------------------------
// P3.4 — Webhook public surface
// ---------------------------------------------------------------------------
// Re-exports the signing, verification, delivery, and backoff helpers
// so callers can `import { signPayload, deliverWebhook, … } from
// "@/lib/webhooks"`. Keep this file thin — all logic lives in
// `sign.ts` and `deliver.ts`.
// ---------------------------------------------------------------------------

export {
  formatSignatureHeader,
  signPayload,
  verifySignature,
  SIGNATURE_TOLERANCE_SECONDS,
  type VerifyResult,
} from "./sign";
export {
  computeBackoffMs,
  deliverWebhook,
  type DeliverWebhookInput,
  type DeliveryResult,
} from "./deliver";
