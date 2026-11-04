import ExportError from "@/components/export/error";
import { canvasExportRepository } from "lib/db/repository";

export default async function CanvasExportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const exported = await canvasExportRepository.selectByIdPublic(id);

  if (!exported) {
    return <ExportError message="This canvas export does not exist" />;
  }

  return (
    <div className="w-full min-h-screen bg-background">
      <header className="w-full border-b border-border px-4 py-3 md:px-6">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-base md:text-lg font-semibold truncate">
              {exported.title}
            </h1>
            <p className="text-xs text-muted-foreground">
              Shared canvas export
              {exported.exporterName ? ` · by ${exported.exporterName}` : ""}
            </p>
          </div>
          <a
            href={`/api/ecanvas/export/${exported.id}/zip`}
            className="text-xs md:text-sm underline underline-offset-4"
          >
            Download ZIP
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4 md:px-6 md:py-6">
        <iframe
          title={exported.title}
          srcDoc={exported.html}
          sandbox="allow-scripts allow-same-origin"
          className="w-full h-[calc(100vh-9rem)] rounded-md border border-border bg-white"
        />
      </main>
    </div>
  );
}
