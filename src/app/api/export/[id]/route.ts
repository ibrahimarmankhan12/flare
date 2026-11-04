import { getSession } from "auth/server";
import { chatExportRepository } from "lib/db/repository";
import { NextRequest, NextResponse } from "next/server";
import logger from "logger";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      logger.warn("Unauthorized export deletion attempt - no session");
      return NextResponse.json(
        { error: "Unauthorized - Please sign in to delete exports" },
        { status: 401 },
      );
    }

    const { id } = await params;
    logger.info(`User ${session.user.id} attempting to delete export ${id}`);

    // Check if user has permission to delete this export
    const hasAccess = await chatExportRepository.checkAccess(
      id,
      session.user.id,
    );

    if (!hasAccess) {
      logger.warn(
        `User ${session.user.id} denied access to delete export ${id}`,
      );
      return NextResponse.json(
        {
          error: "Forbidden - You don't have permission to delete this export",
        },
        { status: 403 },
      );
    }

    await chatExportRepository.deleteById(id);
    logger.info(`Successfully deleted export ${id} by user ${session.user.id}`);

    return NextResponse.json({
      success: true,
      message: "Export deleted successfully",
    });
  } catch (error: any) {
    logger.error("Error deleting export:", error);
    return NextResponse.json(
      { error: "Failed to delete export - Please try again later" },
      { status: 500 },
    );
  }
}
