import { COMMUNITY_POST_TYPES } from "app-types/community";
import { getSession } from "auth/server";
import {
  createCommunityPost,
  getCommunityErrorResponse,
} from "lib/community/server";
import { z } from "zod";

const CreatePostSchema = z.object({
  type: z.enum(COMMUNITY_POST_TYPES),
  content: z.string().trim().min(1).max(5000),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  media: z
    .object({
      url: z.string().url(),
      name: z.string().min(1),
      contentType: z.string().min(1),
      size: z.number().nonnegative(),
    })
    .optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = CreatePostSchema.parse(await request.json());
    const post = await createCommunityPost({
      authorId: session.user.id,
      authorName: session.user.name || "Flare User",
      authorAvatar: session.user.image,
      type: body.type,
      content: body.content,
      media: body.media,
      tags: body.tags,
    });

    return Response.json({ success: true, post }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid post payload", details: error.issues },
        { status: 400 },
      );
    }

    console.error("Failed to create community post", error);
    return getCommunityErrorResponse(error);
  }
}
