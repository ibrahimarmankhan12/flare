// ---------------------------------------------------------------------------
// P3.2 — Inbound triggers: public surface
// ---------------------------------------------------------------------------
// Re-exports the parser, normalizer, and validator modules under a
// single import path. Routes / workers should import from here
// rather than reaching into the individual files.
//
//     import { normalizeWebhook, validateInboundRequest } from "lib/inbound";
// ---------------------------------------------------------------------------

export type {
  EmailPayload,
  EmailParseError,
  EmailProvider,
  MailgunPayload,
  SendGridParsePayload,
  SesPayload,
} from "./email";
export { parseEmailPayload } from "./email";
export type {
  NormalizedInbound,
  NormalizeError,
} from "./normalize";
export {
  normalizeEmail,
  normalizeSlack,
  normalizeWebhook,
} from "./normalize";
export type {
  SlackAppMentionEvent,
  SlackEventCallback,
  SlackEventPayload,
  SlackInnerEvent,
  SlackMessageEvent,
  SlackParseResult,
  SlackRequestHeaders,
} from "./slack";
export { computeSlackSignature, parseSlackEvent } from "./slack";
export type {
  InboundEndpointForValidation,
  ValidateInboundRequestInput,
  ValidationResult,
} from "./validate";
export { validateInboundRequest } from "./validate";
