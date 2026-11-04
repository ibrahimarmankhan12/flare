import { CanvasExportCreateRequestSchema } from "app-types/canvas-export";
import { getSession } from "auth/server";
import { canvasExportRepository } from "lib/db/repository";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const exports = await canvasExportRepository.selectSummaryByExporterId(
      session.user.id,
    );

    return NextResponse.json(exports);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to list canvas exports" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = CanvasExportCreateRequestSchema.parse(await request.json());

    const id = await canvasExportRepository.insert({
      exporterId: session.user.id,
      canvasId: body.canvasId,
      title: body.title ?? `Canvas ${body.canvasId}`,
      html: body.html,
      scene: body.scene,
      metadata: body.metadata,
    });

    return NextResponse.json({
      id,
      url: `/canvas/export/${id}`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create canvas export" },
      { status: 500 },
    );
  }
}
