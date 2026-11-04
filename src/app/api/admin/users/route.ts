import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "lib/auth/permissions";
import pgAdminRepository from "lib/db/pg/repositories/admin-respository.pg";

const BulkActionSchema = z.object({
  action: z.enum(["suspend", "delete"]),
  userIds: z.array(z.string().uuid()).min(1),
});

export async function POST(request: Request) {
  try {
    await requireAdminPermission("manage users");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const parsed = BulkActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 },
      );
    }

    const { action, userIds } = parsed.data;

    if (action === "suspend") {
      await pgAdminRepository.suspendUsers(userIds);
    } else if (action === "delete") {
      await pgAdminRepository.deleteUsers(userIds);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Bulk user action error", e);
    return NextResponse.json(
      { success: false, error: "Action failed" },
      { status: 500 },
    );
  }
}