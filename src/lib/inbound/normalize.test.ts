import { describe, expect, it } from "vitest";

import type { UserConnectorEntity } from "lib/db/pg/schema.pg";
import {
  type MailgunPayload,
  type SendGridParsePayload,
  type SesPayload,
} from "./email";
import {
  NormalizeError,
  type NormalizedInbound,
  normalizeEmail,
  normalizeSlack,
  normalizeWebhook,
} from "./normalize";
import type { SlackEventPayload, SlackInnerEvent } from "./slack";

// `lib/db/pg/schema.pg` is not a server-only module on import, so we
// don't need to mock it. We just need the connector row's `userId`,
// `email`, and `metadata` fields for the Slack normalizer.

const sampleConnector: Pick<
  UserConnectorEntity,
  "userId" | "email" | "metadata"
> = {
  userId: "u_test_123",
  email: "owner@example.com",
  metadata: { workspaceId: "T0001" },
};

const baseSlackEvent = (
  event: SlackInnerEvent,
  overrides: Partial<SlackEventPayload> = {},
): SlackEventPayload => ({
  type: "event_callback",
  teamId: "T0001",
  eventId: "Ev0001",
  event,
  ...overrides,
});

describe("normalizeWebhook", () => {
  it("normalizes a JSON object with a text field", () => {
    const out = normalizeWebhook({ text: "hello", from: "alice" });
    expect(out.source).toBe("webhook");
    expect(out.text).toBe("hello");
    expect(out.from).toBe("alice");
    expect(out.threadTitle.startsWith("Inbound webhook")).toBe(true);
  });

  it("falls back to message / body / content fields", () => {
    expect(normalizeWebhook({ message: "m" }).text).toBe("m");
    expect(normalizeWebhook({ body: "b" }).text).toBe("b");
    expect(normalizeWebhook({ content: "c" }).text).toBe("c");
  });

  it("uses placeholder for an empty body", () => {
    const out = normalizeWebhook("");
    expect(out.text).toBe("(empty webhook body)");
    expect(out.threadTitle).toBe("Inbound webhook");
  });

  it("handles null / undefined payloads with a placeholder", () => {
    expect(normalizeWebhook(null).text).toBe("(empty webhook payload)");
    expect(normalizeWebhook(undefined).text).toBe("(empty webhook payload)");
  });

  it("accepts a bare string body", () => {
    const out = normalizeWebhook("plain text body");
    expect(out.text).toBe("plain text body");
    expect(out.source).toBe("webhook");
  });

  it("pulls an external id from common keys", () => {
    expect(normalizeWebhook({ id: "evt_1" }).externalId).toBe("evt_1");
    expect(normalizeWebhook({ event_id: "e2" }).externalId).toBe("e2");
    expect(normalizeWebhook({ message_id: "m3" }).externalId).toBe("m3");
  });

  it("uses an explicit title header when present", () => {
    const out = normalizeWebhook(
      { text: "x" },
      { "x-inbound-title": "Deploy bot" },
    );
    expect(out.threadTitle).toBe("Inbound webhook: Deploy bot");
  });
});

