import { getSession } from "auth/server";
import { chatExportRepository } from "lib/db/repository";
import { NextRequest, NextResponse } from "next/server";
import logger from "logger";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      logger.warn("Unauthorized comment deletion attempt - no session");
      return NextResponse.json(
        { error: "Unauthorized - Please sign in to delete comments" },
        { status: 401 },
      );
    }

    const { commentId } = await params;
    logger.info(
      `User ${session.user.id} attempting to delete comment ${commentId}`,
    );

    // Check if user has permission to delete this comment
    const hasAccess = await chatExportRepository.checkCommentAccess(
      commentId,
      session.user.id,
    );

    if (!hasAccess) {
      logger.warn(
        `User ${session.user.id} denied access to delete comment ${commentId}`,
      );
      return NextResponse.json(
        {
          error: "Forbidden - You don't have permission to delete this comment",
        },
        { status: 403 },
      );
    }

    await chatExportRepository.deleteComment(commentId, session.user.id);
    logger.info(
      `Successfully deleted comment ${commentId} by user ${session.user.id}`,
    );

    return NextResponse.json({
      success: true,
      message: "Comment deleted successfully",
    });
  } catch (error: any) {
    logger.error("Error deleting comment:", error);
    return NextResponse.json(
      { error: "Failed to delete comment - Please try again later" },
      { status: 500 },
    );
  }
}
