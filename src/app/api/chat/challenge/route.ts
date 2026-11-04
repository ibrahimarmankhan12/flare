import { getSession } from "auth/server";
import {
  createChatChallenge,
  resolveChatSecuritySessionIpAddress,
  resolveChatSecuritySessionId,
  resolveChatSecuritySessionUserAgent,
} from "lib/security/chat-request-guard.server";
import type { ChatChallengeRequestPayload } from "lib/security/chat-request-guard.shared";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  let clientBinding: ChatChallengeRequestPayload | null = null;
  try {
    const body = (await request.json()) as Partial<ChatChallengeRequestPayload>;
    if (
      typeof body?.clientId === "string" &&
      typeof body?.clientPublicKey === "string"
    ) {
      clientBinding = {
        clientId: body.clientId,
        clientPublicKey: body.clientPublicKey,
      };
    }
  } catch {
    // Ignore malformed body; validation runs in guard creation.
  }

  const challenge = await createChatChallenge({
    request,
    userId: session.user.id,
    sessionId: resolveChatSecuritySessionId(session),
    sessionIpAddress: resolveChatSecuritySessionIpAddress(session),
    sessionUserAgent: resolveChatSecuritySessionUserAgent(session),
    clientBinding,
  });

  if (!challenge.ok) {
    return Response.json(
      {
        code: challenge.code,
        message: challenge.message,
      },
      { status: challenge.status },
    );
  }

  return Response.json(challenge.data, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
