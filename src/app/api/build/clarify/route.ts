import "server-only";

import { handleError } from "@/app/api/chat/shared.chat";
import { getSession } from "auth/server";
import { clarifyPrompt } from "lib/sandbox/runner";
import { z } from "zod";

// POST /api/build/clarify — ask whether a prompt is specific enough to build,
// and get back questions if it is not. No sandbox is created, so this is cheap
// and safe to call before every build.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({ prompt: z.string().min(1).max(4000) });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    return Response.json(await clarifyPrompt(parsed.data.prompt));
  } catch (err) {
    return new Response(handleError(err), { status: 500 });
  }
}
