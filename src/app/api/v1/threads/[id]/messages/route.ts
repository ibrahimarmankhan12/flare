import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { withApiKeyUsage } from "lib/auth/api-key";
import { chatRepository } from "lib/db/repository";
import { generateUUID } from "lib/utils";
import { z } from "zod";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const createBodySchema = z.object({
  content: z.string().min(1, "content is required"),
  role: z.enum(["user", "assistant"]).default("user"),
});

export async function GET(request: Request, { params }: RouteParams) {
  return withApiKeyUsage(
    {
      scope: "threads:read",
      route: "/api/v1/threads/[id]/messages",
      getParams: () => params,
    },
    async (_request, { apiKey, params: resolvedParams }) => {
      const id = resolvedParams?.id;
      if (!id) {
        return new Response("Missing id", { status: 400 });
      }

      try {
        const hasAccess = await chatRepository.checkAccess(id, apiKey.userId);
        if (!hasAccess) {
          return new Response("Not found", { status: 404 });
        }
        const messages = await chatRepository.selectMessagesByThreadId(id);
        return Response.json({ messages });
      } catch (err) {
        return new Response(handleError(err), { status: 500 });
      }
    },
  )(request);
}

export async function POST(request: Request, { params }: RouteParams) {
  return withApiKeyUsage(
    {
      scope: "messages:write",
      route: "/api/v1/threads/[id]/messages",
      getParams: () => params,
    },
    async (request, { apiKey, params: resolvedParams }) => {
      const id = resolvedParams?.id;
      if (!id) {
        return new Response("Missing id", { status: 400 });
      }

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
        const hasAccess = await chatRepository.checkAccess(id, apiKey.userId);
        if (!hasAccess) {
          return new Response("Not found", { status: 404 });
        }
        const created = await chatRepository.insertMessage({
          id: generateUUID(),
          threadId: id,
          role: parsed.data.role,
          parts: [{ type: "text", text: parsed.data.content }],
        });
        return Response.json({ message: created }, { status: 201 });
      } catch (err) {
        return new Response(handleError(err), { status: 500 });
      }
    },
  )(request);
}
