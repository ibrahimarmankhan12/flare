import { canvasExportRepository } from "lib/db/repository";
import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";

function sanitizeFileName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-_\s]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "canvas-export"
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const exported = await canvasExportRepository.selectByIdForZip(id);

    if (!exported || exported.revokedAt) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const zip = new JSZip();
    zip.file("index.html", exported.html);

    if (exported.scene) {
      zip.file("scene.json", JSON.stringify(exported.scene, null, 2));
    }

    zip.file(
      "metadata.json",
      JSON.stringify(
        {
          id: exported.id,
          title: exported.title,
          canvasId: exported.canvasId,
          createdAt: exported.createdAt,
          ...(exported.metadata ?? {}),
        },
        null,
        2,
      ),
    );

    const content = await zip.generateAsync({ type: "blob" });
    const safeName = sanitizeFileName(exported.title);

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to build export zip" },
      { status: 500 },
    );
  }
}
