import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { withApiKeyUsage } from "lib/auth/api-key";
import { chatRepository } from "lib/db/repository";
import { z } from "zod";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const patchBodySchema = z.object({
  title: z.string().min(1).max(255).optional(),
});

export async function GET(request: Request, { params }: RouteParams) {
  return withApiKeyUsage(
    {
      scope: "threads:read",
      route: "/api/v1/threads/[id]",
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
        const thread = await chatRepository.selectThread(id);
        if (!thread) {
          return new Response("Not found", { status: 404 });
        }
        return Response.json({ thread });
      } catch (err) {
        return new Response(handleError(err), { status: 500 });
      }
    },
  )(request);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  return withApiKeyUsage(
    {
      scope: "threads:write",
      route: "/api/v1/threads/[id]",
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

      const parsed = patchBodySchema.safeParse(raw);
      if (!parsed.success) {
        return new Response(
          parsed.error.issues
            .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
            .join("; "),
          { status: 400 },
        );
      }
      if (parsed.data.title === undefined) {
        return new Response("`title` is required", { status: 400 });
      }

      try {
        const hasAccess = await chatRepository.checkAccess(id, apiKey.userId);
        if (!hasAccess) {
          return new Response("Not found", { status: 404 });
        }
        const updated = await chatRepository.updateThread(id, {
          title: parsed.data.title,
        });
        return Response.json({ thread: updated });
      } catch (err) {
        return new Response(handleError(err), { status: 500 });
      }
    },
  )(request);
}

export async function DELETE(request: Request, { params }: RouteParams) {
  return withApiKeyUsage(
    {
      scope: "threads:write",
      route: "/api/v1/threads/[id]",
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
        await chatRepository.deleteThread(id);
        return new Response(null, { status: 204 });
      } catch (err) {
        return new Response(handleError(err), { status: 500 });
      }
    },
  )(request);
}
