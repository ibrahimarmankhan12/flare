import { NextResponse } from "next/server";

import { bugReportRepository } from "lib/db/repository";
import { getBugBountyProgram } from "lib/bug-bounty";

export async function GET() {
  try {
    const [program, leaderboard, stats] = await Promise.all([
      getBugBountyProgram(),
      bugReportRepository.leaderboard(10),
      bugReportRepository.stats(),
    ]);
    return NextResponse.json({ program, leaderboard, stats });
  } catch (err) {
    console.error("[BugBounty] program error", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}
