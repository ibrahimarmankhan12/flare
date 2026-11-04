import { TipTapMentionJsonContent } from "app-types/util";
import { getUserId } from "../actions";
import { ChatExportCommentCreateSchema } from "app-types/chat-export";
import { chatExportRepository } from "lib/db/repository";
import logger from "logger";

export async function addExportChatCommentAction(data: {
  exportId: string;
  content: TipTapMentionJsonContent;
  parentId?: string;
}) {
  try {
    const userId = await getUserId();
    logger.info(`User ${userId} adding comment to export ${data.exportId}`);

    const validatedData = ChatExportCommentCreateSchema.parse({
      ...data,
      authorId: userId,
    });

    const comment = await chatExportRepository.insertComment(validatedData);
    logger.info(
      `Successfully added comment ${comment.id} to export ${data.exportId}`,
    );
    return comment;
  } catch (error: any) {
    logger.error("Error adding export comment:", error);
    throw new Error("Failed to add comment - Please try again later");
  }
}
