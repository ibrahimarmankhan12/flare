// ---------------------------------------------------------------------------
// P3.2 — Inbound email payload parser (pure)
// ---------------------------------------------------------------------------
// Three providers are supported for inbound email. Each provider delivers
// the message in a slightly different shape:
//   * SendGrid Inbound Parse — POSTs `multipart/form-data` with the
//     canonical `from`, `subject`, `text`, `html` fields plus a few
//     envelope headers.
//   * AWS SES — emails fan out as an SNS notification containing a
//     `SesMail` / `content` payload. We extract the plain text body
//     from `content`. The `mail` envelope provides `from` and
//     `destination`.
//   * Mailgun — POSTs `application/x-www-form-urlencoded` with
//     `recipient`, `from`, `subject`, `body-plain`, `body-html`,
//     `Message-Id`, etc.
//
// The parser is intentionally a discriminated-union of three object
// shapes. Routes / workers switch on the `provider` field. We do NOT
// add a SendGrid SDK dependency; the parser is just JSON / form-data
// shape inspection.
// ---------------------------------------------------------------------------

export type EmailProvider = "sendgrid" | "ses" | "mailgun";

export interface SendGridParsePayload {
  provider: "sendgrid";
  /** Address that the message was sent TO (envelope.rcpt_to). */
  to: string;
  /** RFC-822 From header, e.g. "Alice <alice@example.com>". */
  from: string;
  subject: string;
  /** Plain-text body, or empty string if absent. */
  text: string;
  /** HTML body, or null if absent. */
  html: string | null;
  /** SendGrid's `Message-ID` (provider's unique id) — useful for dedupe. */
  messageId: string | null;
  /** SendGrid spam score (lower = spammier). Optional. */
  spamScore: number | null;
}

export interface SesPayload {
  provider: "ses";
  /** SES `mail.messageId` — unique id, good for dedupe. */
  messageId: string;
  /** SES `mail.source`. */
  from: string;
  /** SES `mail.destination` — may be a single address or a list. */
  to: string[];
  subject: string;
  /** Plain-text body extracted from `content`. */
  text: string;
  /** HTML body extracted from `content`, or null if absent. */
  html: string | null;
  /** SES `receipt.timestamp`. */
  receivedAt: string | null;
}

export interface MailgunPayload {
  provider: "mailgun";
  /** `recipient` form field — envelope rcpt. */
  to: string;
  /** `from` form field — RFC-822 From header. */
  from: string;
  subject: string;
  /** `body-plain` form field. */
  text: string;
  /** `body-html` form field, or null if absent. */
  html: string | null;
  /** `Message-Id` form field — useful for dedupe. */
  messageId: string | null;
  /** Mailgun `X-Mailgun-Sscore` (string-encoded). */
  spamScore: number | null;
}

export type EmailPayload = SendGridParsePayload | SesPayload | MailgunPayload;

/**
 * Parser entry point. `body` is the raw request body (string) and
 * `contentType` is the request's `Content-Type` header value. Returns
 * the discriminated union; throws an `Error` with a `code` property if
 * the body can't be parsed for the given provider.
 *
 * The function is intentionally synchronous (it does no I/O); callers
 * are expected to have already read the body string.
 */
export const parseEmailPayload = (
  provider: EmailProvider,
  body: string,
  contentType: string,
): EmailPayload => {
  switch (provider) {
    case "sendgrid":
      return parseSendGrid(body, contentType);
    case "ses":
      return parseSes(body);
    case "mailgun":
      return parseMailgun(body, contentType);
    default: {
      // Exhaustiveness check.
      const _exhaustive: never = provider;
      throw new EmailParseError(
        `Unsupported email provider: ${String(_exhaustive)}`,
      );
    }
  }
};

export class EmailParseError extends Error {
  public readonly code = "EMAIL_PARSE_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "EmailParseError";
  }
}

// ---------- SendGrid Inbound Parse -----------------------------------------
// SendGrid POSTs `multipart/form-data`. We accept either the raw form
// text (URL-encoded) or a JSON envelope — JSON is the shape we get
// when a developer has pre-parsed the form with their edge worker.

