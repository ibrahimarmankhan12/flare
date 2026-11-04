import { EmbedChat } from "@/components/embed-chat";
import { EmbedJwtError, verifyEmbedToken } from "auth/embed-jwt";
import {
  agentInstallRepository,
  embedSessionRepository,
} from "lib/db/repository";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function EmbedAgentPage({ params, searchParams }: Props) {
  const [{ agentId }, { token }] = await Promise.all([params, searchParams]);
  if (!agentId || !token) notFound();

  let payload: ReturnType<typeof verifyEmbedToken>;
  try {
    payload = verifyEmbedToken(token);
  } catch (error) {
    if (error instanceof EmbedJwtError) notFound();
    throw error;
  }

  if (payload.agentId !== agentId) notFound();

  const [session, agent] = await Promise.all([
    embedSessionRepository.getEmbedSessionByToken(payload.anonymousToken),
    agentInstallRepository.getPublishedAgent(agentId),
  ]);

  if (!agent) notFound();
  if (!session) notFound();
  if (session.id !== payload.sessionId) notFound();
  if (session.agentId !== payload.agentId) notFound();
  if (session.anonymousToken !== payload.anonymousToken) notFound();
  if (session.revokedAt) notFound();
  if (session.expiresAt.getTime() <= Date.now()) notFound();

  return (
    <EmbedChat
      agent={{
        id: agent.id,
        name: agent.name,
        description: agent.description ?? null,
        icon: agent.icon ?? null,
      }}
      token={token}
    />
  );
}
