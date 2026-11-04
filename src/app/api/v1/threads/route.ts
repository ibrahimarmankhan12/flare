import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { withApiKeyUsage } from "lib/auth/api-key";
import { chatRepository } from "lib/db/repository";
import { generateUUID } from "lib/utils";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createBodySchema = z.object({
  title: z.string().min(1, "title is required").max(255, "title too long"),
  agentId: z.string().optional(),
});

export const GET = withApiKeyUsage(
  { scope: "threads:read", route: "/api/v1/threads" },
  async (_request, { apiKey }) => {
    try {
      const threads = await chatRepository.selectThreadsByUserId(apiKey.userId);
      return Response.json({ threads });
    } catch (err) {
      return new Response(handleError(err), { status: 500 });
    }
  },
);

export const POST = withApiKeyUsage(
  { scope: "threads:write", route: "/api/v1/threads" },
  async (request, { apiKey }) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }

    const parsed = createBodySchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        parsed.error.issues
          .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
          .join("; "),
        { status: 400 },
      );
    }

    try {
      const created = await chatRepository.insertThread({
        id: generateUUID(),
        title: parsed.data.title,
        userId: apiKey.userId,
      });
      return Response.json(created, { status: 201 });
    } catch (err) {
      return new Response(handleError(err), { status: 500 });
    }
  },
);