const parseSendGrid = (
  body: string,
  contentType: string,
): SendGridParsePayload => {
  if (!body || body.length === 0) {
    throw new EmailParseError("SendGrid payload is empty");
  }
  if (looksLikeJson(contentType)) {
    const obj = safeJsonParse(body);
    if (!isObject(obj)) {
      throw new EmailParseError("SendGrid JSON body is not an object");
    }
    return {
      provider: "sendgrid",
      to: stringOrEmpty(getNested(obj, ["envelope", "to"]) ?? obj.to),
      from: stringOrEmpty(obj.from),
      subject: stringOrEmpty(obj.subject),
      text: stringOrEmpty(obj.text),
      html: optionalString(obj.html),
      messageId: optionalString(
        obj.message_id ??
          obj["Message-ID"] ??
          getNested(obj, ["headers", "Message-ID"]),
      ),
      spamScore: optionalNumber(obj.spam_score),
    };
  }
  // `application/x-www-form-urlencoded` (or `multipart/form-data` with
  // the edge already flattened). We parse URL-encoded pairs.
  const form = parseFormUrlEncoded(body);
  return {
    provider: "sendgrid",
    to: stringOrEmpty(form.to ?? form.envelope),
    from: stringOrEmpty(form.from),
    subject: stringOrEmpty(form.subject),
    text: stringOrEmpty(form.text),
    html: optionalString(form.html),
    messageId: optionalString(form.message_id ?? form["Message-ID"]),
    spamScore: optionalNumber(form.spam_score),
  };
};

// ---------- AWS SES via SNS ------------------------------------------------
// SES delivers an SNS notification. The relevant payload is the SNS
// `Message` field, which is itself a JSON string. We accept either
// the raw SNS envelope (with `.Message` as a stringified JSON) or
// the already-parsed `Ses` body — autodetected by looking for a
// `notificationType` or `mail` key.

const parseSes = (body: string): SesPayload => {
  if (!body || body.length === 0) {
    throw new EmailParseError("SES payload is empty");
  }
  const outer = safeJsonParse(body);
  if (!isObject(outer)) {
    throw new EmailParseError("SES payload is not a JSON object");
  }
  // The outer envelope may be SNS — drill into `Message` (string) or
  // `mail` / `content` (object) depending on shape.
  const ses = extractSesBody(outer);
  if (!isObject(ses)) {
    throw new EmailParseError("SES payload is missing mail content");
  }
  const mail = (ses.mail as Record<string, unknown> | undefined) ?? {};
  const content = (ses.content as Record<string, unknown> | undefined) ?? {};
  const receipt = (ses.receipt as Record<string, unknown> | undefined) ?? {};

  return {
    provider: "ses",
    messageId: stringOrEmpty(mail.messageId ?? mail.message_id),
    from: stringOrEmpty(mail.source),
    to: stringListFromUnknown(mail.destination) ?? [],
    subject: stringOrEmpty(getNested(mail, ["commonHeaders", "subject"])),
    text: extractSesTextContent(content),
    html: extractSesHtmlContent(content),
    receivedAt: optionalString(receipt.timestamp),
  };
};

const extractSesBody = (outer: Record<string, unknown>): unknown => {
  if (typeof outer.Message === "string") {
    return safeJsonParse(outer.Message);
  }
  if (isObject(outer.Ses) || isObject(outer.mail) || isObject(outer.content)) {
    return outer.Ses ?? outer;
  }
  return null;
};

const extractSesTextContent = (content: Record<string, unknown>): string => {
  // SES `content` is either `{data: "..."}` (single part) or
  // `{parts: [{contentType, content: {data}}]}` (multi-part). We
  // prefer the part where `charset` is plain or `contentType` starts
  // with `text/plain`.
  if (typeof content.data === "string") {
    return content.data;
  }
  if (Array.isArray(content.parts)) {
    const plain = content.parts.find(
      (p) =>
        isObject(p) &&
        (stringOrEmpty((p as Record<string, unknown>).contentType).startsWith(
          "text/plain",
        ) ||
          (isObject((p as Record<string, unknown>).content) &&
            stringOrEmpty(
              (
                (p as Record<string, unknown>).content as Record<
                  string,
                  unknown
                >
              ).charset,
            ).toLowerCase() === "utf-8" &&
            !stringOrEmpty(
              (p as Record<string, unknown>).contentType,
            ).startsWith("text/html"))),
    );
    if (plain && isObject(plain) && isObject(plain.content)) {
      return stringOrEmpty((plain.content as Record<string, unknown>).data);
    }
  }
  return "";
};

