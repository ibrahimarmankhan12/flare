import { getSession } from "auth/server";
import { chatExportRepository } from "lib/db/repository";
import { ChatExportCommentCreateSchema } from "app-types/chat-export";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/app/api/chat/actions";
import logger from "logger";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    logger.info(`Fetching comments for export ${id}`);

    const userId = await getUserId().catch(() => undefined);

    const comments = await chatExportRepository.selectCommentsByExportId(
      id,
      userId,
    );
    logger.info(
      `Successfully retrieved ${comments.length} comments for export ${id}`,
    );
    return NextResponse.json(comments);
  } catch (error: any) {
    logger.error(`Error fetching comments for export:`, error);
    return NextResponse.json(
      { error: "Failed to load comments - Please try again later" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      logger.warn("Unauthorized comment creation attempt - no session");
      return NextResponse.json(
        { error: "Unauthorized - Please sign in to add comments" },
        { status: 401 },
      );
    }

    const { id } = await params;
    const body = await request.json();
    logger.info(
      `User ${session.user.id} attempting to create comment on export ${id}`,
    );

    const validatedData = ChatExportCommentCreateSchema.parse({
      exportId: id,
      authorId: session.user.id,
      parentId: body.parentId,
      content: body.content,
    });

    const comment = await chatExportRepository.insertComment(validatedData);
    logger.info(
      `Successfully created comment ${comment.id} on export ${id} by user ${session.user.id}`,
    );

    return NextResponse.json({ success: true, comment });
  } catch (error: any) {
    logger.error("Error creating comment:", error);
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid comment data - Please check your input" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Failed to create comment - Please try again later" },
      { status: 500 },
    );
  }
}
