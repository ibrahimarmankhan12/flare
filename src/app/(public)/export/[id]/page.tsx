import ExportError from "@/components/export/error";
import { chatExportRepository } from "lib/db/repository";
import ChatPreview from "@/components/export/chat-preview";
import { getUserId } from "@/app/api/chat/actions";
import { Metadata } from "next";
import { getBaseUrl } from "lib/const";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const thread = await chatExportRepository.selectByIdWithUser(id);

  if (!thread) {
    return {
      title: "Chat Not Found | Flare AI",
      description: "This exported chat does not exist or has been removed.",
    };
  }

  const title = thread.title || "Shared Chat";
  const authorName = thread.exporterName || "Anonymous";
  const description = `${title} - Shared by ${authorName} on Flare AI`;
  const baseUrl = getBaseUrl();
  const ogImageUrl = `${baseUrl}/api/export/${id}/og-image`;

  return {
    title: `${title} | Flare AI`,
    description,
    authors: [{ name: authorName }],
    openGraph: {
      title: `${title}`,
      description: `Shared by ${authorName} on Flare AI`,
      type: "article",
      url: `${baseUrl}/export/${id}`,
      siteName: "Flare AI",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title}`,
      description: `Shared by ${authorName} on Flare AI`,
      images: [ogImageUrl],
    },
  };
}

export default async function ExportPage({ params }: Props) {
  const { id } = await params;
  const isExpired = await chatExportRepository.isExpired(id);
  if (isExpired) {
    return <ExportError message="This export has expired" />;
  }
  const thread = await chatExportRepository.selectByIdWithUser(id);
  if (!thread) {
    return <ExportError message="This export does not exist" />;
  }

  const userId = await getUserId().catch(() => undefined);

  const comments = userId
    ? await chatExportRepository.selectCommentsByExportId(id, userId)
    : [];

  return <ChatPreview thread={thread} comments={comments} />;
}
