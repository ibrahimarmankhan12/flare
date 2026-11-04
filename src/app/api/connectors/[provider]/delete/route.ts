import { NextRequest, NextResponse } from "next/server";
import { pgDb as db } from "lib/db/pg/db.pg";
import { UserConnectorTable } from "lib/db/pg/schema.pg";
import { eq, and } from "drizzle-orm";
import { getSession } from "auth/server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { provider } = await params;

    await db
      .delete(UserConnectorTable)
      .where(
        and(
          eq(UserConnectorTable.userId, session.user.id),
          eq(
            UserConnectorTable.provider,
            provider as "gmail" | "outlook" | "slack" | "notion" | "github",
          ),
        ),
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting connector:", error);
    return NextResponse.json(
      { error: "Failed to delete connector" },
      { status: 500 },
    );
  }
}
