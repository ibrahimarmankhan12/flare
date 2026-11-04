import { describe, expect, it } from "vitest";

import {
  type MailgunPayload,
  type SendGridParsePayload,
  type SesPayload,
  parseEmailPayload,
} from "./email";

describe("parseEmailPayload", () => {
  describe("sendgrid", () => {
    it("parses a urlencoded form body", () => {
      const body =
        "from=Alice+%3Calice%40example.com%3E&to=inbox%40example.com&subject=Hi&text=Hello+there&html=%3Cp%3EHi%3C%2Fp%3E&message_id=msg-1&spam_score=0.1";
      const out = parseEmailPayload(
        "sendgrid",
        body,
        "application/x-www-form-urlencoded",
      );
      expect(out.provider).toBe("sendgrid");
      const sg = out as SendGridParsePayload;
      expect(sg.from).toBe("Alice <alice@example.com>");
      expect(sg.to).toBe("inbox@example.com");
      expect(sg.subject).toBe("Hi");
      expect(sg.text).toBe("Hello there");
      expect(sg.html).toBe("<p>Hi</p>");
      expect(sg.messageId).toBe("msg-1");
      expect(sg.spamScore).toBe(0.1);
    });

    it("parses a JSON envelope", () => {
      const body = JSON.stringify({
        from: "Bob <bob@example.com>",
        to: "inbox@example.com",
        subject: "Hello JSON",
        text: "json body",
        message_id: "msg-2",
      });
      const out = parseEmailPayload("sendgrid", body, "application/json");
      expect(out.provider).toBe("sendgrid");
      const sg = out as SendGridParsePayload;
      expect(sg.subject).toBe("Hello JSON");
      expect(sg.text).toBe("json body");
    });

    it("throws on an empty body", () => {
      expect(() =>
        parseEmailPayload("sendgrid", "", "application/json"),
      ).toThrow(/empty/i);
    });
  });

  describe("ses", () => {
    it("parses an SNS-wrapped SES notification", () => {
      const body = JSON.stringify({
        Type: "Notification",
        MessageId: "sns-1",
        Message: JSON.stringify({
          mail: {
            messageId: "ses-msg-1",
            source: "carol@example.com",
            destination: ["inbox@example.com"],
            commonHeaders: { subject: "SES subject" },
          },
          content: { data: "SES plain body" },
          receipt: { timestamp: "2026-06-01T10:00:00Z" },
        }),
      });
      const out = parseEmailPayload("ses", body, "application/json");
      expect(out.provider).toBe("ses");
      const ses = out as SesPayload;
      expect(ses.messageId).toBe("ses-msg-1");
      expect(ses.from).toBe("carol@example.com");
      expect(ses.to).toEqual(["inbox@example.com"]);
      expect(ses.subject).toBe("SES subject");
      expect(ses.text).toBe("SES plain body");
      expect(ses.receivedAt).toBe("2026-06-01T10:00:00Z");
    });

    it("extracts the text part from a multi-part content block", () => {
      const body = JSON.stringify({
        mail: {
          messageId: "ses-msg-2",
          source: "dan@example.com",
          destination: ["inbox@example.com"],
          commonHeaders: { subject: "Multipart" },
        },
        content: {
          parts: [
            {
              contentType: "text/html",
              content: { data: "<p>html</p>" },
            },
            {
              contentType: "text/plain",
              content: { data: "plain text part" },
            },
          ],
        },
      });
      const out = parseEmailPayload("ses", body, "application/json");
      const ses = out as SesPayload;
      expect(ses.text).toBe("plain text part");
      expect(ses.html).toBe("<p>html</p>");
    });

    it("throws on a missing mail payload", () => {
      const body = JSON.stringify({ Type: "Notification" });
      expect(() =>
        parseEmailPayload("ses", body, "application/json"),
      ).toThrow();
    });
  });

  describe("mailgun", () => {
    it("parses a urlencoded form body", () => {
      const body =
        "recipient=inbox%40example.com&from=eve%40example.com&subject=Mailgun+subject&body-plain=plain+body&body-html=%3Cp%3Ehtml%3C%2Fp%3E&Message-Id=%3Cid-1%40mailgun.org%3E&X-Mailgun-Sscore=0.7";
      const out = parseEmailPayload(
        "mailgun",
        body,
        "application/x-www-form-urlencoded",
      );
      expect(out.provider).toBe("mailgun");
      const mg = out as MailgunPayload;
      expect(mg.to).toBe("inbox@example.com");
      expect(mg.from).toBe("eve@example.com");
      expect(mg.subject).toBe("Mailgun subject");
      expect(mg.text).toBe("plain body");
      expect(mg.html).toBe("<p>html</p>");
      expect(mg.messageId).toBe("<id-1@mailgun.org>");
      expect(mg.spamScore).toBe(0.7);
    });

    it("parses a JSON envelope", () => {
      const body = JSON.stringify({
        recipient: "inbox@example.com",
        from: "frank@example.com",
        subject: "JSON subject",
        "body-plain": "json plain",
        MessageId: "msg-mg-json",
      });
      const out = parseEmailPayload("mailgun", body, "application/json");
      const mg = out as MailgunPayload;
      expect(mg.from).toBe("frank@example.com");
      expect(mg.subject).toBe("JSON subject");
      expect(mg.text).toBe("json plain");
      expect(mg.messageId).toBe("msg-mg-json");
    });
  });

  it("rejects an unsupported provider", () => {
    expect(() =>
      parseEmailPayload(
        "unknown" as unknown as "sendgrid",
        "{}",
        "application/json",
      ),
    ).toThrow(/unsupported/i);
  });
});