describe("normalizeEmail", () => {
  const sendgrid: SendGridParsePayload = {
    provider: "sendgrid",
    to: "inbox@example.com",
    from: "Alice <alice@example.com>",
    subject: "Hello",
    text: "Hi there",
    html: "<p>Hi there</p>",
    messageId: "msg_sendgrid_1",
    spamScore: 0.1,
  };
  const ses: SesPayload = {
    provider: "ses",
    messageId: "msg_ses_1",
    from: "bob@example.com",
    to: ["inbox@example.com"],
    subject: "SES subject",
    text: "SES body",
    html: null,
    receivedAt: "2026-06-01T10:00:00Z",
  };
  const mailgun: MailgunPayload = {
    provider: "mailgun",
    to: "inbox@example.com",
    from: "carol@example.com",
    subject: "Mailgun subject",
    text: "Mailgun body",
    html: null,
    messageId: "<abc@mailgun.org>",
    spamScore: 0.4,
  };

  it("normalizes a SendGrid payload", () => {
    const out: NormalizedInbound = normalizeEmail(sendgrid, "sendgrid");
    expect(out.source).toBe("email");
    expect(out.from).toBe("Alice <alice@example.com>");
    expect(out.text).toBe("Hi there");
    expect(out.externalId).toBe("msg_sendgrid_1");
    expect(out.threadTitle).toContain("SendGrid");
    expect(out.threadTitle).toContain("Hello");
  });

  it("normalizes a SES payload", () => {
    const out = normalizeEmail(ses, "ses");
    expect(out.source).toBe("email");
    expect(out.text).toBe("SES body");
    expect(out.externalId).toBe("msg_ses_1");
    expect(out.threadTitle).toContain("AWS SES");
  });

  it("normalizes a Mailgun payload", () => {
    const out = normalizeEmail(mailgun, "mailgun");
    expect(out.source).toBe("email");
    expect(out.text).toBe("Mailgun body");
    expect(out.externalId).toBe("<abc@mailgun.org>");
    expect(out.threadTitle).toContain("Mailgun");
  });

  it("falls back to html when text is empty", () => {
    const htmlOnly: SendGridParsePayload = {
      ...sendgrid,
      text: "",
      html: "<p>only html</p>",
    };
    const out = normalizeEmail(htmlOnly, "sendgrid");
    expect(out.text).toBe("<p>only html</p>");
  });

  it("uses placeholder for a completely empty body", () => {
    const empty: SendGridParsePayload = {
      ...sendgrid,
      text: "",
      html: null,
    };
    const out = normalizeEmail(empty, "sendgrid");
    expect(out.text).toBe("(empty email body)");
  });
});

describe("normalizeSlack", () => {
  it("normalizes an event_callback message event", () => {
    const messageEvent: SlackInnerEvent = {
      type: "message",
      user: "U001",
      text: "hello from slack",
      channel: "C001",
      channel_name: "ops",
      ts: "1700000000.000100",
    };
    const out = normalizeSlack(baseSlackEvent(messageEvent), sampleConnector);
    expect(out.source).toBe("slack");
    expect(out.text).toBe("hello from slack");
    expect(out.from).toBe("slack:U001");
    expect(out.externalId).toBe("Ev0001");
    expect(out.threadTitle).toBe("Inbound from Slack: #ops");
    expect((out.meta as Record<string, unknown>).ownerUserId).toBe(
      "u_test_123",
    );
  });

  it("normalizes an app_mention event", () => {
    const mentionEvent: SlackInnerEvent = {
      type: "app_mention",
      user: "U002",
      text: "<@U_BOT> ping",
      channel: "C002",
      channel_name: "general",
      ts: "1700000001.000200",
    };
    const out = normalizeSlack(baseSlackEvent(mentionEvent), sampleConnector);
    expect(out.text).toBe("<@U_BOT> ping");
    expect(out.threadTitle).toBe("Inbound from Slack: #general (mention)");
  });

  it("throws on a message event with no text", () => {
    const empty: SlackInnerEvent = {
      type: "message",
      user: "U003",
      text: "",
      channel: "C003",
    };
    expect(() =>
      normalizeSlack(baseSlackEvent(empty), sampleConnector),
    ).toThrow(NormalizeError);
  });

  it("throws on an unsupported event type", () => {
    const reaction: SlackInnerEvent = {
      type: "reaction_added",
    } as unknown as SlackInnerEvent;
    expect(() =>
      normalizeSlack(baseSlackEvent(reaction), sampleConnector),
    ).toThrow(NormalizeError);
  });

  it("falls back to channel id when channel_name is missing", () => {
    const ev: SlackInnerEvent = {
      type: "message",
      user: "U004",
      text: "no name",
      channel: "C004",
    };
    const out = normalizeSlack(baseSlackEvent(ev), sampleConnector);
    expect(out.threadTitle).toBe("Inbound from Slack: C004");
  });
});
