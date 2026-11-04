import { ChatExportByThreadIdSchema } from "app-types/chat-export";
import { getSession } from "auth/server";
import { chatExportRepository, chatRepository } from "lib/db/repository";
import logger from "logger";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { threadId, expiresAt } =
      await ChatExportByThreadIdSchema.parse(body);

    const session = await getSession();
    if (!session?.user?.id) {
      logger.warn("Unauthorized export attempt - no session");
      return new Response("Unauthorized - Please sign in to export chats", {
        status: 401,
      });
    }

    logger.info(
      `User ${session.user.id} attempting to export thread ${threadId}`,
    );

    const isAccess = await chatRepository.checkAccess(
      threadId,
      session.user.id,
    );
    if (!isAccess) {
      logger.warn(
        `User ${session.user.id} denied access to thread ${threadId}`,
      );
      return new Response(
        "Unauthorized - You don't have permission to export this chat",
        { status: 401 },
      );
    }

    const exportId = await chatExportRepository.exportChat({
      threadId,
      exporterId: session.user.id,
      expiresAt: expiresAt ?? undefined,
    });

    logger.info(
      `Successfully exported thread ${threadId} by user ${session.user.id}, export ID: ${exportId}`,
    );
    return Response.json({
      message: "Chat exported successfully",
      exportId,
    });
  } catch (error: any) {
    logger.error("Error exporting chat:", error);
    if (error.name === "ZodError") {
      return new Response("Invalid request data - Please check your input", {
        status: 400,
      });
    }
    return new Response("Failed to export chat - Please try again later", {
      status: 500,
    });
  }
}
