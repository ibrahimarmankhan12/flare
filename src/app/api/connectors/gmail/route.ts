import { NextRequest, NextResponse } from "next/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getSession } from "auth/server";
import { refreshConnectorToken } from "lib/connectors/refresh";

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  isUnread: boolean;
  labels: string[];
}

interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
}

interface GmailMessageResponse {
  id: string;
  threadId: string;
  snippet: string;
  labelIds?: string[];
  payload: {
    headers: { name: string; value: string }[];
    body?: { data?: string };
    parts?: {
      mimeType: string;
      body?: { data?: string };
      parts?: { mimeType: string; body?: { data?: string } }[];
    }[];
  };
}

async function refreshTokenIfNeeded(
  connector: typeof UserConnectorTable.$inferSelect,
) {
  // Delegate to the shared helper so admin-config credentials are honored
  // alongside env vars.
  const accessToken = await refreshConnectorToken("gmail", connector);
  if (!accessToken) {
    throw new Error("Unable to refresh token - missing credentials or refresh token");
  }
  return accessToken;
}

function getHeader(
  headers: { name: string; value: string }[],
  name: string,
): string {
  return (
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
    ""
  );
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function getMessageBody(payload: GmailMessageResponse["payload"]): string {
  // Try direct body
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Try parts
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      if (part.mimeType === "text/html" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      // Nested parts (multipart/alternative inside multipart/mixed)
      if (part.parts) {
        for (const nestedPart of part.parts) {
          if (nestedPart.mimeType === "text/plain" && nestedPart.body?.data) {
            return decodeBase64Url(nestedPart.body.data);
          }
        }
      }
    }
  }

  return "";
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "inbox";
    const maxResults = parseInt(searchParams.get("maxResults") || "10");
    const messageId = searchParams.get("messageId");
    const query = searchParams.get("q") || "";

    const connector = await db
      .select()
      .from(UserConnectorTable)
      .where(
        and(
          eq(UserConnectorTable.userId, session.user.id),
          eq(UserConnectorTable.provider, "gmail"),
        ),
      )
      .limit(1);

    if (connector.length === 0 || !connector[0].isConnected) {
      return NextResponse.json(
        {
          error:
            "Gmail is not connected. Please connect your Gmail account first.",
        },
        { status: 400 },
      );
    }

    const accessToken = await refreshTokenIfNeeded(connector[0]);

    if (action === "read" && messageId) {
      // Get single message details
      const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      if (!msgResponse.ok) {
        throw new Error("Failed to fetch message");
      }

      const msgData: GmailMessageResponse = await msgResponse.json();
      const body = getMessageBody(msgData.payload);

      return NextResponse.json({
        message: {
          id: msgData.id,
          threadId: msgData.threadId,
          subject: getHeader(msgData.payload.headers, "Subject"),
          from: getHeader(msgData.payload.headers, "From"),
          to: getHeader(msgData.payload.headers, "To"),
          date: getHeader(msgData.payload.headers, "Date"),
          body,
          isUnread: msgData.labelIds?.includes("UNREAD") || false,
        },
      });
    }

    // List messages (inbox)
    let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`;
    if (query) {
      url += `&q=${encodeURIComponent(query)}`;
    } else {
      url += "&q=in:inbox";
    }

    const listResponse = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!listResponse.ok) {
      throw new Error("Failed to fetch messages");
    }

    const listData: GmailListResponse = await listResponse.json();

    if (!listData.messages || listData.messages.length === 0) {
      return NextResponse.json({ messages: [] });
    }

    // Fetch details for each message
    const messages: GmailMessage[] = await Promise.all(
      listData.messages.map(async (msg) => {
        const msgResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        const msgData: GmailMessageResponse = await msgResponse.json();

        return {
          id: msgData.id,
          threadId: msgData.threadId,
          snippet: msgData.snippet,
          subject: getHeader(msgData.payload.headers, "Subject"),
          from: getHeader(msgData.payload.headers, "From"),
          to: getHeader(msgData.payload.headers, "To"),
          date: getHeader(msgData.payload.headers, "Date"),
          isUnread: msgData.labelIds?.includes("UNREAD") || false,
          labels: msgData.labelIds || [],
        };
      }),
    );

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Gmail API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch emails",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, to, subject, message, threadId, messageId } = body;

    const connector = await db
      .select()
      .from(UserConnectorTable)
      .where(
        and(
          eq(UserConnectorTable.userId, session.user.id),
          eq(UserConnectorTable.provider, "gmail"),
        ),
      )
      .limit(1);

    if (connector.length === 0 || !connector[0].isConnected) {
      return NextResponse.json(
        { error: "Gmail is not connected" },
        { status: 400 },
      );
    }

    const accessToken = await refreshTokenIfNeeded(connector[0]);
    const fromEmail = connector[0].email;

    if (action === "send" || action === "compose") {
      // Compose and send a new email
      const emailLines = [
        `From: ${fromEmail}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        "Content-Type: text/html; charset=utf-8",
        "",
        message,
      ];

      const rawEmail = Buffer.from(emailLines.join("\r\n"))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const sendResponse = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: rawEmail }),
        },
      );

      if (!sendResponse.ok) {
        const errorText = await sendResponse.text();
        console.error("Send email failed:", errorText);
        throw new Error("Failed to send email");
      }

      const sendData = await sendResponse.json();
      return NextResponse.json({ success: true, messageId: sendData.id });
    }

    if (action === "reply") {
      // Reply to an existing email
      if (!messageId) {
        return NextResponse.json(
          { error: "messageId is required for reply" },
          { status: 400 },
        );
      }

      // Get original message for headers
      const origResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Message-ID`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      if (!origResponse.ok) {
        throw new Error("Failed to fetch original message");
      }

      const origData: GmailMessageResponse = await origResponse.json();
      const origSubject = getHeader(origData.payload.headers, "Subject");
      const origFrom = getHeader(origData.payload.headers, "From");
      const origMessageId = getHeader(origData.payload.headers, "Message-ID");

      const replySubject = origSubject.startsWith("Re:")
        ? origSubject
        : `Re: ${origSubject}`;
      const replyTo = to || origFrom;

      const emailLines = [
        `From: ${fromEmail}`,
        `To: ${replyTo}`,
        `Subject: ${replySubject}`,
        `In-Reply-To: ${origMessageId}`,
        `References: ${origMessageId}`,
        "Content-Type: text/html; charset=utf-8",
        "",
        message,
      ];

      const rawEmail = Buffer.from(emailLines.join("\r\n"))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const sendResponse = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: rawEmail, threadId }),
        },
      );

      if (!sendResponse.ok) {
        const errorText = await sendResponse.text();
        console.error("Reply failed:", errorText);
        throw new Error("Failed to send reply");
      }

      const sendData = await sendResponse.json();
      return NextResponse.json({ success: true, messageId: sendData.id });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Gmail API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to process request",
      },
      { status: 500 },
    );
  }
}
