import { getSession } from "auth/server";
import { memoryRepository } from "lib/db/repository";
import { enrichMemoriesWithSource } from "lib/ai/memory/memory-source";
import { NextRequest, NextResponse } from "next/server";

// GET /api/user/memory — list all memories, enriched with source-message
// preview (when applicable) for the settings UI.
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const raw = await memoryRepository.getAll(session.user.id);
    const memories = await enrichMemoriesWithSource(raw, session.user.id);
    return NextResponse.json(memories);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch memories" },
      { status: 500 },
    );
  }
}

// POST /api/user/memory — create a memory
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { content, category } = await request.json();
    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 },
      );
    }
    const memory = await memoryRepository.create({
      userId: session.user.id,
      content: content.trim(),
      category: category?.trim() || undefined,
    });
    return NextResponse.json(memory, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create memory" },
      { status: 500 },
    );
  }
}

// PUT /api/user/memory — update a memory
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, content, category } = await request.json();
    if (!id || !content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "ID and content are required" },
        { status: 400 },
      );
    }
    const memory = await memoryRepository.update(id, session.user.id, {
      content: content.trim(),
      category: category?.trim() || undefined,
    });
    if (!memory) {
      return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    }
    return NextResponse.json(memory);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update memory" },
      { status: 500 },
    );
  }
}

// DELETE /api/user/memory — delete a memory (or all)
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const all = searchParams.get("all");

    if (all === "true") {
      const count = await memoryRepository.deleteAll(session.user.id);
      return NextResponse.json({ deleted: count });
    }

    if (!id) {
      return NextResponse.json(
        { error: "Memory ID is required" },
        { status: 400 },
      );
    }
    const deleted = await memoryRepository.delete(id, session.user.id);
    if (!deleted) {
      return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete memory" },
      { status: 500 },
    );
  }
}
