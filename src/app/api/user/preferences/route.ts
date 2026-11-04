import { getSession } from "auth/server";
import { UserPreferencesZodSchema } from "app-types/user";
import { userRepository } from "lib/db/repository";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export async function GET() {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const preferences = await userRepository.getPreferences(session.user.id);
    return NextResponse.json(preferences ?? {});
  } catch (error) {
    console.error("Failed to get user preferences", error);
    return NextResponse.json(
      { error: "Failed to get preferences" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const json = await request.json();
    const preferences = UserPreferencesZodSchema.parse(json);
    const existingPreferences = await userRepository.getPreferences(
      session.user.id,
    );
    const mergedPreferences = {
      ...(existingPreferences ?? {}),
      ...preferences,
    };
    const updatedUser = await userRepository.updatePreferences(
      session.user.id,
      mergedPreferences,
    );
    return NextResponse.json({
      success: true,
      preferences: updatedUser.preferences,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid preferences payload" },
        { status: 400 },
      );
    }

    console.error("Failed to update user preferences", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 },
    );
  }
}
