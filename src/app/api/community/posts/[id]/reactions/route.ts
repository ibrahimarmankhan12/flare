import { getSession } from "auth/server";
import {
  getCommunityErrorResponse,
  incrementCommunityShare,
  setCommunityReaction,
} from "lib/community/server";
import { z } from "zod";

const ReactionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["like", "bookmark"]),
    active: z.boolean(),
  }),
  z.object({
    type: z.literal("share"),
  }),
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = ReactionSchema.parse(await request.json());

    if (body.type === "share") {
      await incrementCommunityShare(id);
    } else {
      await setCommunityReaction({
        postId: id,
        userId: session.user.id,
        type: body.type,
        active: body.active,
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid reaction payload", details: error.issues },
        { status: 400 },
      );
    }

    console.error("Failed to update community reaction", error);
    return getCommunityErrorResponse(error);
  }
}
