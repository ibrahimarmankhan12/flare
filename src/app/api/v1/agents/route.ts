import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { withApiKeyUsage } from "lib/auth/api-key";
import { agentRepository } from "lib/db/repository";

export const dynamic = "force-dynamic";

export const GET = withApiKeyUsage(
  { scope: "agents:read", route: "/api/v1/agents" },
  async (_request, { apiKey }) => {
    try {
      const agents = await agentRepository.selectAgentsByUserId(apiKey.userId);
      return Response.json({ agents });
    } catch (err) {
      return new Response(handleError(err), { status: 500 });
    }
  },
);
