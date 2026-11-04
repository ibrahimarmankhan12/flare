import { getSession } from "auth/server";
import { chatExportRepository } from "lib/db/repository";
import { NextResponse } from "next/server";
import logger from "logger";

export async function GET() {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      logger.warn("Unauthorized access attempt to export list");
      return NextResponse.json(
        { error: "Unauthorized - Please sign in to access your exports" },
        { status: 401 },
      );
    }

    logger.info(`Fetching exports for user: ${session.user.id}`);
    const exports = await chatExportRepository.selectSummaryByExporterId(
      session.user.id,
    );
    logger.info(
      `Successfully retrieved ${exports.length} exports for user: ${session.user.id}`,
    );
    return NextResponse.json(exports);
  } catch (error: any) {
    logger.error("Error retrieving exports:", error);
    return NextResponse.json(
      { error: "Failed to retrieve your exports. Please try again later." },
      { status: 500 },
    );
  }
}
