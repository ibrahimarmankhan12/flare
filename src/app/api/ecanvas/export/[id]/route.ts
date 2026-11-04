import { getSession } from "auth/server";
import { canvasExportRepository } from "lib/db/repository";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const exported = await canvasExportRepository.selectByIdPublic(id);

    if (!exported) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(exported);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load export" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const hasAccess = await canvasExportRepository.checkAccess(
      id,
      session.user.id,
    );

    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await canvasExportRepository.revokeById(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to revoke export" },
      { status: 500 },
    );
  }
}