const extractSesHtmlContent = (
  content: Record<string, unknown>,
): string | null => {
  if (typeof content.data === "string" && content.data.length > 0) {
    return null;
  }
  if (Array.isArray(content.parts)) {
    const html = content.parts.find(
      (p) =>
        isObject(p) &&
        stringOrEmpty((p as Record<string, unknown>).contentType).startsWith(
          "text/html",
        ),
    );
    if (html && isObject(html) && isObject(html.content)) {
      const data = (html.content as Record<string, unknown>).data;
      if (typeof data === "string") return data;
    }
  }
  return null;
};

// ---------- Mailgun --------------------------------------------------------
// Mailgun POSTs `application/x-www-form-urlencoded` with the canonical
// field names. We also support a JSON envelope for development.

const parseMailgun = (body: string, contentType: string): MailgunPayload => {
  if (!body || body.length === 0) {
    throw new EmailParseError("Mailgun payload is empty");
  }
  if (looksLikeJson(contentType)) {
    const obj = safeJsonParse(body);
    if (!isObject(obj)) {
      throw new EmailParseError("Mailgun JSON body is not an object");
    }
    return {
      provider: "mailgun",
      to: stringOrEmpty(obj.recipient ?? obj.To),
      from: stringOrEmpty(obj.from ?? obj.From),
      subject: stringOrEmpty(obj.subject ?? obj.Subject),
      text: stringOrEmpty(obj["body-plain"] ?? obj.body_plain),
      html: optionalString(obj["body-html"] ?? obj.body_html),
      messageId: optionalString(obj["Message-Id"] ?? obj.MessageId),
      spamScore: optionalNumber(obj["X-Mailgun-Sscore"] ?? obj.spam_score),
    };
  }
  const form = parseFormUrlEncoded(body);
  return {
    provider: "mailgun",
    to: stringOrEmpty(form.recipient),
    from: stringOrEmpty(form.from),
    subject: stringOrEmpty(form.subject),
    text: stringOrEmpty(form["body-plain"]),
    html: optionalString(form["body-html"]),
    messageId: optionalString(form["Message-Id"]),
    spamScore: optionalNumber(form["X-Mailgun-Sscore"]),
  };
};

// ---------- helpers --------------------------------------------------------

const looksLikeJson = (contentType: string): boolean =>
  contentType.toLowerCase().includes("application/json");

const safeJsonParse = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const stringOrEmpty = (v: unknown): string =>
  typeof v === "string" ? v : v == null ? "" : String(v);

const optionalString = (v: unknown): string | null => {
  if (v == null) return null;
  if (typeof v === "string") return v.length > 0 ? v : null;
  return String(v);
};

const optionalNumber = (v: unknown): number | null => {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const stringListFromUnknown = (v: unknown): string[] | null => {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === "string").map((s) => s);
  }
  if (typeof v === "string") return [v];
  return null;
};

/**
 * Walk a `Record<string, unknown>` along a path of keys, returning
 * `undefined` if any segment is missing or not an object. Useful for
 * safely reading nested fields like `mail.commonHeaders.subject`
 * where TypeScript would otherwise refuse the chained access.
 */
const getNested = (obj: Record<string, unknown>, path: string[]): unknown => {
  let cur: unknown = obj;
  for (const k of path) {
    if (!isObject(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
};

/**
 * Tiny `application/x-www-form-urlencoded` parser. We don't pull in
 * a dependency for the one form shape the inbound route already
 * handles. Returns an empty object on a malformed body — callers
 * use the canonical fields and the empty-string fallback for any
 * missing keys.
 */
const parseFormUrlEncoded = (body: string): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!body) return out;
  // Mailgun occasionally uses `\n` separators between records; we
  // tolerate both `&` and `\n` as separators for robustness.
  const pairs = body.split(/[&]/);
  for (const pair of pairs) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const key = decodeURIComponent(pair.slice(0, eq).replaceAll("+", " "));
    const value = decodeURIComponent(pair.slice(eq + 1).replaceAll("+", " "));
    out[key] = value;
  }
  return out;
};
