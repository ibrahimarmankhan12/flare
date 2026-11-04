import { SavedNoteCitation } from "app-types/user";

const sanitizeFileName = (value: string) => {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const getNoteTitleFromMarkdown = (markdown: string) => {
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return "Saved Note";

  const firstLine = lines[0].replace(/^#+\s*/, "");
  if (firstLine.length === 0) return "Saved Note";
  return firstLine.slice(0, 120);
};

export const buildSavedNoteMarkdown = ({
  title,
  markdownBody,
  citations,
}: {
  title: string;
  markdownBody: string;
  citations: SavedNoteCitation[];
}) => {
  const now = new Date().toISOString();
  const body = markdownBody.trim();
  const safeTitle = title.trim() || getNoteTitleFromMarkdown(markdownBody);

  const sourceSection =
    citations.length > 0
      ? [
          "## Sources",
          ...citations.map(
            (citation, idx) =>
              `${idx + 1}. [${citation.title || citation.url}](${citation.url})`,
          ),
        ].join("\n")
      : "";

  return [
    `# ${safeTitle}`,
    "",
    `Saved from Flare on ${now}`,
    "",
    body,
    sourceSection ? `\n${sourceSection}` : "",
    "",
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    .concat("\n");
};

export const downloadMarkdownFile = ({
  title,
  markdown,
}: {
  title: string;
  markdown: string;
}) => {
  const fileNameBase = sanitizeFileName(title || "saved-note") || "saved-note";
  const fileName = `${fileNameBase}.md`;
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
