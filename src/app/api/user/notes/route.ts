import { getSession } from "auth/server";
import { userRepository } from "lib/db/repository";
import { NextRequest, NextResponse } from "next/server";
import { SavedNote, SavedNoteCitation, UserPreferences } from "app-types/user";

const MAX_NOTE_TITLE_LENGTH = 160;
const MAX_NOTE_MARKDOWN_LENGTH = 200_000;
const MAX_SAVED_NOTES = 300;

const sanitizeCitations = (value: unknown): SavedNoteCitation[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((citation, index) => {
      const item = citation as Partial<SavedNoteCitation> | undefined;
      const id =
        typeof item?.id === "number" && Number.isFinite(item.id)
          ? item.id
          : index + 1;
      const title =
        typeof item?.title === "string" ? item.title.trim() : "Untitled";
      const url = typeof item?.url === "string" ? item.url.trim() : "";

      if (!url) return null;
      return { id, title: title || url, url };
    })
    .filter((v): v is SavedNoteCitation => Boolean(v));
};

const normalizeSavedNotes = (value: unknown): SavedNote[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((note) => {
      const n = note as Partial<SavedNote> | undefined;
      const id = typeof n?.id === "string" ? n.id : "";
      const title = typeof n?.title === "string" ? n.title.trim() : "";
      const markdown = typeof n?.markdown === "string" ? n.markdown.trim() : "";
      const createdAt =
        typeof n?.createdAt === "string"
          ? n.createdAt
          : new Date().toISOString();
      const updatedAt =
        typeof n?.updatedAt === "string" ? n.updatedAt : createdAt;
      const citations = sanitizeCitations(n?.citations);

      if (!id || !title || !markdown) return null;
      return {
        id,
        title,
        markdown,
        createdAt,
        updatedAt,
        citations,
      };
    })
    .filter((v): v is SavedNote => Boolean(v))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

const getSavedNotesFromPreferences = (
  preferences: UserPreferences | null,
): SavedNote[] => {
  return normalizeSavedNotes(preferences?.savedNotes);
};

const updateSavedNotes = async (userId: string, notes: SavedNote[]) => {
  const preferences = await userRepository.getPreferences(userId);
  const nextPreferences: UserPreferences = {
    ...(preferences ?? {}),
    savedNotes: notes,
  };

  await userRepository.updatePreferences(userId, nextPreferences);
};

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const preferences = await userRepository.getPreferences(session.user.id);
    const notes = getSavedNotesFromPreferences(preferences);
    return NextResponse.json(notes);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch saved notes" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { title, markdown, citations } = await request.json();
    const noteTitle = typeof title === "string" ? title.trim() : "";
    const noteMarkdown = typeof markdown === "string" ? markdown.trim() : "";

    if (!noteTitle || !noteMarkdown) {
      return NextResponse.json(
        { error: "Title and markdown are required" },
        { status: 400 },
      );
    }

    if (noteTitle.length > MAX_NOTE_TITLE_LENGTH) {
      return NextResponse.json(
        {
          error: `Title is too long. Maximum ${MAX_NOTE_TITLE_LENGTH} characters.`,
        },
        { status: 400 },
      );
    }

    if (noteMarkdown.length > MAX_NOTE_MARKDOWN_LENGTH) {
      return NextResponse.json(
        {
          error: `Markdown is too long. Maximum ${MAX_NOTE_MARKDOWN_LENGTH} characters.`,
        },
        { status: 400 },
      );
    }

    const preferences = await userRepository.getPreferences(session.user.id);
    const existingNotes = getSavedNotesFromPreferences(preferences);
    const now = new Date().toISOString();
    const note: SavedNote = {
      id: crypto.randomUUID(),
      title: noteTitle,
      markdown: noteMarkdown,
      citations: sanitizeCitations(citations),
      createdAt: now,
      updatedAt: now,
    };

    const mergedNotes = [note, ...existingNotes].slice(0, MAX_SAVED_NOTES);
    await updateSavedNotes(session.user.id, mergedNotes);

    return NextResponse.json(note, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to save note" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, title, markdown, citations } = await request.json();
    const noteId = typeof id === "string" ? id.trim() : "";
    const noteTitle = typeof title === "string" ? title.trim() : "";
    const noteMarkdown = typeof markdown === "string" ? markdown.trim() : "";

    if (!noteId || !noteTitle || !noteMarkdown) {
      return NextResponse.json(
        { error: "ID, title, and markdown are required" },
        { status: 400 },
      );
    }

    const preferences = await userRepository.getPreferences(session.user.id);
    const notes = getSavedNotesFromPreferences(preferences);
    const targetIndex = notes.findIndex((note) => note.id === noteId);

    if (targetIndex === -1) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const updatedNote: SavedNote = {
      ...notes[targetIndex],
      title: noteTitle.slice(0, MAX_NOTE_TITLE_LENGTH),
      markdown: noteMarkdown.slice(0, MAX_NOTE_MARKDOWN_LENGTH),
      citations: sanitizeCitations(citations),
      updatedAt: new Date().toISOString(),
    };

    const nextNotes = [...notes];
    nextNotes[targetIndex] = updatedNote;
    await updateSavedNotes(session.user.id, nextNotes);

    return NextResponse.json(updatedNote);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update note" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const noteId = searchParams.get("id");
    if (!noteId) {
      return NextResponse.json(
        { error: "Note ID is required" },
        { status: 400 },
      );
    }

    const preferences = await userRepository.getPreferences(session.user.id);
    const notes = getSavedNotesFromPreferences(preferences);
    const nextNotes = notes.filter((note) => note.id !== noteId);

    if (nextNotes.length === notes.length) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    await updateSavedNotes(session.user.id, nextNotes);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete note" },
      { status: 500 },
    );
  }
}
